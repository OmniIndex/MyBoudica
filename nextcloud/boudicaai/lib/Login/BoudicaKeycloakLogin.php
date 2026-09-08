<?php

declare(strict_types=1);

namespace OCA\BoudicaAi\Login;

use OCP\Authentication\IAlternativeLogin;
use OCP\IURLGenerator;
use OCP\Util;

/**
 * Adds a "Sign in with Boudica" button to Nextcloud's normal login page,
 * alongside (not replacing) the local-account form the setup.sh-created
 * admin user keeps using. Registered via the deprecated-but-still-working
 * registerAlternativeLogin() (IAlternativeLoginProvider needs NC 34+; this
 * app's own info.xml declares min-version 31).
 *
 * load() also queues auto-keycloak-login.js, which auto-redirects the
 * login page straight to Keycloak instead of making the person click this
 * button - see that file's own comment for how it finds the button's URL
 * without depending on the login page's Vue-rendered DOM, and how it's
 * skipped via ?direct=1 (Nextcloud core's own convention for exactly this
 * "don't loop an SSO login page" case, confirmed live on a failed local
 * login attempt) so a real local login - e.g. the setup.sh-created admin
 * account - stays reachable at /login?direct=1.
 */
class BoudicaKeycloakLogin implements IAlternativeLogin {
    public function __construct(
        private IURLGenerator $urlGenerator,
    ) {
    }

    public function getLabel(): string {
        return 'Sign in with Boudica';
    }

    public function getLink(): string {
        return $this->urlGenerator->linkToRoute('boudicaai.keycloakLogin.login');
    }

    public function getClass(): string {
        return 'boudica-keycloak-login';
    }

    public function load(): void {
        Util::addStyle('boudicaai', 'boudicaai-keycloak-login');
        Util::addScript('boudicaai', 'auto-keycloak-login');
    }
}
