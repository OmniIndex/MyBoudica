/**
 * boudicaAuth.js
 *
 * Gets (or creates) a Boudica API key for the current Nextcloud user,
 * so boudicaApi.js has credentials without ever asking the person to
 * paste one in manually. Ported from saml-auth.js's SAMLAuthenticator
 * — specifically just the part that's actually load-bearing:
 * checkExistingSession()'s localStorage read + signup() +
 * performBoudicalAutosignup(). Classic script, no dependencies.
 *
 * NOT ported (present in saml-auth.js but dead code there — the
 * constructor sets up keycloakUrl/realm/clientId/redirectUri and there
 * are session-monitoring/token-refresh interval fields, but nothing in
 * that file ever starts an OIDC redirect flow, refreshes a token, or
 * calls startSessionMonitoring — this app's actual working mechanism
 * is 100% the signup-endpoint one below):
 *   - Keycloak OIDC / PKCE redirect flow
 *   - Token refresh / session-expiry monitoring
 *   - this._checkProvisioned() — referenced in saml-auth.js's init()
 *     but not defined anywhere in that file, so its provisioning
 *     re-check behavior couldn't be ported faithfully. If Boudica has
 *     a way for admins to revoke/suspend a generated key, that would
 *     surface as this app's requests failing with 401 — see
 *     boudicaApi.js's error handling.
 *
 * Simplified from the original's triple-nested duplicate
 * re-read-after-signup logic (checkExistingSession() called signup()
 * then re-read localStorage, up to three times, near-identically) down
 * to a single linear check -> signup -> read.
 */
(function (global) {
    'use strict';

    const BoudicaCode = global.BoudicaCode || (global.BoudicaCode = {});

    // See the matching comment in boudicaApi.js - same window.BOUDICA_API_BASE
    // override, kept independent here since this file loads before it and
    // the two don't share module scope.
    const SIGNUP_URL = (global.BOUDICA_API_BASE || 'https://boudi.ca/api/boudica') + '/beta/signup';

    function readSession() {
        try {
            const raw = localStorage.getItem('boudica_session');
            if (!raw) return null;
            const session = JSON.parse(raw);
            return session && session.token ? session : null;
        } catch (err) {
            console.warn('[BoudicaAuth] Stored session was corrupt — clearing it', err);
            localStorage.removeItem('boudica_session');
            return null;
        }
    }

    /** Ported from performBoudicalAutosignup(). */
    async function requestNewKey(ncUser) {
        const signupData = {
            name: ncUser.displayName || ncUser.uid,
            email: ncUser.uid,
            organization: ncUser.uid,
        };

        let response;
        try {
            response = await fetch(SIGNUP_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(signupData),
                credentials: 'omit', // don't send Nextcloud cookies to Boudica
            });
        } catch (err) {
            // A CSP connect-src block throws the same generic TypeError as
            // an actual network outage — nudge toward the likely cause
            // rather than leaving it as an opaque "Failed to fetch".
            const hint = err instanceof TypeError
                ? ` — if this persists, check the browser console for a "connect-src" CSP violation for ${new URL(SIGNUP_URL).origin}`
                : '';
            return { success: false, error: `Network error: ${err.message}${hint}` };
        }

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            if (response.status === 409) {
                return { success: false, error: 'Email already has an API key', code: 'EMAIL_EXISTS' };
            }
            return { success: false, error: errorData.error || `HTTP ${response.status}` };
        }

        const data = await response.json();
        if (data.success && data.api_key) {
            return { success: true, apiKey: data.api_key, email: signupData.email };
        }
        return { success: false, error: 'Unexpected server response' };
    }

    /**
     * Returns a { token, email } session, signing up for a new Boudica
     * API key via the current Nextcloud user's identity if none is
     * already stored. Memoized so a page only ever attempts signup
     * once, no matter how many BoudicaApi calls happen concurrently.
     * @returns {Promise<{token: string, email: string} | null>}
     */
    function ensureSession() {
        if (!BoudicaCode._boudicaSessionPromise) {
            BoudicaCode._boudicaSessionPromise = (async () => {
                const existing = readSession();
                if (existing) return existing;

                const ncUser = global.OC && OC.getCurrentUser && OC.getCurrentUser();
                if (!ncUser) {
                    console.warn('[BoudicaAuth] No Nextcloud user available — cannot auto-signup for a Boudica key');
                    return null;
                }

                const result = await requestNewKey(ncUser);
                if (!result.success) {
                    console.warn('[BoudicaAuth] Auto-signup failed:', result.error);
                    return null;
                }

                const session = { token: result.apiKey, email: result.email };
                localStorage.setItem('boudica_session', JSON.stringify(session));
                return session;
            })();
        }
        return BoudicaCode._boudicaSessionPromise;
    }

    BoudicaCode.BoudicaAuth = { ensureSession };
})(window);
