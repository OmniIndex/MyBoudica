<?php

declare(strict_types=1);

namespace OCA\BoudicaAi\Listener;

use OCP\AppFramework\Http\Events\BeforeTemplateRenderedEvent;
use OCP\AppFramework\Services\IInitialState;
use OCP\EventDispatcher\Event;
use OCP\EventDispatcher\IEventListener;
use OCP\IConfig;
use OCP\IUserSession;
use OCP\Util;

/**
 * Fires on every authenticated page render (not just login) so
 * intercept-logout.js can hook the "Log out" link site-wide, wherever the
 * person clicks it from.
 *
 * Fixes a real "can't actually log out" bug: Nextcloud's own /logout only
 * ends the Nextcloud session - it has no extension point to change its
 * fixed redirect to /login?clear=true (confirmed by reading core's
 * LoginController::logout() directly). Landing back on /login then hits
 * auto-keycloak-login.js, which redirects to Keycloak - and since
 * Keycloak's own SSO session cookie is still live (a completely separate
 * origin, untouched by Nextcloud's logout), Keycloak silently
 * re-authenticates instead of prompting, so the person is back in
 * immediately. Confirmed live by the user, reproduced in a fresh
 * incognito window too - not a caching artifact.
 *
 * @template-implements IEventListener<BeforeTemplateRenderedEvent>
 */
class LogoutRedirectListener implements IEventListener {
    public function __construct(
        private IConfig $config,
        private IInitialState $initialState,
        private IUserSession $userSession,
    ) {
    }

    public function handle(Event $event): void {
        if (!$event instanceof BeforeTemplateRenderedEvent || !$event->isLoggedIn()) {
            return;
        }

        $keycloakUrl = $this->config->getAppValue('boudicaai', 'keycloak_url', '');
        if ($keycloakUrl === '') {
            // Keycloak login isn't configured on this install - nothing to
            // intercept, avoid loading the script for no reason.
            return;
        }

        $uid = $this->userSession->getUser()?->getUID();
        $idToken = $uid !== null ? $this->config->getUserValue($uid, 'boudicaai', 'keycloak_id_token', '') : '';

        $this->initialState->provideInitialState('keycloakLogoutConfig', [
            'keycloakUrl' => rtrim($keycloakUrl, '/'),
            'realm' => $this->config->getAppValue('boudicaai', 'keycloak_realm', 'boudica'),
            'clientId' => $this->config->getAppValue('boudicaai', 'keycloak_client_id', 'boudica-nextcloud'),
            'idToken' => $idToken,
        ]);
        Util::addScript('boudicaai', 'intercept-logout');
    }
}
