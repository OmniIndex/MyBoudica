/**
 * dashboardApi.js
 *
 * Implements the `API` object that dashboardManager.js calls
 * (`API.post('/dashboard/...')`) — ported from boudicacode's
 * boudicaApi.js patterns (credential resolution, the CSP-vs-network
 * error disambiguation in wrapEndpointFetch).
 *
 * Calls the main Boudica API app at https://boudi.ca/api/boudica
 * (boudica_cgi) — NOT the admin CGI (boudica_admin) — per the
 * dashboard endpoints having been moved there. Auth is no longer a
 * Bearer header: each endpoint expects { user_id, api_key } in a
 * JSON POST body, so every call here is a POST regardless of the
 * endpoint being a read.
 *
 * SCOPE: every /dashboard/*_individual endpoint is expected to
 * return data scoped to whichever user_id/api_key pair is sent —
 * i.e. the server, not this client, is what restricts a Nextcloud
 * user to seeing only their own usage/security data. This module
 * just resolves and sends that user's credentials; it does not do
 * any of the actual scoping itself.
 *
 * Classic script. Must load after dashboardAuth.js, before
 * dashboardManager.js.
 */
(function (global) {
    'use strict';

    const BoudicaCode = global.BoudicaCode || (global.BoudicaCode = {});

    // window.BOUDICA_API_BASE is injected server-side by the app's Nextcloud
    // template (reads an admin-configurable value) - lets a sovereign/
    // on-prem deployment point this app at its own inference server instead
    // of the boudi.ca SaaS default, without a code change per deployment.
    const DEFAULT_API_BASE = global.BOUDICA_API_BASE || 'https://boudi.ca/api/boudica';

    function apiBase() {
        return localStorage.getItem('boudica_api_url') || DEFAULT_API_BASE;
    }

    /**
     * Resolves { apiKey, userId } for a request, where userId is the
     * Nextcloud user's email — same identity boudicaAuth.js/
     * dashboardAuth.js signs up with, and what the backend expects
     * as user_id in the JSON body. Tries the auto-signed-up session
     * first (dashboardAuth.js); falls back to manual localStorage
     * overrides, then to the Nextcloud user id as a last resort so
     * requests are at least attributable even with no key at all.
     */
    async function resolveCredentials() {
        const session = BoudicaCode.DashboardAuth ? await BoudicaCode.DashboardAuth.ensureSession() : null;
        const apiKey = (session && session.token) || localStorage.getItem('boudica_api_key') || '';
        const userId =
            (session && session.email) ||
            localStorage.getItem('boudica_user_id') ||
            (global.OC && OC.getCurrentUser && OC.getCurrentUser().uid) ||
            'anonymous';
        return { apiKey, userId };
    }

    /**
     * fetch() rejects with a generic "TypeError: Failed to fetch" for
     * both a genuine network outage AND a CSP connect-src block —
     * this app calls a different origin (boudi.ca) than the
     * Nextcloud instance it runs on, so that's an easy trap to fall
     * into here specifically. wrapEndpointFetch turns that ambiguous
     * TypeError into a message that points at the likely cause.
     */
    async function wrapEndpointFetch(url, init) {
        try {
            return await fetch(url, init);
        } catch (err) {
            if (err instanceof TypeError) {
                const origin = new URL(url).origin;
                throw new Error(
                    `Could not reach ${origin} (${err.message}). This is usually either the network, or ` +
                    `Nextcloud's Content-Security-Policy blocking the request — check the browser console ` +
                    `for a "connect-src" violation, and if so, add ${origin} to it (Apache: Header edit ` +
                    `Content-Security-Policy "connect-src 'self'" "connect-src 'self' ${origin}").`
                );
            }
            throw err;
        }
    }

    /**
     * POSTs { user_id, api_key } (plus any extra body fields) to
     * `${apiBase()}${path}` and returns the parsed JSON response.
     */
    async function apiPost(path, extraBody) {
        const { apiKey, userId } = await resolveCredentials();

        const url = `${apiBase()}${path}`;
        const response = await wrapEndpointFetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: JSON.stringify({
                user_id: userId,
                api_key: apiKey,
                ...extraBody,
            }),
            credentials: 'omit',
        });

        if (!response.ok) {
            const errorBody = await response.json().catch(() => ({}));
            const message = errorBody.error || `HTTP ${response.status} on ${path}`;
            const err = new Error(message);
            err.status = response.status;
            throw err;
        }

        return response.json();
    }

    BoudicaCode.API = { post: apiPost };
})(window);
