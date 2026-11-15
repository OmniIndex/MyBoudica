<?php

declare(strict_types=1);

namespace OCA\BoudicaAi\Controller;

use OCA\BoudicaAi\AppInfo\Application;
use OCA\BoudicaAi\Service\DigestService;
use OCA\BoudicaAi\Service\MailDigestService;
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
        private MailDigestService $mailDigestService,
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

    /**
     * Boudica Mail part of the digest: one line per new email from each of
     * the user's Boudica Mail mailboxes (see MailDigestService).
     */
    #[NoAdminRequired]
    #[OpenAPI(OpenAPI::SCOPE_IGNORE)]
    #[FrontpageRoute(verb: 'GET', url: '/digest/mail')]
    public function mail(): DataResponse {
        $user = $this->userSession->getUser();
        if ($user === null) {
            return new DataResponse(['error' => 'Not authenticated'], 401);
        }
        return new DataResponse($this->mailDigestService->digestForUser($user->getUID()));
    }

    #[NoAdminRequired]
    #[OpenAPI(OpenAPI::SCOPE_IGNORE)]
    #[FrontpageRoute(verb: 'POST', url: '/digest/mail/link')]
    public function mailLink(string $email = '', string $password = '', string $host = ''): DataResponse {
        $user = $this->userSession->getUser();
        if ($user === null) {
            return new DataResponse(['error' => 'Not authenticated'], 401);
        }
        $r = $this->mailDigestService->link($user->getUID(), $email, $password, $host);
        return new DataResponse($r, $r['ok'] ? 200 : 400);
    }

    #[NoAdminRequired]
    #[OpenAPI(OpenAPI::SCOPE_IGNORE)]
    #[FrontpageRoute(verb: 'POST', url: '/digest/mail/unlink')]
    public function mailUnlink(string $email = ''): DataResponse {
        $user = $this->userSession->getUser();
        if ($user === null) {
            return new DataResponse(['error' => 'Not authenticated'], 401);
        }
        $this->mailDigestService->unlink($user->getUID(), $email);
        return new DataResponse(['ok' => true]);
    }

    /** Send or discard an outgoing email Boudica Mail held (2026-11-15). */
    #[NoAdminRequired]
    #[OpenAPI(OpenAPI::SCOPE_IGNORE)]
    #[FrontpageRoute(verb: 'POST', url: '/digest/mail/held')]
    public function mailHeld(string $email = '', int $id = 0, string $action = ''): DataResponse {
        $user = $this->userSession->getUser();
        if ($user === null) {
            return new DataResponse(['ok' => false, 'error' => 'Sign in first.'], 401);
        }
        return new DataResponse($this->mailDigestService->decideHeld($user->getUID(), $email, $id, $action));
    }
}
