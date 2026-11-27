<?php

declare(strict_types=1);

namespace OCA\BoudicaAi\Service;

use GuzzleHttp\Client;
use OCP\IConfig;
use Psr\Log\LoggerInterface;

/**
 * Mints (or reuses) a Boudica API key for a Nextcloud user, via the same
 * anonymous /beta/signup endpoint boudica-autosignup.js was always meant to
 * call - moved server-side and now correctly gated behind
 * KeycloakLoginController's provision_check call, instead of firing
 * unconditionally for every Nextcloud user regardless of domain status.
 *
 * Used for BOTH provision_check outcomes that result in a completed
 * Nextcloud login (domain "allowed"/"new_user" and "domain_not_found"):
 * seat/domain accounting already happened in boudislm.valid_domains via
 * provision_user() by the time this runs, so this step only has to answer
 * "does this Nextcloud user have a working credential for the embedded
 * boudicaagent/boudicacode/boudicadashboard apps yet" - it does not need to
 * know which provisioning path got them here.
 *
 * Uses a raw GuzzleHttp\Client rather than OCP\Http\Client\IClientService -
 * confirmed live (see KeycloakLoginController's own class docblock):
 * IClientService's SSRF guard rejects any request to a Docker-internal
 * service name with "violates local access rules". Same pattern
 * TranscriptionService.php already uses for its own internal whisper call.
 */
class KeycloakProvisioningService {
    // Internal Docker-network address - boudica_slm's own `web` service on
    // the shared `boudica_shared` network, same convention already used by
    // nginx's proxy_pass entries and by boudica-multiuser.conf's own
    // internal Keycloak URL for provision_check. Not deployment-configurable
    // on purpose: this is a fixed container-to-container hop, not something
    // that varies per install the way the public-facing endpoint does.
    private const BETA_SIGNUP_URL = 'http://web:80/api/boudica/beta/signup';
    // Any signed-in engine call that is cheap and changes nothing: a
    // refused key gets 403 here like everywhere else.
    private const KEY_CHECK_URL = 'http://web:80/api/boudica/speech/info';

    private Client $httpClient;

    public function __construct(
        private IConfig $config,
        private LoggerInterface $logger,
    ) {
        $this->httpClient = new Client(['timeout' => 15]);
    }

    /**
     * @return string|null the API key now on file for this user, or null if
     *                      minting one failed (logged, not thrown - a
     *                      failure here should not block the Nextcloud
     *                      login itself; the user can still set a key
     *                      manually via Settings).
     */
    public function ensureApiKey(string $uid, string $name): ?string {
        $existing = $this->config->getUserValue($uid, 'boudicaai', 'boudica_api_key', '');
        if ($existing !== '') {
            return $existing;
        }

        // Key provisioning secret (2026-11-27): Boudica issues keys here only
        // to a caller that sends it, once its BOUDICA_PROVISION_TOKEN is set
        // (app config provision_token = the same value, not sensitive). While
        // it is unset on either side, Boudica accepts a direct internal call
        // without it, as before.
        $headers = [];
        $provisionToken = $this->config->getAppValue('boudicaai', 'provision_token', '');
        if (strlen($provisionToken) >= 32) {
            $headers['X-Boudica-Provision-Token'] = $provisionToken;
        }
        try {
            $response = $this->httpClient->post(self::BETA_SIGNUP_URL, [
                'headers' => $headers,
                'json' => [
                    'name' => $name !== '' ? $name : $uid,
                    'email' => $uid,
                ],
            ]);
        } catch (\Throwable $e) {
            $this->logger->warning('Boudica beta/signup call failed for Keycloak-provisioned user', [
                'app' => 'boudicaai',
                'uid' => $uid,
                'exception' => $e,
            ]);
            return null;
        }

        $data = json_decode((string) $response->getBody(), true);
        $apiKey = is_array($data) ? ($data['api_key'] ?? null) : null;
        if (!is_string($apiKey) || $apiKey === '') {
            $this->logger->warning('Boudica beta/signup returned no api_key', [
                'app' => 'boudicaai',
                'uid' => $uid,
                'response' => $data,
            ]);
            return null;
        }

        $this->config->setUserValue($uid, 'boudicaai', 'boudica_api_key', $apiKey);
        $this->config->setUserValue($uid, 'boudicaai', 'boudica_email', $uid);

        return $apiKey;
    }

    /**
     * Does Boudica still accept this key? Asks the engine with a cheap
     * signed-in call (/speech/info). true = accepted, false = refused
     * (401/403: the key was switched off), null = could not tell (engine
     * down, timeout) - callers must not throw a key away on null.
     */
    public function isKeyAccepted(string $apiKey): ?bool {
        if ($apiKey === '') {
            return false;
        }
        try {
            $response = $this->httpClient->get(self::KEY_CHECK_URL, [
                'headers' => ['Authorization' => 'Bearer ' . $apiKey],
                'http_errors' => false,
                'timeout' => 5,
            ]);
        } catch (\Throwable $e) {
            return null;
        }
        $status = $response->getStatusCode();
        if ($status === 401 || $status === 403) {
            return false;
        }
        return $status >= 200 && $status < 300 ? true : null;
    }

    /**
     * Gives this user a working key: keeps the one on file while Boudica
     * accepts it, and mints a new one when Boudica refuses it (an admin
     * switched it off, e.g. after a key leaked, 2026-11-18). The apps call
     * this through KeyController when a request is refused, so nobody has
     * to clear their browser or sign in again.
     *
     * @return string|null the key now on file, or null if none could be had
     */
    public function renewIfRefused(string $uid, string $name): ?string {
        $existing = $this->config->getUserValue($uid, 'boudicaai', 'boudica_api_key', '');
        if ($existing !== '' && $this->isKeyAccepted($existing) !== false) {
            return $existing;
        }
        if ($existing !== '') {
            $this->logger->info('Boudica refused the stored API key - getting a new one', [
                'app' => 'boudicaai',
                'uid' => $uid,
            ]);
            $this->config->deleteUserValue($uid, 'boudicaai', 'boudica_api_key');
        }
        return $this->ensureApiKey($uid, $name);
    }
}
