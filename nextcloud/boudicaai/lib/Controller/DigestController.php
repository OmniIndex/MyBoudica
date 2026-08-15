<?php

declare(strict_types=1);

namespace OCA\BoudicaAi\Controller;

use OCA\BoudicaAi\AppInfo\Application;
use OCA\BoudicaAi\Service\DigestService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\Attribute\FrontpageRoute;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\Attribute\OpenAPI;
use OCP\AppFramework\Http\DataResponse;
use OCP\AppFramework\Http\TemplateResponse;
use OCP\IRequest;
use OCP\IUserSession;

/**
 * @psalm-suppress UnusedClass
 */
class DigestController extends Controller {

    public function __construct(
        string $appName,
        IRequest $request,
        private DigestService $digestService,
        private IUserSession $userSession,
    ) {
        parent::__construct($appName, $request);
    }

    #[NoCSRFRequired]
    #[NoAdminRequired]
    #[OpenAPI(OpenAPI::SCOPE_IGNORE)]
    #[FrontpageRoute(verb: 'GET', url: '/digest')]
    public function index(): TemplateResponse {
        return new TemplateResponse(Application::APP_ID, 'digest');
    }

    /**
     * Same-origin JSON read for the digest page's JS — no api_key
     * needed here, this is a normal Nextcloud session-authenticated
     * request, unlike the direct-to-boudi.ca calls the other Boudica
     * Nextcloud apps make.
     * @NoAdminRequired
     */
    #[NoAdminRequired]
    #[OpenAPI(OpenAPI::SCOPE_IGNORE)]
    #[FrontpageRoute(verb: 'GET', url: '/digest/data')]
    public function data(): DataResponse {
        $user = $this->userSession->getUser();
        if ($user === null) {
            return new DataResponse(['error' => 'Not authenticated'], 401);
        }

        $digest = $this->digestService->getDigestForUser($user->getUID());
        return new DataResponse(['digest' => $digest]);
    }
}
