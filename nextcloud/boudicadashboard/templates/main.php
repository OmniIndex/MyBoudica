<?php
// Minimal shell template — mount point only, all logic in JS.
// Classic scripts (no import/export) on a shared window.BoudicaCode
// namespace, same convention as the boudicacode app. Order matters:
// vendor chart.js -> core utils/api -> dashboardManager -> bootstrap.

style('boudicadashboard', 'style');

// The two inline print_unescaped('<script>...') calls below need an
// explicit nonce attribute - Nextcloud's nonce-based CSP with
// 'strict-dynamic' on script-src-elem rejects any inline <script> lacking
// one outright (confirmed live via a real browser CSP violation on the
// sibling boudicaai/boudicacode apps' identical pattern; 'unsafe-inline'
// alone would not help either, browsers ignore it once 'strict-dynamic' is
// present). Without this, window.BOUDICA_API_BASE silently never gets set
// and the localStorage pre-seed never applies. $_['cspNonce'] is injected
// into every template's own $_ array by \OC\Template\Base::__construct()
// (not just the page layout), so it's available here directly.
$_cspNonceAttr = ' nonce="' . \OCP\Util::sanitizeHTML($_['cspNonce']) . '"';

// Must print before dashboardAuth.js/dashboardApi.js load - both read
// window.BOUDICA_API_BASE as their override (see the comments in those
// files). $_['boudica_api_base'] comes from PageController::index().
print_unescaped('<script' . $_cspNonceAttr . '>window.BOUDICA_API_BASE = ' . json_encode($_['boudica_api_base'], JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) . ';</script>');

// Pre-seeds localStorage['boudica_session'] from the credential minted at
// Keycloak login time (PageController::index()) so dashboardAuth.js's
// ensureSession() finds it already there and never falls through to its own
// unconditional /beta/signup auto-signup. No-op (prints nothing) for a user
// with no provisioned key yet - e.g. the setup.sh admin account, or anyone
// who hasn't logged in through "Sign in with Boudica" yet.
if (!empty($_['boudica_provisioned_key'])) {
    print_unescaped(
        '<script' . $_cspNonceAttr . '>(function(){try{if(!localStorage.getItem("boudica_session")){localStorage.setItem("boudica_session",'
        . json_encode(json_encode([
            'token' => $_['boudica_provisioned_key'],
            'email' => $_['boudica_provisioned_email'],
        ]), JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT)
        . ');}}catch(e){}})();</script>'
    );
}

script('boudicadashboard', 'vendor/chart.umd.min');

script('boudicadashboard', 'src/core/dashboardUtils');
script('boudicadashboard', 'src/core/dashboardAuth');
script('boudicadashboard', 'src/core/dashboardApi');
script('boudicadashboard', 'src/dashboard/dashboardManager');
script('boudicadashboard', 'src/main');
?>

<div id="app-content">
    <div id="boudica-dashboard-root">
        <div class="dashboard-header">
            <h1>My Boudica Usage</h1>
            <button id="refreshDashboard" class="btn btn-secondary">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="23 4 23 10 17 10"></polyline>
                    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                </svg>
                Refresh
            </button>
        </div>

        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-icon">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                </div>
                <div class="stat-content">
                    <h3>Total Prompts</h3>
                    <p class="stat-value" id="totalPrompts">—</p>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                </div>
                <div class="stat-content">
                    <h3>Prompts Today</h3>
                    <p class="stat-value" id="promptsToday">—</p>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                </div>
                <div class="stat-content">
                    <h3>Avg Response Time</h3>
                    <p class="stat-value" id="avgResponseTime">—</p>
                </div>
            </div>
        </div>

        <div class="charts-grid">
            <div class="chart-container">
                <h3>Your Usage — Last 30 Days</h3>
                <canvas id="usageTimelineChart"></canvas>
            </div>
            <div class="chart-container">
                <h3>Your Usage — Tokens</h3>
                <canvas id="topUsersChart"></canvas>
            </div>            
        </div>

        <div class="charts-grid">
            <div class="chart-container">
                <h3>Your Most Prompted</h3>
                <div id="mostPromptedList"></div>
            </div>
            <div class="chart-container">
                <h3>Your Flagged Prompts</h3>
                <div id="securityRisksList"></div>
            </div>
        </div>
    </div>
</div>
