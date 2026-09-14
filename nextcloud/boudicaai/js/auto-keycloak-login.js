/**
 * Auto-redirects Nextcloud's login page straight to Keycloak instead of
 * making the person click "Sign in with Boudica" themselves. Loaded via
 * BoudicaKeycloakLogin::load() (IAlternativeLogin), same as this button's
 * own CSS.
 *
 * Modern Nextcloud's login page is a Vue SPA - the alternative-login
 * buttons aren't plain server-rendered <a> tags, they're built client-side
 * from a base64-encoded JSON blob Nextcloud embeds as
 * #initial-state-core-alternativeLogins (confirmed live: decodes to
 * [{"name":"Sign in with Boudica","href":"/apps/boudicaai/keycloak/login",
 * "class":"boudica-keycloak-login"}]). Reading that directly, rather than
 * waiting for Vue to render the actual button and then clicking it, avoids
 * any dependency on the rendered DOM/timing - the hidden input is already
 * present in the raw HTML before any script runs.
 *
 * Skips the redirect when the URL has ?direct=1 - this is Nextcloud CORE's
 * own convention (confirmed live: a failed local-login POST redirects back
 * to /login?direct=1&user=<uid> by itself, specifically so an
 * SSO-integrated login page doesn't loop straight back to the IdP after a
 * failed password attempt) - also the documented manual escape hatch for
 * anyone who needs the local login form, e.g. the setup.sh-created admin
 * account: visit /login?direct=1.
 */
(function () {
    'use strict';

    if (new URLSearchParams(window.location.search).has('direct')) {
        return;
    }

    var stateEl = document.getElementById('initial-state-core-alternativeLogins');
    if (!stateEl) {
        return;
    }

    var logins;
    try {
        logins = JSON.parse(atob(stateEl.value));
    } catch (e) {
        return;
    }

    var boudicaLogin = null;
    for (var i = 0; i < logins.length; i++) {
        if (logins[i].class === 'boudica-keycloak-login' && logins[i].href) {
            boudicaLogin = logins[i];
            break;
        }
    }
    if (!boudicaLogin) {
        return;
    }

    // Temporary migration notice (expires automatically 2026-09-13, one
    // week after this box became the live login target for
    // boudica.myboudica.com in Phase 7 of project-myboudica-integration-
    // plan-20260905) - the old eu1 demo instance used a completely
    // different auth system, so anyone with a pre-existing account there
    // will hit a fresh Keycloak registration form here with no obvious
    // explanation why their old login doesn't work. Remove this whole
    // block (and just call redirect() directly) once the window has
    // passed - left as a hardcoded date rather than a config value since
    // this is a one-time, short-lived notice, not a feature.
    var NOTICE_EXPIRES = new Date('2026-09-13T00:00:00Z');

    function redirect() {
        window.location.replace(boudicaLogin.href);
    }

    if (new Date() >= NOTICE_EXPIRES) {
        redirect();
        return;
    }

    var overlay = document.createElement('div');
    overlay.setAttribute('style',
        'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9999;' +
        'display:flex;align-items:center;justify-content:center;padding:20px;');
    var box = document.createElement('div');
    box.setAttribute('style',
        'background:#fff;color:#222;max-width:480px;padding:28px 32px;' +
        'border-radius:8px;font-family:sans-serif;font-size:15px;line-height:1.5;' +
        'box-shadow:0 4px 24px rgba(0,0,0,.3);');
    box.innerHTML =
        '<h2 style="margin:0 0 12px;font-size:19px;">Had an account on our previous system?</h2>' +
        '<p style="margin:0 0 20px;">Please register a new account here - your ' +
        'existing data will be transferred across within 24 hours of registering.</p>' +
        '<button type="button" style="background:#D3A54A;color:#fff;border:none;' +
        'padding:10px 22px;border-radius:4px;font-size:15px;cursor:pointer;">' +
        'Continue to sign in</button>';
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    box.querySelector('button').addEventListener('click', redirect);
    setTimeout(redirect, 12000);
})();
