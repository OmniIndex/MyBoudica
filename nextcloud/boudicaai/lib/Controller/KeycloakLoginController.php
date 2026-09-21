<?php

declare(strict_types=1);

namespace OCA\BoudicaAi\Controller;

use GuzzleHttp\Client;
use OCA\BoudicaAi\Service\KeycloakProvisioningService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\Attribute\FrontpageRoute;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\Attribute\OpenAPI;
use OCP\AppFramework\Http\Attribute\PublicPage;
use OCP\AppFramework\Http\RedirectResponse;
use OCP\AppFramework\Http\Response;
use OCP\AppFramework\Http\TemplateResponse;
use OCP\IConfig;
use OCP\IRequest;
use OCP\ISession;
use OCP\IURLGenerator;
use OCP\IUser;
use OCP\IUserManager;
use OCP\Security\ISecureRandom;
use Psr\Log\LoggerInterface;

/**
 * Bridges Nextcloud login to the SAME Keycloak-JIT-provisioning mechanism
 * already live for the standalone chat interface
 * (chat_interface/scripts/saml-auth.js -> /cgi-bin/provision_check ->
 * boudislm.provision_user()) instead of building a second, parallel gate.
 * No changes to that C++/SQL side were needed - this only adds a Nextcloud
 * entry point onto it.
 *
 * Both internal calls here (Keycloak token endpoint, provision_check,
 * beta/signup via KeycloakProvisioningService) are plain http:// on the
 * boudica_shared Docker network shared with boudica_slm's own multiuser
 * stack - no TLS/self-signed-cert handling needed for either.
 *
 * Type-hints the CONCRETE \OC\User\Session rather than OCP\IUserSession -
 * confirmed live this is required: OCP\IUserSession::login() alone marks
 * the in-memory/PHP-session state as logged in (verified via debug
 * logging - isLoggedIn() and getUser() both correct immediately
 * afterwards, session data genuinely written to Redis), but does NOT
 * create the oc_authtoken row that OC\User\Session::createSessionToken()
 * creates - the same public::IUserSession has no such method at all in
 * this Nextcloud version, only the private concrete class does (used
 * internally by OC\Authentication\Login\CreateSessionTokenCommand, part of
 * the login form's own full command chain, LoginController never calls
 * bare login() alone either). Without that token row, the NEXT request
 * treats the session as invalid and forcibly clears it - reproduced live
 * as a real bug: login() succeeded, the browser got redirected to
 * /apps/files/, and the very next request came back 401 with Nextcloud
 * actively deleting nc_username/nc_token/nc_session_id cookies. Same
 * pattern real SSO bridge apps (user_saml, sociallogin) use for exactly
 * this reason.
 *
 * Uses a raw GuzzleHttp\Client rather than OCP\Http\Client\IClientService
 * for these two calls, deliberately - confirmed live: IClientService's
 * built-in SSRF guard (preventLocalAddress()) rejects any request to a
 * Docker-internal service name/private IP with "Host ... violates local
 * access rules" unless allow_local_remote_servers is enabled in
 * config.php, which isn't something this app should have to ask an
 * installer to turn on server-wide just for these two known-safe internal
 * hops. TranscriptionService.php already established this same raw-Guzzle
 * pattern in this app for its own internal call to the shared whisper
 * service - followed here rather than inventing a second approach.
 */
class KeycloakLoginController extends Controller {
    // Internal Docker-network address for boudica_slm's shared Keycloak -
    // fixed container-to-container hop, not deployment-configurable (see
    // the matching note in KeycloakProvisioningService). Includes /kc -
    // boudica_slm's Keycloak container always sets KC_HTTP_RELATIVE_PATH=
    // /kc (see product_templates/multiuser/docker-compose.yml and its own
    // boudica-le-ssl.conf's hardcoded /kc ProxyPass) - every internal call
    // 404s without it. Confirmed live 2026-09-06 on ts-1-boudica: this bug
    // was never exposed on the original dev-box build since that box's
    // Keycloak apparently didn't use a relative path - it silently broke
    // every real login attempt here (exchangeCodeForToken()/fetchUserinfo()
    // both 404, Guzzle throws, caught and surfaced as a generic "could not
    // reach the identity server" error with no hint of the real cause).
    // Default only: a deployment whose Keycloak does NOT use a relative path
    // (e.g. the boudica_slm dev box's own Keycloak container, which serves at
    // the root) overrides it with the `keycloak_internal_url` app setting -
    // see keycloakInternalUrl(). Unset/empty keeps this default, so
    // production behaviour is unchanged.
    private const KEYCLOAK_INTERNAL_URL = 'http://keycloak:8080/kc';
    private const PROVISION_CHECK_URL = 'http://web:80/cgi-bin/provision_check';

