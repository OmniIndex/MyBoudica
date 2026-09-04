<?php

namespace OCA\BoudicaDashboard\Controller;

use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\TemplateResponse;
use OCP\IConfig;
use OCP\IRequest;

class PageController extends Controller {

    public function __construct(
        string $appName,
        IRequest $request,
        private IConfig $config
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
        return new TemplateResponse('boudicadashboard', 'main', ['boudica_api_base' => $apiBase]);
    }
}
