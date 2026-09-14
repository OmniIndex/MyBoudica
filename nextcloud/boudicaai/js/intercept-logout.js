/**
 * Fixes "logging out logs me straight back in" - loaded on every
 * authenticated page (LogoutRedirectListener.php, on
 * BeforeTemplateRenderedEvent) so it catches the "Log out" link wherever
 * it's clicked from, not just one page.
 *
 * Root cause: Nextcloud's own /logout only ends the Nextcloud session -
 * it has no extension point for its fixed redirect to /login?clear=true
 * (checked core's LoginController::logout() directly). Landing on /login
 * then hits auto-keycloak-login.js, which redirects to Keycloak - and
 * Keycloak's own SSO session cookie (a separate origin, untouched by
 * Nextcloud's logout) is still live, so it silently re-authenticates
 * instead of prompting. Confirmed by the user in a fresh incognito
 * window too, so not a caching artifact - it's the SSO cookie itself.
 *
 * Fix: intercept the "Log out" click and send the browser to Keycloak's
 * OWN end-session endpoint FIRST (this actually clears the Keycloak SSO
 * cookie), with post_logout_redirect_uri pointing back at Nextcloud's
 * real /logout - which THEN runs and ends the Nextcloud session as
 * normal. By the time auto-keycloak-login.js fires again on /login,
 * Keycloak has no session left to silently reuse, so it shows a real
 * login prompt. Requires the boudica-nextcloud Keycloak client to have
 * a matching URL registered under its post.logout.redirect.uris
 * attribute (Keycloak accepts post_logout_redirect_uri without an
 * id_token_hint only when it's pre-registered there) - done once via
 * Keycloak's admin API, not something this script can do itself.
 *
 * IMPORTANT: post_logout_redirect_uri must be the REAL clicked link's own
 * href (link.href below), not a hand-built "/logout" - confirmed live
 * this is required: Nextcloud's actual "Log out" link carries a CSRF
 * `requesttoken` query param generated for the current session
 * (`/logout?requesttoken=...`), and /logout rejects a request with none
 * ("CSRF check failed", HTTP 412) - which a fabricated bare /logout URL
 * always would be. Since Keycloak's post.logout.redirect.uris can't
 * allowlist a token that changes per page load, it's registered there
 * with a trailing wildcard (`/logout*`) instead of an exact match.
 *
 * config.idToken (LogoutRedirectListener - the id_token captured at login
 * time, stored per-user) is passed as id_token_hint when available -
 * confirmed live this is required for a genuinely single-click logout:
 * without it, Keycloak's end-session endpoint can't verify who's asking
 * and shows its own "do you want to log out?" confirmation page instead
 * of just doing it. Falls back to sending the browser there without
 * id_token_hint (one extra click on Keycloak's own confirm page) if no
 * token is on file - still real progress over the original bug, not a
 * hard requirement.
 *
 * 2026-09-14 fix: the stored id_token is captured once, at login, and
 * never refreshed - but this realm's accessTokenLifespan (which ID tokens
 * share) is 300s while the Nextcloud/Keycloak SSO session routinely lives
 * far longer (ssoSessionIdleTimeout 3600s, ssoSessionMaxLifespan 28800s).
 * Confirmed live via Keycloak's own event log: any logout attempted more
 * than ~5 minutes after login sent an already-expired id_token_hint and
 * Keycloak rejected it outright - "LOGOUT_ERROR ... error=session_expired,
 * reason=Failed verification during logout." - surfacing to the user as
 * Keycloak's own error page ("Sign in to Boudica / Logout failed")
 * instead of the confirm-page fallback described above, which only
 * triggers when idToken is *absent*, not when it's present-but-expired.
 * Fix: decode the token's own `exp` claim client-side (a JWT's payload is
 * unsigned/plain base64url - reading it needs no verification, we are
 * simply deciding whether OUR OWN copy is still worth sending, not trusting
 * its contents) and drop id_token_hint whenever it's expired or about to
 * expire, falling back to the already-working confirm-page path instead of
 * sending a token Keycloak is guaranteed to reject.
 */
(function () {
    'use strict';

    var configEl = document.getElementById('initial-state-boudicaai-keycloakLogoutConfig');
    if (!configEl) {
        return;
    }

    var config;
    try {
        config = JSON.parse(atob(configEl.value));
    } catch (e) {
        return;
    }
    if (!config.keycloakUrl) {
        return;
    }

    // Returns true only if `token` is a well-formed JWT whose `exp` claim is
    // still comfortably in the future. Any parse failure or missing/invalid
    // `exp` is treated as "not usable" (safe default: fall back to the
    // confirm-page path rather than send a token that might be rejected).
    function isTokenStillFresh(token) {
        if (!token || typeof token !== 'string') {
            return false;
        }
        var parts = token.split('.');
        if (parts.length !== 3) {
            return false;
        }
        try {
            var payloadJson = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
            var payload = JSON.parse(payloadJson);
            if (typeof payload.exp !== 'number') {
                return false;
            }
            // 30s safety margin for clock skew / time spent on the
            // "do you really want to logout?" confirm page.
            return (payload.exp * 1000) > (Date.now() + 30000);
        } catch (e) {
            return false;
        }
    }

    document.addEventListener('click', function (event) {
        var link = event.target.closest ? event.target.closest('a[href]') : null;
        if (!link) {
            return;
        }

        var url;
        try {
            url = new URL(link.href, window.location.href);
        } catch (e) {
            return;
        }
        if (url.pathname !== '/logout' && !url.pathname.endsWith('/logout')) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();

        var postLogoutRedirectUri = url.href;
        var logoutUrl = config.keycloakUrl + '/realms/' + encodeURIComponent(config.realm)
            + '/protocol/openid-connect/logout?'
            + 'client_id=' + encodeURIComponent(config.clientId)
            + '&post_logout_redirect_uri=' + encodeURIComponent(postLogoutRedirectUri);
        if (config.idToken && isTokenStillFresh(config.idToken)) {
            logoutUrl += '&id_token_hint=' + encodeURIComponent(config.idToken);
        }

        window.location.href = logoutUrl;
    }, true);
})();