    private const SESSION_STATE_KEY = 'boudica_kc_state';
    private const SESSION_VERIFIER_KEY = 'boudica_kc_verifier';

    private Client $httpClient;

    public function __construct(
        string $appName,
        IRequest $request,
        private IConfig $config,
        private ISession $session,
        private IURLGenerator $urlGenerator,
        private IUserManager $userManager,
        private \OC\User\Session $userSession,
        private ISecureRandom $secureRandom,
        private KeycloakProvisioningService $provisioningService,
        private LoggerInterface $logger,
    ) {
        parent::__construct($appName, $request);
        $this->httpClient = new Client(['timeout' => 15]);
    }

    #[PublicPage]
    #[NoCSRFRequired]
    #[OpenAPI(OpenAPI::SCOPE_IGNORE)]
    #[FrontpageRoute(verb: 'GET', url: '/keycloak/login')]
    public function login(): Response {
        $keycloakUrl = rtrim($this->config->getAppValue('boudicaai', 'keycloak_url', ''), '/');
        if ($keycloakUrl === '') {
            return $this->errorPage($this->l()->t(
                'Boudica sign-in is not configured on this server yet. Please contact your administrator.'
            ));
        }
        $realm = $this->config->getAppValue('boudicaai', 'keycloak_realm', 'boudica');
        $clientId = $this->config->getAppValue('boudicaai', 'keycloak_client_id', 'boudica-nextcloud');

        $verifier = $this->secureRandom->generate(64, ISecureRandom::CHAR_ALPHANUMERIC);
        $state = $this->secureRandom->generate(32, ISecureRandom::CHAR_ALPHANUMERIC);
        $challenge = rtrim(strtr(base64_encode(hash('sha256', $verifier, true)), '+/', '-_'), '=');

        $this->session->set(self::SESSION_STATE_KEY, $state);
        $this->session->set(self::SESSION_VERIFIER_KEY, $verifier);

        $authUrl = $keycloakUrl . '/realms/' . rawurlencode($realm) . '/protocol/openid-connect/auth?' . http_build_query([
            'client_id' => $clientId,
            'redirect_uri' => $this->urlGenerator->linkToRouteAbsolute('boudicaai.keycloakLogin.callback'),
            'response_type' => 'code',
            'scope' => 'openid profile email',
            'state' => $state,
            'code_challenge' => $challenge,
            'code_challenge_method' => 'S256',
        ]);

        return new RedirectResponse($authUrl);
    }

