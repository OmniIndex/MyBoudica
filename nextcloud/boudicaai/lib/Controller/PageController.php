<?php

declare(strict_types=1);

namespace OCA\BoudicaAi\Controller;

use OCA\BoudicaAi\AppInfo\Application;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\Attribute\FrontpageRoute;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\Attribute\OpenAPI;
use OCP\AppFramework\Http\TemplateResponse;
use OCP\IConfig;
use OCP\IRequest;
use OCP\IUserSession;

/**
 * @psalm-suppress UnusedClass
 */
class PageController extends Controller {
	public function __construct(
		string $appName,
		IRequest $request,
		private IConfig $config,
		private IUserSession $userSession,
	) {
		parent::__construct($appName, $request);
	}

	#[NoCSRFRequired]
	#[NoAdminRequired]
	#[OpenAPI(OpenAPI::SCOPE_IGNORE)]
	#[FrontpageRoute(verb: 'GET', url: '/')]
	public function index(): TemplateResponse {
		// Pre-seeds this user's Boudica credential (minted at Keycloak login
		// time by KeycloakLoginController/KeycloakProvisioningService) so
		// saml-auth.js's checkExistingSession() finds it already in
		// localStorage on first render, matching the exact same pattern
		// already proven working in boudicaagent/boudicacode/boudicadashboard's
		// own PageController+template. Previously saml-auth.js instead minted
		// its OWN key client-side against the public boudi.ca SaaS endpoint -
		// a different server/database than this deployment's own
		// /api/boudica, so that key was never valid here ("Invalid API key"
		// on every chat request despite the signup call itself succeeding).
		$uid = $this->userSession->getUser()?->getUID() ?? '';
		$apiKey = $uid !== '' ? $this->config->getUserValue($uid, 'boudicaai', 'boudica_api_key', '') : '';

		return new TemplateResponse(
			Application::APP_ID,
			'index',
			[
				'boudica_provisioned_key' => $apiKey,
				'boudica_provisioned_email' => $uid,
			],
		);
	}
}
