<?php

namespace OCA\BoudicaDashboard\Controller;

use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\TemplateResponse;
use OCP\IConfig;
use OCP\IRequest;
use OCP\IUserSession;

class PageController extends Controller {

    public function __construct(
        string $appName,
        IRequest $request,
        private IConfig $config,
        private IUserSession $userSession
    ) {
        parent::__construct($appName, $request);
    }

    /**
     * Renders the dashboard page shell. All real logic lives in JS.
     * This dashboard shows only the logged-in Nextcloud user's own
     * usage stats — the backend scopes /dashboard/* responses to
     * whichever user's credentials the request is authenticated with
     * (see dashboardAuth.js), so no server-side cross-user gating is
     * needed here.
     * @NoAdminRequired
     * @NoCSRFRequired
     */
    public function index(): TemplateResponse {
        // Shares boudicaai's admin-configured endpoint (one setting controls
        // all four apps) rather than having its own admin settings page for
        // the same value. boudicaai's own default includes a /chat suffix
        // (it's the direct chat endpoint); this app needs the bare base.
        $endpoint = $this->config->getAppValue('boudicaai', 'api_endpoint', 'https://boudi.ca/api/boudica/chat');
        $apiBase = preg_replace('#/chat/?$#', '', $endpoint);

        // main.php's inline pre-seed script reads these two - previously
        // never actually set here despite the template already expecting
        // them, so dashboardAuth.js always fell through to its own
        // client-side /beta/signup call instead of reusing the key already
        // minted for this user at Keycloak-login time (or via Settings).
        // That client-side fallback sends the bare Nextcloud username as
        // the signup email, which the beta/signup endpoint rejects for any
        // account whose uid isn't itself email-shaped (a locally-created
        // admin account, for instance) - surfacing as a silent "Unexpected
        // server response" in the console and every widget stuck on Error.
        $uid = $this->userSession->getUser()?->getUID() ?? '';
        $provisionedKey = $uid !== '' ? $this->config->getUserValue($uid, 'boudicaai', 'boudica_api_key', '') : '';
        $provisionedEmail = $uid !== '' ? $this->config->getUserValue($uid, 'boudicaai', 'boudica_email', '') : '';

        return new TemplateResponse('boudicadashboard', 'main', [
            'boudica_api_base' => $apiBase,
            'boudica_provisioned_key' => $provisionedKey,
            'boudica_provisioned_email' => $provisionedEmail,
        ]);
    }
}
