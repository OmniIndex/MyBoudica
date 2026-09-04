<?php

namespace OCA\BoudicaCode\Controller;

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
        return new TemplateResponse('boudicacode', 'main', ['boudica_api_base' => $apiBase]);
    }
}