    #[PublicPage]
    #[NoCSRFRequired]
    #[OpenAPI(OpenAPI::SCOPE_IGNORE)]
    #[FrontpageRoute(verb: 'GET', url: '/keycloak/callback')]
    public function callback(?string $code = null, ?string $state = null, ?string $error = null): Response {
        if ($error !== null) {
            return $this->errorPage($this->l()->t('Sign-in was cancelled or failed (%s).', [$error]));
        }

        $expectedState = $this->session->get(self::SESSION_STATE_KEY);
        $verifier = $this->session->get(self::SESSION_VERIFIER_KEY);
        $this->session->remove(self::SESSION_STATE_KEY);
        $this->session->remove(self::SESSION_VERIFIER_KEY);

        if ($code === null || $state === null || $expectedState === null || !hash_equals((string) $expectedState, $state)) {
            return $this->errorPage($this->l()->t('Sign-in failed (expired or invalid request). Please try again.'));
        }

        $tokens = $this->exchangeCodeForToken($code, (string) $verifier);
        if ($tokens === null) {
            return $this->errorPage($this->l()->t('Sign-in failed (could not reach the identity server). Please try again.'));
        }
        $accessToken = $tokens['access_token'];
        $idToken = $tokens['id_token'];

        // Fetched independently from Keycloak's own userinfo endpoint rather
        // than trusting provision_check's response for identity -
        // provision_check.cpp only includes email/name in its JSON body for
        // the "allowed"/"new_user" results, NOT "domain_not_found" (which
        // this controller still lets through to a beta-signup login) -
        // confirmed live: relying on provision_check's body for email broke
        // the domain_not_found path outright ("no verified email
        // available", the account with no purchased domain access was the
        // exact case that needed it most).
        $userinfo = $this->fetchUserinfo($accessToken);
        $email = is_string($userinfo['email'] ?? null) ? strtolower(trim($userinfo['email'])) : '';
        if ($email === '') {
            return $this->errorPage($this->l()->t('Sign-in failed (no verified email available). Please try again.'));
        }
        $name = is_string($userinfo['name'] ?? null) && $userinfo['name'] !== ''
            ? $userinfo['name']
            : (is_string($userinfo['preferred_username'] ?? null) ? $userinfo['preferred_username'] : $email);

        $provision = $this->checkProvisioned($accessToken);
        if ($provision === null) {
            return $this->errorPage($this->l()->t('Sign-in failed (could not verify your account). Please try again.'));
        }

        $result = $provision['result'] ?? 'error';
        $allowsLogin = $result === 'allowed' || $result === 'new_user' || $result === 'domain_not_found';
        if (!$allowsLogin) {
            $message = is_string($provision['message'] ?? null)
                ? $provision['message']
                : $this->l()->t('Access denied. Please contact your administrator.');
            return $this->errorPage($message);
        }

        // Deterministic per-user password (HMAC of the uid with a server-side
        // secret generated once and stored in app config) rather than a
        // fresh random one every login - this account is SSO-only (always
        // logs in through this controller, the value is never seen or typed
        // by the person), so it only ever needs to be SET once at account
        // creation. Rotating it on every login (the first version of this
        // code did) called IUser::setPassword() on an EXISTING user every
        // time, which fires Nextcloud's own "your password was changed"
        // security-notification email on every single login - confirmed
        // live via a real failed-send log entry during testing.
        $password = $this->ssoPassword($email);
        $user = $this->userManager->get($email);
        if ($user === null) {
            $user = $this->findOrCreateUser($email, $name, $password);
            if ($user === null) {
                return $this->errorPage($this->l()->t('Sign-in failed (could not create your account). Please try again.'));
            }
        }

        if (!$this->userSession->login($email, $password)) {
            $this->logger->error('Nextcloud login() rejected a just-verified Keycloak user', ['app' => 'boudicaai', 'uid' => $email]);
            return $this->errorPage($this->l()->t('Sign-in failed (could not start your session). Please try again.'));
        }
        // See this class's own docblock for why this second call is
        // required in addition to login() - without it, the very next
        // request treats the session as invalid and forcibly clears it.
        $this->userSession->createSessionToken($this->request, $email, $email, $password);

        // Stored so LogoutRedirectListener can pass it as id_token_hint on
        // logout - without it, Keycloak's end-session endpoint can't verify
        // who's asking and shows its own "do you want to log out?"
        // confirmation page instead of just doing it (confirmed live: a
        // GET to the logout endpoint with only client_id + a registered
        // post_logout_redirect_uri, no id_token_hint, returned a real
        // Keycloak logout-confirmation form, not a redirect). A stale
        // token here just means that one logout falls back to the
        // confirmation page - not a hard failure, so this is stored
        // best-effort like the API key below.
        $this->config->setUserValue($email, 'boudicaai', 'keycloak_id_token', $idToken ?? '');

        // Best-effort: a failure here shouldn't undo an already-completed,
        // legitimately-provisioned Nextcloud login - the user can still set
        // a key manually via Settings if this doesn't succeed.
        $this->provisioningService->ensureApiKey($email, $name);

        return new RedirectResponse($this->urlGenerator->linkToRoute('files.view.index'));
    }

    /**
     * @return array{access_token:string,id_token:?string}|null
     */
    private function exchangeCodeForToken(string $code, string $verifier): ?array {
        $realm = $this->config->getAppValue('boudicaai', 'keycloak_realm', 'boudica');
        $clientId = $this->config->getAppValue('boudicaai', 'keycloak_client_id', 'boudica-nextcloud');
        $tokenUrl = $this->keycloakInternalUrl() . '/realms/' . rawurlencode($realm) . '/protocol/openid-connect/token';

        try {
            $response = $this->httpClient->post($tokenUrl, [
                'form_params' => [
                    'grant_type' => 'authorization_code',
                    'code' => $code,
                    'redirect_uri' => $this->urlGenerator->linkToRouteAbsolute('boudicaai.keycloakLogin.callback'),
                    'client_id' => $clientId,
                    'code_verifier' => $verifier,
                ],
            ]);
        } catch (\Throwable $e) {
            $this->logger->error('Keycloak token exchange failed', ['app' => 'boudicaai', 'exception' => $e]);
            return null;
        }

        $body = json_decode((string) $response->getBody(), true);
        $accessToken = is_array($body) ? ($body['access_token'] ?? null) : null;
        if (!is_string($accessToken) || $accessToken === '') {
            return null;
        }
        $idToken = is_array($body) ? ($body['id_token'] ?? null) : null;

        return [
            'access_token' => $accessToken,
            'id_token' => is_string($idToken) && $idToken !== '' ? $idToken : null,
        ];
    }

