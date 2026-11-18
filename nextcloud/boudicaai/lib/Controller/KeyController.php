<?php

declare(strict_types=1);

namespace OCA\BoudicaAi\Controller;

use OCA\BoudicaAi\Service\KeycloakProvisioningService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\Attribute\FrontpageRoute;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\OpenAPI;
use OCP\AppFramework\Http\DataResponse;
use OCP\IRequest;
use OCP\IUserSession;

/**
 * POST /apps/boudicaai/api/key/renew - called by Boudica AI, Agents, Code
 * and Dashboard when Boudica refuses the key they hold. Returns the key on
 * file for the signed-in user, replaced with a new one first if Boudica
 * refuses it (checked here, server-side - the browser's word is not taken
 * for it). CSRF-protected: the apps send OC.requestToken.
 *
 * @psalm-suppress UnusedClass
 */
class KeyController extends Controller {

    public function __construct(
        string $appName,
        IRequest $request,
        private KeycloakProvisioningService $provisioningService,
        private IUserSession $userSession,
    ) {
        parent::__construct($appName, $request);
    }

    #[NoAdminRequired]
    #[OpenAPI(OpenAPI::SCOPE_IGNORE)]
    #[FrontpageRoute(verb: 'POST', url: '/api/key/renew')]
    public function renew(): DataResponse {
        $user = $this->userSession->getUser();
        if ($user === null) {
            return new DataResponse(['success' => false, 'error' => 'Not signed in'], 401);
        }
        $uid = $user->getUID();
        $key = $this->provisioningService->renewIfRefused($uid, $user->getDisplayName());
        if ($key === null || $key === '') {
            return new DataResponse(['success' => false, 'error' => 'Could not get a Boudica key'], 503);
        }
        return new DataResponse(['success' => true, 'token' => $key, 'email' => $uid]);
    }
}
