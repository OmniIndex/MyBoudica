<?php

namespace OCA\BoudicaCode\Controller;

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
     * Renders the full-page app shell. All real logic lives in JS.
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

        // Pre-seeds this user's Boudica credential (minted at Keycloak
        // login time by KeycloakLoginController/KeycloakProvisioningService)
        // so boudicaAuth.js's ensureSession() finds it already in
        // localStorage. templates/main.php already prints the seed script
        // when these are set, but nothing passed them, so every user fell
        // through to the browser-side /beta/signup and saw "Couldn't
        // auto-connect to Boudica" (found 2026-10-25 on my.bangladesh).
        // Empty for a user who never logged in through that path (e.g. the
        // setup.sh admin account) - the template then prints nothing.
        $uid = $this->userSession->getUser()?->getUID() ?? '';
        $apiKey = $uid !== '' ? $this->config->getUserValue($uid, 'boudicaai', 'boudica_api_key', '') : '';

        return new TemplateResponse('boudicacode', 'main', [
            'boudica_api_base' => $apiBase,
            'boudica_provisioned_key' => $apiKey,
            'boudica_provisioned_email' => $uid,
        ]);
    }
}
