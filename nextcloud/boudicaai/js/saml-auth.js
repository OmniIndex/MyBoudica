/**
 * Keycloak OpenID Connect Authentication Module
 * Handles secure authentication using Keycloak OIDC with PKCE
 */

class SAMLAuthenticator {
    constructor() {
        this.authenticated = false;
        this.user = null;
        this.sessionToken = null;
        this.accessToken = null;
        this.refreshToken = null;
        
        // Keycloak OIDC configuration
        this.keycloakUrl = 'https://auth.boudi.ca';
        this.realm = 'Boudica';
        this.clientId = 'omniindex';
        this.redirectUri = window.location.origin + window.location.pathname;
        this.sessionCheckInterval = null;
        this.tokenRefreshInterval = null;
        this.refreshInProgress = false;
    }

    /**
     * Initialize SAML authentication
     */
    async init() {
        try {
            // checkExistingSession() is async and does ALL the real work
            // itself as side effects (sets this.authenticated/accessToken/
            // user and calls this.onSuccess() internally) - it always
            // returns null, by design, so there's nothing useful to branch
            // on from its return value. A prior version of this method
            // called it without awaiting and then tried to read .user/
            // .token off the returned value, which - missing the await -
            // was always a pending Promise object (always truthy, with no
            // .token/.user properties of its own) - meaning this.accessToken
            // got silently overwritten to `undefined` on every single call,
            // regardless of what checkExistingSession() had just correctly
            // set moments earlier. Invisible until now because nothing
            // previously depended on this.accessToken actually being
            // populated; chat-api.js's _authHeaders() now does, and every
            // endpoint that relies solely on it (not the redundant direct-
            // localStorage read some older CGI calls also do) was failing
            // authentication as a result - confirmed live via a real 403
            // on /shared_chats and /messages, and confirmed fixed by
            // reproducing the exact same request manually with a real
            // Authorization header.
            await this.checkExistingSession();
        } catch (error) {
            console.error('Authentication initialization failed:', error);
            this.handleAuthError(error);
        }
    }

    /**
     * Check for existing session in localStorage
     */
    async checkExistingSession() {
        try {
            let sessionData = localStorage.getItem('boudica_session');
            if (!sessionData) {
                await this.signup();
                sessionData = localStorage.getItem('boudica_session');
            }
            if (!sessionData) {
                console.warn('[SAMLAuth] No session data found after signup attempt');
                this.authenticated = false;
                return null;
            }

            let session = JSON.parse(sessionData);
            // Accepts either the raw PHP pre-seed shape ({token, email}) or
            // this method's own normalized output ({token, user:{email}}) -
            // every successful run below overwrites localStorage with the
            // latter, so the *next* page load must recognize its own prior
            // output too, not just the shape it was originally written
            // against. Missing this (fixed 2026-09-05) meant a session
            // authenticated correctly exactly once, then silently stopped
            // working on every subsequent page load: token/refreshToken
            // stayed in storage (looked present), but the flat session.email
            // check failed against the now-nested user.email, so
            // this.accessToken never got set and every /chat request went
            // out with an empty api_key, rejected by the backend as
            // "Unauthorized - valid username, API key, or session token
            // required".
            let email = session.email || (session.user && session.user.email) || '';

            // Defense-in-depth against a stale cross-user session:
            // boudica_session is a single, non-namespaced localStorage key
            // shared by the whole browser origin, so a previous Nextcloud
            // login (a different account in the same browser) can leave
            // behind a token for someone else. The PHP pre-seed script now
            // guards against this on a fresh page load, but this check also
            // covers the SPA case where checkExistingSession() re-runs
            // without a full reload. Confirmed live 2026-09-17:
            // sibain@omniindex.io was served sibain@tendotzero.com's stale
            // session/identity this way.
            const currentUid = (window.OC && typeof OC.getCurrentUser === 'function' && OC.getCurrentUser() && OC.getCurrentUser().uid) || null;
            if (currentUid && email && currentUid !== email) {
                console.warn('[SAMLAuth] Stored session belongs to a different user than the logged-in Nextcloud account - clearing stale session');
                localStorage.removeItem('boudica_session');
                sessionData = null;
                email = '';
            }

            if (!sessionData || !session.token || !email) {
                console.warn('[SAMLAuth] Existing session is missing token or user info, clearing it');
                await this.signup();
                sessionData = localStorage.getItem('boudica_session');
                if (!sessionData) {
                    console.warn('[SAMLAuth] No session data found after signup attempt');
                    this.authenticated = false;
                    return null;
                }
                session = JSON.parse(sessionData);
                email = session.email || (session.user && session.user.email) || '';
                if (!session.token || !email) {
                    this.authenticated = false;
                    return null;
                }
            }

            console.log('Found existing session for user:', email);
            const normalized = {
                token: session.token,
                refreshToken: session.refreshToken || session.token,
                user: { email }
            };
            localStorage.setItem('boudica_session', JSON.stringify(normalized));
            this.authenticated = true;
            this.accessToken = session.token;
            this.sessionToken = session.token;
            this.user = { email };
            this.refreshToken = normalized.refreshToken;
            this.email = email;
            this.onSuccess && this.onSuccess(this.user);
        } catch (error) {
            console.error('Error checking existing session:', error);
            localStorage.removeItem('boudica_session');
        }
        return null;
    }

    /**
     * Get current user info
     */
    getUser() {
        return this.user;
    }

    /**
     * Check if user is authenticated
     */
    isAuthenticated() {
        return this.authenticated;
    }

    /**
     * Get session token for API requests
     */
    getSessionToken() {
        return this.sessionToken;
    }

    /**
     * Fallback only. The real credential now reaches localStorage via
     * templates/index.php's own pre-seed <script> (PageController::index()
     * passes this user's boudicaai/boudica_api_key IConfig value, minted at
     * Keycloak login time by KeycloakProvisioningService::ensureApiKey()) -
     * the same proven pattern already used by boudicaagent/boudicacode/
     * boudicadashboard's own PageController+template. That pre-seed prints
     * before this script loads, so checkExistingSession() normally finds a
     * valid session already in place and never calls this method at all.
     *
     * This used to instead POST directly to the public
     * https://boudi.ca/api/boudica/beta/signup SaaS endpoint and store
     * WHATEVER key that returned - a different server/database than this
     * deployment's own local /api/boudica, so the key it stored was never
     * valid here. That produced the exact "signup succeeded, then every
     * chat request fails with Invalid API key" symptom, since the local
     * CGI's api_keys table never had a row for that key. There is
     * deliberately no replacement network call here - a user with no
     * provisioned key yet (e.g. hasn't completed "Sign in with Boudica")
     * just has no session until they do, same as the sibling apps.
     */
    async signup() {
        const currentUser = OC.getCurrentUser();
        if (!currentUser) {
            console.log('[Boudica AutoSignup] Not authenticated - skipping');
            return;
        }

        const sessionData = localStorage.getItem('boudica_session');
        const session = JSON.parse(sessionData || '{}');
        if (session.token) {
            console.log('[Boudica AutoSignup] API key already exists - skipping signup');
            return;
        }

        console.warn('[Boudica AutoSignup] No provisioned API key on file yet for this user');
    }//end signup

}

// Export for use in other modules
window.SAMLAuthenticator = SAMLAuthenticator;
