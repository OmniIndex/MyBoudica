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

    // Friendly display name: prefer service_name with underscores → spaces, title-cased
    function displayName(svc) {
        return svc.service_name
            .replace(/[-_]/g, ' ')
            .replace(/\b\w/g, c => c.toUpperCase());
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
                { headers: { Accept: 'application/json' } }
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
                        { headers: { Accept: 'application/json' } })
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
        list.innerHTML = _apps.map(app => {
            const connected = !!_connected[app.service_name];
            const name      = displayName(app);
            const provider  = providerLabel(app);

            return `
                <div class="service-item ${connected ? 'service-connected' : 'service-disconnected'}"
                     data-service="${esc(app.service_name)}">
                    <div class="service-info">
                        <span class="service-provider">${provider}</span>
                        <span class="service-name">${esc(name)}</span>
                    </div>
                    <div class="service-actions">
                        ${connected
                            ? `<span class="service-badge connected">Connected</span>
                               <button class="btn-service-disconnect" title="Disconnect ${esc(name)}"
                                   onclick="window._BoudicaServices.disconnect('${esc(app.service_name)}')">
                                   Disconnect
                               </button>`
                            : `<button class="btn-service-connect" title="Connect ${esc(name)}"
                                   onclick="window._BoudicaServices.connect('${esc(app.service_name)}')">
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
                { headers: { Accept: 'application/json' } }
            );
            const data = await resp.json();

            if (!data.auth_url) {
                if (_oauthPopup) _oauthPopup.close();
                console.error('OAuth start error:', data.error || 'No auth_url returned');
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
            return;
        }

        // Poll until the popup closes, then refresh status
        const poll = setInterval(() => {
            if (!_oauthPopup || _oauthPopup.closed) {
                clearInterval(poll);
                _oauthPopup = null;
                loadServices();   // refresh statuses
            }
        }, 800);
    }

    // ── Disconnect ────────────────────────────────────────────────────────────
    async function disconnect(serviceName) {
        if (!confirm(`Disconnect from ${serviceName}? You can reconnect at any time.`)) return;

        const base   = getApiBase();
        const userId = getUserId();

        try {
            const resp = await fetch(`${base}/oauth/disconnect`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ service: serviceName, user_id: userId }),
            });
            const data = await resp.json();
            if (!data.success && !data.ok) throw new Error(data.error || 'Disconnect failed');
            _connected[serviceName] = false;
            renderServices(document.getElementById('servicesList'));
            updateBadge();
        } catch (err) {
            console.error('Disconnect error:', err);
            alert('Failed to disconnect: ' + err.message);
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
