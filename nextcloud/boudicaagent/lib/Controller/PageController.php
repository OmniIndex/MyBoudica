<?php

namespace OCA\BoudicaAgent\Controller;

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
        private IUserSession $userSession,
    ) {
        parent::__construct($appName, $request);
    }

    /**
     * Renders the app shell. All logic lives in JS. Agents (shared
     * and private) are scoped to the logged-in user server-side, the
     * same way the dashboard app's /dashboard/*_individual endpoints
     * are — this app just sends that user's credentials with every
     * call.
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
        // so agentAuth.js's ensureSession() finds it already in localStorage
        // and never falls through to its own unconditional auto-signup.
        // Empty for a user who never logged in through that path (e.g. the
        // setup.sh admin account) - the template only prints the seed script
        // when a key is actually on file.
        $uid = $this->userSession->getUser()?->getUID() ?? '';
        $apiKey = $uid !== '' ? $this->config->getUserValue($uid, 'boudicaai', 'boudica_api_key', '') : '';

        return new TemplateResponse('boudicaagent', 'main', [
            'boudica_api_base' => $apiBase,
            'boudica_provisioned_key' => $apiKey,
            'boudica_provisioned_email' => $uid,
        ]);
    }
}
