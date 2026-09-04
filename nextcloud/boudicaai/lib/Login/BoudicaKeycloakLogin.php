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
    }
}
