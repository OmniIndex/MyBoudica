/**
 * Boudica Auto-Signup for Nextcloud
 * 
 * Injected into Nextcloud after user login (Keycloak auth is already done by Nextcloud)
 * Checks if user has saved Boudica API key in Nextcloud config
 * If not, automatically generates one via https://boudi.ca/api/boudica/beta/signup
 * Stores the key in Nextcloud's boudica_api_key user preference
 */

(function() {
    'use strict';

    console.log('[Boudica AutoSignup] Initializing...');

    // Boudica API endpoint for beta signup
    const BOUDICA_API_URL = 'https://boudi.ca/api/boudica/beta/signup';

    /**
     * Main initialization - runs on page load
     */
    async function initBoudicaAutosignup() {
        try {
            // Get Nextcloud user info from OC.getCurrentUser()
            const currentUser = OC.getCurrentUser();
            if (!currentUser) {
                console.log('[Boudica AutoSignup] Not authenticated - skipping');
                return;
            }

            console.log('[Boudica AutoSignup] User authenticated:', currentUser.uid);

            // Check if user already has API key saved in Nextcloud config
            const existingKey = await getBoudicalApiKeyFromConfig(currentUser.uid);
            if (existingKey) {
                console.log('[Boudica AutoSignup] API key already saved in config - skipping');
                return;
            }

            console.log('[Boudica AutoSignup] No saved API key found - initiating auto-signup...');

            // Perform auto-signup
            const signupResult = await performBoudicalAutosignup(currentUser);
            if (signupResult.success) {
                // Save to Nextcloud config
                await saveBoudicalApiKeyToConfig(currentUser.uid, signupResult.apiKey);
                
                // Display success modal
                displayApiKeyModal(signupResult);
            }
        } catch (error) {
            console.error('[Boudica AutoSignup] Error:', error);
            // Fail silently - don't block user's Nextcloud usage
        }
    }

    /**
     * Retrieve stored API key from Nextcloud config via OCS API
     */
    async function getBoudicalApiKeyFromConfig(userId) {
        try {
            const response = await fetch('/ocs/v2.php/apps/admin/api/v1/config/users/' + userId + '/boudica_api_key', {
                method: 'GET',
                headers: {
                    'OCS-APIRequest': 'true',
                    'Accept': 'application/json'
                }
            });

            if (response.ok) {
                const data = await response.json();
                if (data.ocs && data.ocs.data && data.ocs.data.value) {
                    return data.ocs.data.value;
                }
            }
        } catch (error) {
            console.log('[Boudica AutoSignup] Could not retrieve existing key:', error.message);
        }
        return null;
    }

    /**
     * Save API key to Nextcloud config via OCS API
     */
    async function saveBoudicalApiKeyToConfig(userId, apiKey) {
        try {
            const response = await fetch('/ocs/v2.php/apps/admin/api/v1/config/users/' + userId + '/boudica_api_key', {
                method: 'POST',
                headers: {
                    'OCS-APIRequest': 'true',
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: 'value=' + encodeURIComponent(apiKey)
            });

            if (response.ok) {
                console.log('[Boudica AutoSignup] API key saved to Nextcloud config');
                return true;
            } else {
                console.warn('[Boudica AutoSignup] Failed to save key to config:', response.status);
            }
        } catch (error) {
            console.error('[Boudica AutoSignup] Error saving to config:', error);
        }
        return false;
    }

    /**
     * Call Boudica API signup endpoint
     */
    async function performBoudicalAutosignup(ncUser) {
        try {
            // Get user email from Nextcloud
            const userEmail = await getNextcloudUserEmail(ncUser.uid) || (ncUser.uid);

            // Prepare signup payload with Nextcloud user data
            const signupData = {
                name: ncUser.displayName || ncUser.uid,
                email: userEmail,
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

    /**
     * Get user's email from Nextcloud user info API
     */
    async function getNextcloudUserEmail(userId) {
        try {
            const response = await fetch('/ocs/v2.php/apps/provisioning_api/api/v1/users/' + userId, {
                method: 'GET',
                headers: {
                    'OCS-APIRequest': 'true',
                    'Accept': 'application/json'
                }
            });

            if (response.ok) {
                const data = await response.json();
                if (data.ocs && data.ocs.data && data.ocs.data.email) {
                    return data.ocs.data.email;
                }
            }
        } catch (error) {
            console.log('[Boudica AutoSignup] Could not retrieve user email:', error.message);
        }
        return null;
    }

    /**
     * Display modal with newly generated API key
     */
    function displayApiKeyModal(result) {
        // Create modal HTML
        const modal = document.createElement('div');
        modal.id = 'boudica-autosignup-modal';
        modal.className = 'boudica-modal';
        modal.innerHTML = `
            <div class="boudica-modal-overlay"></div>
            <div class="boudica-modal-content">
                <div class="boudica-modal-header">
                    <h2>🎉 Boudica API Key Generated</h2>
                    <button class="boudica-modal-close" onclick="document.getElementById('boudica-autosignup-modal').remove()">✕</button>
                </div>
                <div class="boudica-modal-body">
                    <p>Your Boudica API key has been automatically generated and saved to your Nextcloud settings.</p>
                    
                    <div class="boudica-key-display">
                        <label>Your API Key:</label>
                        <div class="boudica-key-box">
                            <code id="api-key-display" class="boudica-key-code">${escapeHtml(result.apiKey)}</code>
                            <button class="boudica-copy-btn" onclick="copyBoudicalKey('api-key-display')">
                                📋 Copy
                            </button>
                        </div>
                    </div>
                    
                    <div class="boudica-key-info">
                        <p><strong>Email:</strong> ${escapeHtml(result.email)}</p>
                        <p><strong>Rate Limits:</strong></p>
                        <ul>
                            <li>Requests per minute: ${result.rateLimits.rpm}</li>
                            <li>Requests per day: ${result.rateLimits.rpd}</li>
                        </ul>
                        <p class="boudica-note">
                            💾 <strong>Your key is saved</strong> in Nextcloud and can be used in the Boudica integration settings.
                        </p>
                    </div>
                </div>
                <div class="boudica-modal-footer">
                    <button class="boudica-btn-primary" onclick="document.getElementById('boudica-autosignup-modal').remove()">
                        Got It! 👍
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        addModalStyles();
    }

    /**
     * Add CSS styles for modal
     */
    function addModalStyles() {
        if (document.getElementById('boudica-modal-styles')) {
            return;
        }

        const style = document.createElement('style');
        style.id = 'boudica-modal-styles';
        style.textContent = `
            .boudica-modal {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 100000;
            }

            .boudica-modal-overlay {
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.5);
            }

            .boudica-modal-content {
                position: relative;
                background: white;
                border-radius: 8px;
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
                max-width: 500px;
                width: 90%;
                max-height: 90vh;
                overflow-y: auto;
            }

            .boudica-modal-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 24px;
                border-bottom: 1px solid #e0e0e0;
            }

            .boudica-modal-header h2 {
                margin: 0;
                font-size: 20px;
                color: #333;
            }

            .boudica-modal-close {
                background: none;
                border: none;
                font-size: 24px;
                cursor: pointer;
                color: #999;
                padding: 0;
            }

            .boudica-modal-close:hover {
                color: #333;
            }

            .boudica-modal-body {
                padding: 24px;
            }

            .boudica-modal-body p {
                margin: 0 0 16px 0;
                color: #555;
                line-height: 1.5;
            }

            .boudica-key-display {
                margin: 24px 0;
            }

            .boudica-key-display label {
                display: block;
                font-weight: 600;
                margin-bottom: 8px;
                color: #333;
            }

            .boudica-key-box {
                display: flex;
                align-items: center;
                gap: 8px;
                background: #f5f5f5;
                border: 1px solid #ddd;
                border-radius: 4px;
                padding: 12px;
            }

            .boudica-key-code {
                flex: 1;
                font-family: 'Courier New', monospace;
                font-size: 12px;
                word-break: break-all;
                color: #333;
                margin: 0;
            }

            .boudica-copy-btn {
                background: #007bff;
                color: white;
                border: none;
                border-radius: 4px;
                padding: 6px 12px;
                cursor: pointer;
                font-size: 12px;
                white-space: nowrap;
            }

            .boudica-copy-btn:hover {
                background: #0056b3;
            }

            .boudica-key-info {
                background: #f9f9f9;
                border-left: 4px solid #007bff;
                padding: 12px;
                border-radius: 4px;
                margin: 16px 0;
                font-size: 14px;
            }

            .boudica-key-info p {
                margin: 8px 0;
            }

            .boudica-key-info ul {
                margin: 8px 0 0 20px;
                padding: 0;
            }

            .boudica-key-info li {
                margin: 4px 0;
            }

            .boudica-note {
                color: #666;
                font-size: 12px;
                margin-top: 12px !important;
            }

            .boudica-modal-footer {
                padding: 16px 24px;
                border-top: 1px solid #e0e0e0;
                display: flex;
                justify-content: flex-end;
            }

            .boudica-btn-primary {
                background: #28a745;
                color: white;
                border: none;
                border-radius: 4px;
                padding: 10px 20px;
                cursor: pointer;
                font-size: 14px;
                font-weight: 600;
            }

            .boudica-btn-primary:hover {
                background: #218838;
            }

            @media (max-width: 600px) {
                .boudica-modal-content {
                    width: 95%;
                }
            }
        `;

        document.head.appendChild(style);
    }

    /**
     * Escape HTML in displayed content
     */
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Global function to copy API key to clipboard
     */
    window.copyBoudicalKey = function(elementId) {
        const element = document.getElementById(elementId);
        if (!element) return;

        const textToCopy = element.textContent || element.value;
        navigator.clipboard.writeText(textToCopy).then(() => {
            const btn = event.target;
            const originalText = btn.textContent;
            btn.textContent = '✓ Copied!';
            setTimeout(() => {
                btn.textContent = originalText;
            }, 2000);
        }).catch(err => {
            console.error('Copy failed:', err);
            alert('Failed to copy. Please copy manually.');
        });
    };

    // Run on page load
    if (document.readyState === 'loading') {
        //document.addEventListener('DOMContentLoaded', initBoudicaAutosignup);
    } else {
        //initBoudicaAutosignup();
    }

})();
