<?php

declare(strict_types=1);

namespace OCA\BoudicaAi\Login;

use OCP\Authentication\IAlternativeLogin;
use OCP\IConfig;
use OCP\IRequest;
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
        private IConfig $config,
        private IRequest $request,
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
        // After "Log out", Nextcloud core always lands on /login?clear=1, and
        // the script below would send the person straight to Keycloak's
        // sign-in page. A site can name where people go instead, e.g. its
        // public site (occ config:app:set boudicaai post_logout_url
        // --value=https://bangladesh.myboudica.com/). Done here, on the
        // server, because the login-page scripts are cached by browsers for
        // months. ?direct=1 (local admin sign-in) is never redirected.
        $postLogoutUrl = trim($this->config->getAppValue('boudicaai', 'post_logout_url', ''));
        if ($postLogoutUrl !== ''
                && preg_match('#^https?://#i', $postLogoutUrl)
                && $this->request->getParam('clear') !== null
                && $this->request->getParam('direct') === null
                && !headers_sent()) {
            header('Location: ' . $postLogoutUrl, true, 302);
            exit;
        }
        Util::addStyle('boudicaai', 'boudicaai-keycloak-login');
        Util::addScript('boudicaai', 'auto-keycloak-login');
    }
}