    /**
     * @return array{result:string,email?:string,name?:string,message?:string}|null
     */
    private function checkProvisioned(string $accessToken): ?array {
        try {
            $response = $this->httpClient->post(self::PROVISION_CHECK_URL, [
                'headers' => ['Authorization' => 'Bearer ' . $accessToken],
                'body' => '{}',
            ]);
        } catch (\Throwable $e) {
            $this->logger->error('provision_check call failed', ['app' => 'boudicaai', 'exception' => $e]);
            return null;
        }

        $body = json_decode((string) $response->getBody(), true);
        return is_array($body) ? $body : null;
    }

    /**
     * @return array{email?:string,name?:string,preferred_username?:string}|null
     */
    private function fetchUserinfo(string $accessToken): ?array {
        $realm = $this->config->getAppValue('boudicaai', 'keycloak_realm', 'boudica');
        $userinfoUrl = $this->keycloakInternalUrl() . '/realms/' . rawurlencode($realm) . '/protocol/openid-connect/userinfo';

        try {
            $response = $this->httpClient->get($userinfoUrl, [
                'headers' => ['Authorization' => 'Bearer ' . $accessToken],
            ]);
        } catch (\Throwable $e) {
            $this->logger->error('Keycloak userinfo call failed', ['app' => 'boudicaai', 'exception' => $e]);
            return null;
        }

        $body = json_decode((string) $response->getBody(), true);
        return is_array($body) ? $body : null;
    }

    private function findOrCreateUser(string $uid, string $displayName, string $password): ?IUser {
        try {
            $user = $this->userManager->createUser($uid, $password);
        } catch (\Throwable $e) {
            $this->logger->error('Failed to create Nextcloud user for Keycloak login', ['app' => 'boudicaai', 'uid' => $uid, 'exception' => $e]);
            return null;
        }

        $user->setDisplayName($displayName);
        $user->setEMailAddress($uid);
        return $user;
    }

    /**
     * Base URL of Keycloak for the server-side (container-to-container) calls:
     * the `keycloak_internal_url` app setting when set (no trailing slash),
     * else the /kc default above. Without this, a Keycloak served at the root
     * returned 404 for every token exchange and no user could sign in.
     */
    private function keycloakInternalUrl(): string {
        $configured = rtrim(trim($this->config->getAppValue('boudicaai', 'keycloak_internal_url', '')), '/');
        return $configured !== '' ? $configured : self::KEYCLOAK_INTERNAL_URL;
    }

    /**
     * Deterministic per-user password: HMAC of the uid with a secret
     * generated once and stored in app config on first use. Never rotated -
     * see the comment at the call site in callback() for why.
     */
    private function ssoPassword(string $uid): string {
        $secret = $this->config->getAppValue('boudicaai', 'sso_secret', '');
        if ($secret === '') {
            $secret = $this->secureRandom->generate(64, ISecureRandom::CHAR_ALPHANUMERIC . ISecureRandom::CHAR_SYMBOLS);
            $this->config->setAppValue('boudicaai', 'sso_secret', $secret);
        }
        return hash_hmac('sha256', $uid, $secret);
    }

    private function errorPage(string $message): TemplateResponse {
        return new TemplateResponse(
            'boudicaai',
            'keycloak_error',
            [
                'message' => $message,
                // ?direct=1 is required here - without it, auto-keycloak-
                // login.js (BoudicaKeycloakLogin::load()) would immediately
                // bounce this "Back to login" click straight back into
                // Keycloak, looping on exactly the errors that landed
                // someone here in the first place (e.g. seat_limit_reached
                // - a fresh Keycloak login would just hit the same error
                // again).
                'loginUrl' => $this->urlGenerator->linkToRoute('core.login.showLoginForm') . '?direct=1',
            ],
            TemplateResponse::RENDER_AS_GUEST
        );
    }

    private function l() {
        return \OCP\Util::getL10N('boudicaai');
    }
}
