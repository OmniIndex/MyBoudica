<?php

namespace OCA\BoudicaAgent\Controller;

use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\TemplateResponse;
use OCP\IRequest;

class PageController extends Controller {

    public function __construct(string $appName, IRequest $request) {
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
        return new TemplateResponse('boudicaagent', 'main');
    }
}
