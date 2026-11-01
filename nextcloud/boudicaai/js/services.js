// Boudica — Connected Services overlay
//
// Loads available OAuth apps registered for this domain, then checks which
// ones the current user has connected. Shows a Connect / Disconnect button
// for each service and opens the OAuth flow in a popup window.
//
// The overlay is opened by the plug icon button (#connectedServicesBtn) in the
// chat header. It replaces the former sidebar section.
//
// Depends on:  app.api.getCurrentUserId()  and  app.api.apiBase
// CGI endpoints:
//   GET  <apiBase>/oauth/app/list                      → list registered apps
//   GET  <apiBase>/oauth/status?service=X&user_id=Y   → check connection status
//   GET  <apiBase>/oauth/start?service=X&user_id=Y    → begin OAuth flow (popup)
//   POST <apiBase>/oauth/disconnect  {service,user_id} → disconnect

(function () {
    'use strict';
    // ── Provider display metadata ─────────────────────────────────────────────
    const PROVIDER_META = {
        microsoft:  { label: 'Microsoft',   icon: '🔷' },
        google:     { label: 'Google',      icon: '🔴' },
        slack:      { label: 'Slack',       icon: '💬' },
        github:     { label: 'GitHub',      icon: '🐙' },
        gitlab:     { label: 'GitLab',      icon: '🦊' },
        atlassian:  { label: 'Atlassian',   icon: '🔵' },
        notion:     { label: 'Notion',      icon: '⬛' },
        dropbox:    { label: 'Dropbox',     icon: '📦' },
        box:        { label: 'Box',         icon: '📁' },
        airtable:   { label: 'Airtable',    icon: '🗃️'  },
        hubspot:    { label: 'HubSpot',     icon: '🟠' },
        salesforce: { label: 'Salesforce',  icon: '☁️'  },
        pipedrive:  { label: 'Pipedrive',   icon: '🟢' },
        zoho:       { label: 'Zoho',        icon: '🔶' },
        intuit:     { label: 'QuickBooks',  icon: '💚' },
        xero:       { label: 'Xero',        icon: '🔵' },
        snowflake:  { label: 'Snowflake',   icon: '❄️'  },
        tableau:    { label: 'Tableau',     icon: '📊' },
        linkedin:   { label: 'LinkedIn',    icon: '🔗' },
        twitter:    { label: 'Twitter/X',   icon: '🐦' },
        tiktok:     { label: 'TikTok',      icon: '🎵' },
        linear:     { label: 'Linear',      icon: '🔺' },
        bitbucket:  { label: 'Bitbucket',   icon: '🪣' },
    };

    // ── Helpers ───────────────────────────────────────────────────────────────
    function getApiBase() {
        return (window.app && window.app.api && window.app.api.apiBase)
            ? window.app.api.apiBase
            : '/api/boudica';
    }

    function getUserId() {
        return (window.app && window.app.api)
            ? window.app.api.getCurrentUserId()
            : 'anonymous';
    }

    // Mirrors chat-api.js's _authHeaders() - added 2026-08-26/27, this file
    // never picked it up. Every oauth/* call below was sent with no
    // Authorization header at all, so the backend's Bearer-token check
    // (authenticate_request() in slm_cgi_utils.cpp) rejected them
    // unconditionally with 401, regardless of whether the user's session/
    // identity had resolved correctly.
    function getAuthHeaders() {
        const token = window.app && window.app.auth && window.app.auth.accessToken;
        return token ? { Authorization: 'Bearer ' + token } : {};
    }

    function esc(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function providerLabel(svc) {
        const m = PROVIDER_META[svc.provider];
        return m ? `${m.icon} ${m.label}` : esc(svc.provider || svc.service_name);
    }

    // What each kind of service is called and what it lets Boudica do (2026-11-01).
    // Registrations are named by admins ("glb_gcalander"), and that name used to be
    // shown as-is ("Glb Gcalander"), with nothing saying what connecting it does.
    const SERVICE_INFO = [
        { re: /gmail/i,              name: 'Gmail',           what: 'Boudica can read your email (it cannot send or delete anything).',     ask: 'Do I have any unread emails?' },
        { re: /calen|gcal/i,         name: 'Google Calendar', what: 'Boudica can read your calendars (it cannot add or change events).',    ask: "What's on my calendar tomorrow?" },
        { re: /outlook/i,            name: 'Outlook',         what: 'Boudica can read your Outlook email.',                                  ask: 'Any emails from Sarah this week?' },
        { re: /g_?drive|google.?drive/i, name: 'Google Drive', what: 'Boudica can search the files in your Google Drive.',                  ask: 'Find the budget spreadsheet in my Google Drive' },
        { re: /sharepoint|onedrive/i, name: 'SharePoint / OneDrive', what: 'Boudica can search your SharePoint and OneDrive files.',        ask: 'Search SharePoint for the travel policy' },
        { re: /github/i,             name: 'GitHub',          what: 'Boudica can search your GitHub repositories.',                          ask: 'Search GitHub for the login code' },
        { re: /gitlab/i,             name: 'GitLab',          what: 'Boudica can read your GitLab projects.',                                ask: 'Get the code from the GitLab project website' },
        { re: /slack/i,              name: 'Slack',           what: 'Boudica can search your Slack messages.',                               ask: 'Search Slack for the release date' },
        { re: /dropbox/i,            name: 'Dropbox',         what: 'Boudica can list and search your Dropbox files.',                       ask: 'What is in my Dropbox?' },
    ];
    function serviceInfo(svc) {
        const key = `${svc.service_name || ''} ${svc.provider || ''}`;
        return SERVICE_INFO.find(i => i.re.test(svc.service_name || '')) || SERVICE_INFO.find(i => i.re.test(key)) || null;
    }

    // Friendly display name: the service's real name when known, otherwise the
    // registration name without its "glb_" prefix, underscores to spaces, title-cased.
    function displayName(svc) {
        const info = serviceInfo(svc);
        if (info) return info.name;
        return (svc.service_name || '')
            .replace(/^glb[_-]/i, '')
            .replace(/[-_]/g, ' ')
            .replace(/\b\w/g, c => c.toUpperCase());
    }

    // A message at the top of the overlay (errors used to go to the console only).
    function showServicesMessage(text, isError) {
        const list = document.getElementById('servicesList');
        if (!list || !list.parentNode) { if (text) alert(text); return; }
        let box = document.getElementById('servicesMessage');
        if (!box) {
            box = document.createElement('div');
            box.id = 'servicesMessage';
            box.setAttribute('role', 'status');
            box.style.margin = '0 0 10px';
            box.style.padding = '8px 10px';
            box.style.borderRadius = '6px';
            box.style.fontSize = '0.9em';
            list.parentNode.insertBefore(box, list);
        }
        if (!text) { box.style.display = 'none'; box.textContent = ''; return; }
        box.textContent = text;
        box.style.display = 'block';
        box.style.background = isError ? 'rgba(220, 53, 69, 0.12)' : 'rgba(40, 167, 69, 0.12)';
        box.style.color = 'inherit';
    }
    // Display name for a service_name (connect/disconnect messages).
    function serviceLabel(serviceName) {
        const app = _apps.find(a => a.service_name === serviceName);
        return displayName(app || { service_name: serviceName });
    }


    // ── State ─────────────────────────────────────────────────────────────────
    let _apps      = [];   // registered apps from server
    let _connected = {};   // { service_name: true/false }
    let _oauthPopup = null;

    // ── Overlay open / close ──────────────────────────────────────────────────
    function openOverlay() {
        const overlay = document.getElementById('servicesOverlay');
        if (!overlay) return;
        overlay.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
        loadServices();
    }

    function closeOverlay() {
        const overlay = document.getElementById('servicesOverlay');
        if (!overlay) return;
        overlay.classList.add('hidden');
        document.body.style.overflow = '';
    }

    // ── Update header badge (number of connected services) ────────────────────
    function updateBadge() {
        const badge = document.getElementById('servicesConnectedBadge');
        const countLabel = document.getElementById('servicesCountLabel');
        const connectedCount = Object.values(_connected).filter(Boolean).length;
        const total = _apps.length;

        if (badge) {
            if (connectedCount > 0) {
                badge.textContent = connectedCount;
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }
        }
        if (countLabel) {
            if (total > 0) {
                countLabel.textContent = `${connectedCount} of ${total} connected`;
            } else {
                countLabel.textContent = '';
            }
        }
    }

    // ── Load ──────────────────────────────────────────────────────────────────
    async function loadServices() {
        const list = document.getElementById('servicesList');
        if (!list) return;

        list.innerHTML = '<span class="services-loading">Loading…</span>';

        const base   = getApiBase();
        const userId = getUserId();
        if (userId === 'anonymous') {
            list.innerHTML = '<span class="services-empty">Sign in to view services.</span>';
            return;
        }

        try {
            // 1. Get all registered app keys for this domain
            const appsResp = await fetch(
                `${base}/oauth/app/list?user_id=${encodeURIComponent(userId)}`,
                { headers: { Accept: 'application/json', ...getAuthHeaders() } }
            );
            const appsData = await appsResp.json();
            if (!appsData.success) throw new Error(appsData.error || 'Failed to load services');
            _apps = appsData.apps || [];

            if (_apps.length === 0) {
                list.innerHTML = '<span class="services-empty">No services registered yet.<br>Ask your admin to add connectors.</span>';
                updateBadge();
                return;
            }

            // 2. Check connection status for each service in parallel
            const statuses = await Promise.allSettled(
                _apps.map(app =>
                    fetch(`${base}/oauth/status?service=${encodeURIComponent(app.service_name)}&user_id=${encodeURIComponent(userId)}`,
                        { headers: { Accept: 'application/json', ...getAuthHeaders() } })
                        .then(r => r.json())
                        .then(d => ({ service: app.service_name, connected: Array.isArray(d.connected) ? d.connected.includes(app.service_name) : !!d.connected }))
                        .catch(() => ({ service: app.service_name, connected: false }))
                )
            );

            _connected = {};
            statuses.forEach(s => {
                if (s.status === 'fulfilled') _connected[s.value.service] = s.value.connected;
            });

            renderServices(list);
            updateBadge();

        } catch (err) {
            console.warn('Connected Services load error:', err);
            list.innerHTML = `<span class="services-empty">Could not load services.</span>`;
        }
    }

    // ── Render ────────────────────────────────────────────────────────────────
    function renderServices(list) {
        if (!list) return;
        // Two registrations of the same service (ts-1 has "glb_gdrive" and "gdrive")
        // would show the same name: add the registration name to tell them apart.
        const nameCount = {};
        _apps.forEach(a => { const n = displayName(a); nameCount[n] = (nameCount[n] || 0) + 1; });
        list.innerHTML = _apps.map(app => {
            const connected = !!_connected[app.service_name];
            const baseName  = displayName(app);
            const name      = nameCount[baseName] > 1 ? `${baseName} (${app.service_name})` : baseName;
            const provider  = providerLabel(app);
            const info      = serviceInfo(app);
            const help      = info
                ? `<span class="service-desc" style="display:block;font-size:0.82em;opacity:0.8;margin-top:2px">${esc(info.what)} Try: “${esc(info.ask)}”</span>`
                : '';

            return `
                <div class="service-item ${connected ? 'service-connected' : 'service-disconnected'}"
                     data-service="${esc(app.service_name)}">
                    <div class="service-info">
                        <span class="service-provider">${provider}</span>
                        <span class="service-name">${esc(name)}</span>
                        ${help}
                    </div>
                    <div class="service-actions">
                        ${connected
                            ? `<span class="service-badge connected">Connected</span>
                               <button class="btn-service-disconnect" title="Disconnect ${esc(name)}"
                                   data-action="disconnect" data-service="${esc(app.service_name)}">
                                   Disconnect
                               </button>`
                            : `<button class="btn-service-connect" title="Connect ${esc(name)}"
                                   data-action="connect" data-service="${esc(app.service_name)}">
                                   Connect
                               </button>`
                        }
                    </div>
                </div>
            `;
        }).join('');
    }

    // ── Connect — opens OAuth flow in a small popup ────────────────────────────
    async function connect(serviceName) {
        const base   = getApiBase();
        const userId = getUserId();


        // Close any existing popup
        if (_oauthPopup && !_oauthPopup.closed) _oauthPopup.close();

        // Open a blank popup immediately (must be in the click handler to avoid
        // popup blockers), then navigate it once we have the auth URL.
        const w = 520, h = 680;
        const left = Math.max(0, (screen.width  - w) / 2);
        const top  = Math.max(0, (screen.height - h) / 2);
        _oauthPopup = window.open('about:blank', 'boudica_oauth',
            `width=${w},height=${h},left=${left},top=${top},resizable=yes,scrollbars=yes`);

        try {
            // Fetch the provider auth URL from the CGI
            const resp = await fetch(
                `${base}/oauth/start?service=${encodeURIComponent(serviceName)}&user_id=${encodeURIComponent(userId)}`,
                { headers: { Accept: 'application/json', ...getAuthHeaders() } }
            );
            const data = await resp.json();

            if (!data.auth_url) {
                if (_oauthPopup) _oauthPopup.close();
                console.error('OAuth start error:', data.error || 'No auth_url returned');
                showServicesMessage(`Couldn't start connecting ${serviceLabel(serviceName)}: ${data.error || 'the server gave no sign-in address'}. Please try again, or ask your administrator.`, true);
                return;
            }

            if (_oauthPopup && !_oauthPopup.closed) {
                // Navigate the already-open popup to the provider login page
                _oauthPopup.location.href = data.auth_url;
            } else {
                // Popup was blocked — fall back to same-tab navigation
                window.location.href = data.auth_url;
                return;
            }
        } catch (err) {
            if (_oauthPopup) _oauthPopup.close();
            console.error('OAuth start fetch error:', err);
            showServicesMessage(`Couldn't reach the server to connect ${serviceLabel(serviceName)}. Please check your connection and try again.`, true);
            return;
        }
        showServicesMessage('', false);

        // Poll until the popup closes, then refresh status and say how it went
        const poll = setInterval(async () => {
            if (!_oauthPopup || _oauthPopup.closed) {
                clearInterval(poll);
                _oauthPopup = null;
                await loadServices();   // refresh statuses
                if (_connected[serviceName]) {
                    showServicesMessage(`${serviceLabel(serviceName)} is connected.`, false);
                } else {
                    showServicesMessage(`${serviceLabel(serviceName)} is not connected. If the sign-in window showed an error or you closed it early, try Connect again.`, true);
                }
            }
        }, 800);
    }

    // ── Disconnect ────────────────────────────────────────────────────────────
    async function disconnect(serviceName) {
        if (!confirm(`Disconnect ${serviceLabel(serviceName)}? Boudica will stop reading it. You can reconnect at any time.`)) return;

        const base   = getApiBase();
        const userId = getUserId();

        try {
            const resp = await fetch(`${base}/oauth/disconnect`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                body:    JSON.stringify({ service: serviceName, user_id: userId }),
            });
            const data = await resp.json();
            if (!data.success && !data.ok) throw new Error(data.error || 'Disconnect failed');
            _connected[serviceName] = false;
            renderServices(document.getElementById('servicesList'));
            updateBadge();
        } catch (err) {
            console.error('Disconnect error:', err);
            showServicesMessage(`Couldn't disconnect ${serviceLabel(serviceName)}: ${err.message}`, true);
        }
    }

    // ── Wire overlay buttons and keyboard ─────────────────────────────────────
    function initOverlay() {
        console.info('Boudica Connected Services overlay: initializing...');   
        // Open button in chat header
        try {
            const openBtn = document.getElementById('connectedServicesBtn');
            if (openBtn) openBtn.addEventListener('click', openOverlay);
            console.info('connectedServicesBtn: hooked in...');   
        } catch (err) {
            console.error('Error hooking connectedServicesBtn:', err);
        }

        // Close button inside overlay
        const openBtn = document.getElementById('connectedServicesBtn');
        if (openBtn) openBtn.addEventListener('click', openOverlay);
        console.info('connectedServicesBtn: hooked in...');   

        // Close button inside overlay
        const closeBtn = document.getElementById('servicesCloseBtn');
        if (closeBtn) closeBtn.addEventListener('click', closeOverlay);
        console.info('servicesCloseBtn: hooked in...');

        // Refresh button inside overlay
        const refreshBtn = document.getElementById('servicesRefreshBtn');
        if (refreshBtn) refreshBtn.addEventListener('click', loadServices);
        console.info('servicesRefreshBtn: hooked in...');

        // Connect/Disconnect buttons are rendered dynamically (renderServices)
        // with data-action/data-service attributes rather than inline onclick=
        // handlers, since Nextcloud's CSP (script-src 'nonce-...') blocks
        // inline event-handler attributes outright - nonces don't cover those.
        // Delegate from the static list container instead.
        const servicesList = document.getElementById('servicesList');
        if (servicesList) {
            servicesList.addEventListener('click', (e) => {
                const btn = e.target.closest('[data-action]');
                if (!btn) return;
                const service = btn.getAttribute('data-service');
                if (btn.getAttribute('data-action') === 'connect') connect(service);
                else if (btn.getAttribute('data-action') === 'disconnect') disconnect(service);
            });
        }

        // Click backdrop to close
        const overlay = document.getElementById('servicesOverlay');
        if (overlay) {
            const backdrop = overlay.querySelector('.services-overlay-backdrop');
            if (backdrop) backdrop.addEventListener('click', closeOverlay);
        }
        console.info('servicesOverlay: hooked in...');

        // Escape key closes overlay
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const overlay = document.getElementById('servicesOverlay');
                if (overlay && !overlay.classList.contains('hidden')) closeOverlay();
            }
        });
    }

    // ── Expose API & boot ─────────────────────────────────────────────────────
    window._BoudicaServices = { connect, disconnect, reload: loadServices, open: openOverlay, close: closeOverlay };

    // Wait until app is initialised (app.api is ready) before doing initial
    // badge load. The overlay itself loads on first open.
    function boot() {
        console.info('Boudica Connected Services overlay: booting...');        
        initOverlay();
        // Poll briefly until the user session is established, then fetch
        // statuses to populate the header badge without opening the overlay.
        let attempts = 0;
        const wait = setInterval(() => {
            attempts++;
            const uid = getUserId();
            if (uid !== 'anonymous' || attempts > 20) {
                clearInterval(wait);
                // Lightweight badge initialisation — load in background
                loadServices();
            }
        }, 500);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
        console.info('Boudica Connected Services overlay: waiting for DOMContentLoaded...');
    } else {
        boot();
    }

})();
