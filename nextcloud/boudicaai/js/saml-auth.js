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
            // Check if user has existing valid session
            const existingSession = this.checkExistingSession();
            
            if (existingSession) {
                // Restore session from localStorage.
                // Re-verify provision status on every page load so that admin
                // suspension takes effect even for users with a cached session.
                this.authenticated = true;
                this.user = existingSession.user;
                this.sessionToken = existingSession.token;
                this.accessToken = existingSession.token;

                // Only call provision_check when the stored token is still valid
                // (not expired). If it's expired, refreshAccessToken() will run
                // immediately and will call provision_check with the fresh token.
                const tokenStillValid = existingSession.expiresAt &&
                    new Date(existingSession.expiresAt) > new Date();
                if (tokenStillValid) {
                    const stillAllowed = await this._checkProvisioned(
                        this.accessToken, false /* failOnNetworkError */);
                    if (!stillAllowed) return; // error/logout already handled
                }

                //this.startSessionMonitoring();
                
                // Trigger success callback
                if (this.onSuccess) {
                    this.onSuccess(this.user);
                }
            } else {
                //await this.initiateAuthentication();
            }
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
            const sessionData = localStorage.getItem('boudica_session');
            if (sessionData) {
                const session = JSON.parse(sessionData);
                // Check to see if we have an API key
                if ( session.token && session.email) {
                    console.log('Found existing session for user:', session.user.email || session.token);
                    const sessionData = {
                        token: session.token,
                        refreshToken: session.refreshToken || session.token,
                        user: { email: session.email }
                    };
                    localStorage.setItem('boudica_session', JSON.stringify(sessionData));                    
                    this.authenticated = true;
                    this.accessToken = session.token;
                    this.sessionToken = session.token;
                    this.user = { email: session.uid || session.email };
                    this.refreshToken = session.token;
                    this.email = session.email;
                    this.onSuccess && this.onSuccess(this.user);
                } else {
                    console.warn('[SAMLAuth] Existing session is missing token or user info, clearing it');
                    await this.signup();
                    const sessionData = localStorage.getItem('boudica_session');
                    if (sessionData) {
                        const session = JSON.parse(sessionData);
                        if ( session.token && session.email) {
                            console.log('Found existing session for user:', session.email || session.token);
                            const sessionData = {
                                token: session.token,
                                refreshToken: session.refreshToken || session.token,
                                user: { email: session.email }
                            };
                            localStorage.setItem('boudica_session', JSON.stringify(sessionData));
                            this.accessToken = session.token;
                            this.sessionToken = session.token;
                            this.user = { email: session.uid || session.email };
                            this.refreshToken = session.token;
                            this.email = session.email;
                            this.authenticated = true;
                            this.onSuccess && this.onSuccess(this.user);
                        }
                    } else {
                        console.warn('[SAMLAuth] No session data found after signup attempt');
                        this.authenticated = false;
                    }
                }
            } else {
                await this.signup();
                const sessionData = localStorage.getItem('boudica_session');
                if (sessionData) {
                    const session = JSON.parse(sessionData);
                    if ( session.token && session.email) {
                        console.log('Found existing session for user:', session.email || session.token);
                        const sessionData = {
                            token: session.token,
                            refreshToken: session.refreshToken || session.token,
                            user: { email: session.email }
                        };
                        localStorage.setItem('boudica_session', JSON.stringify(sessionData));
                        this.authenticated = true;
                        this.accessToken = session.token;
                        this.sessionToken = session.token;
                        this.user = { email: session.uid || session.email };
                        this.refreshToken = session.token;
                        this.email = session.email;
                        this.onSuccess && this.onSuccess(this.user);
                    }
                } else {
                    await this.signup();
                    const sessionData = localStorage.getItem('boudica_session');
                    if (sessionData) {
                        const session = JSON.parse(sessionData);
                        if ( session.token && session.email) {
                            console.log('Found existing session for user:', session.email || session.token);
                            const sessionData = {
                                token: session.token,
                                refreshToken: session.refreshToken || session.token,
                                user: { email: session.email }
                            };
                            localStorage.setItem('boudica_session', JSON.stringify(sessionData));
                            this.authenticated = true;
                            this.accessToken = session.token;
                            this.sessionToken = session.token;
                            this.user = { email: session.uid || session.email };
                            this.refreshToken = session.token;
                            this.email = session.email;                    
                            this.onSuccess && this.onSuccess(this.user);
                        }
                    } else {
                        console.warn('[SAMLAuth] No session data found after signup attempt');
                        this.authenticated = false;
                    }
                }         
            }
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

 async signup() {
            const currentUser = OC.getCurrentUser();
            if (!currentUser) {
                console.log('[Boudica AutoSignup] Not authenticated - skipping');
                return;
            }
            console.log('[Boudica AutoSignup] User authenticated:', currentUser.displayName);
            //OK do we have a key or not?
            const sessionData = localStorage.getItem('boudica_session');
            const session = JSON.parse(sessionData || '{}');
            const apiKey = session.token || '';
            if ( apiKey) {
                console.log('[Boudica AutoSignup] API key already exists - skipping signup');
                return;
            }
            console.log('[Boudica AutoSignup] No API key found - attempting signup');
           // (async () => {
                await this.performBoudicalAutosignup(currentUser).then(result => {
                    if (result.success) {
                        console.log('[Boudica AutoSignup] Signup successful, storing API key');
                        // Store the API key in localStorage
                        const newSession = {
                            token: result.apiKey,
                            email: result.email,
                            message: result.message,
                            rateLimits: result.rateLimits
                        };
                        localStorage.setItem('boudica_session', JSON.stringify(newSession));
                    } else {
                        console.error('[Boudica AutoSignup] Signup failed:', result.error);
                    }
                }).catch(err => {
                    console.error('[Boudica AutoSignup] Error during signup:', err);
                });
            //})();

}//end signup

  /**
     * Call Boudica API signup endpoint
     */
        async performBoudicalAutosignup(ncUser) {
            // Boudica API endpoint for beta signup
    const BOUDICA_API_URL = 'https://boudi.ca/api/boudica/beta/signup';
        try {
            // Prepare signup payload with Nextcloud user data
            const signupData = {
                name: ncUser.displayName || ncUser.uid,
                email: ncUser.uid,
                organization: ncUser.uid  // Nextcloud username as org
                // use_case and description are optional - API will use defaults
            };

            console.log('[Boudica AutoSignup] Calling Boudica API signup with user:', signupData.name);

            // POST to Boudica API endpoint
            const response = await fetch(BOUDICA_API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(signupData),
                credentials: 'omit'  // Don't send Nextcloud cookies to Boudica
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                const errorMsg = errorData.error || `HTTP ${response.status}`;

                // Handle specific errors
                if (response.status === 409) {
                    console.log('[Boudica AutoSignup] Email already registered:', signupData.email);
                    return {
                        success: false,
                        error: 'Email already has an API key',
                        code: 'EMAIL_EXISTS'
                    };
                }

                console.error('[Boudica AutoSignup] Signup failed:', errorMsg);
                return {
                    success: false,
                    error: errorMsg
                };
            }

            const data = await response.json();
            if (data.success && data.api_key) {
                console.log('[Boudica AutoSignup] API key generated successfully');
                return {
                    success: true,
                    apiKey: data.api_key,
                    email: signupData.email,
                    message: data.message,
                    rateLimits: data.rate_limits
                };
            } else {
                console.error('[Boudica AutoSignup] Unexpected response:', data);
                return {
                    success: false,
                    error: 'Unexpected server response'
                };
            }
        } catch (error) {
            console.error('[Boudica AutoSignup] Network error:', error);
            return {
                success: false,
                error: 'Network error: ' + error.message
            };
        }
    }


}

// Export for use in other modules
window.SAMLAuthenticator = SAMLAuthenticator;
