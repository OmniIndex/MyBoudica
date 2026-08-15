<?php

namespace OCA\BoudicaDashboard\Controller;

use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\TemplateResponse;
use OCP\IRequest;

class PageController extends Controller {

    public function __construct(string $appName, IRequest $request) {
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
        return new TemplateResponse('boudicadashboard', 'main');
    }
}
