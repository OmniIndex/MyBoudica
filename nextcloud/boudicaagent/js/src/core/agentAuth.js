/**
 * agentAuth.js
 *
 * Gets (or creates) a Boudica API key for the current Nextcloud user.
 * Identical mechanism to boudicacode's boudicaAuth.js / boudicadashboard's
 * dashboardAuth.js — same signup endpoint, same localStorage key
 * (boudica_session), so all three apps share one signed-up session
 * per Nextcloud user instead of each signing up separately.
 *
 * Classic script, no dependencies. Must load before agentApi.js.
 */
(function (global) {
    'use strict';

    const BoudicaCode = global.BoudicaCode || (global.BoudicaCode = {});

    // See the matching comment in agentApi.js - same window.BOUDICA_API_BASE
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
            console.warn('[BoudicaAgent] Stored session was corrupt — clearing it', err);
            localStorage.removeItem('boudica_session');
            return null;
        }
    }

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
                credentials: 'omit',
            });
        } catch (err) {
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
     * @returns {Promise<{token: string, email: string} | null>}
     */
    function ensureSession() {
        if (!BoudicaCode._agentSessionPromise) {
            BoudicaCode._agentSessionPromise = (async () => {
                const existing = readSession();
                if (existing) return existing;

                const ncUser = global.OC && OC.getCurrentUser && OC.getCurrentUser();
                if (!ncUser) {
                    console.warn('[BoudicaAgent] No Nextcloud user available — cannot auto-signup for a Boudica key');
                    return null;
                }

                const result = await requestNewKey(ncUser);
                if (!result.success) {
                    console.warn('[BoudicaAgent] Auto-signup failed:', result.error);
                    return null;
                }

                const session = { token: result.apiKey, email: result.email };
                localStorage.setItem('boudica_session', JSON.stringify(session));
                return session;
            })();
        }
        return BoudicaCode._agentSessionPromise;
    }

    BoudicaCode.AgentAuth = { ensureSession };
})(window);
