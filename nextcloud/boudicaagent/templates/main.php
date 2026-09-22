<?php
style('boudicaagent', 'style');

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

// Must print before agentAuth.js/agentApi.js load - both read
// window.BOUDICA_API_BASE as their override (see the comments in those
// files). $_['boudica_api_base'] comes from PageController::index().
print_unescaped('<script' . $_cspNonceAttr . '>window.BOUDICA_API_BASE = ' . json_encode($_['boudica_api_base'], JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) . ';</script>');

// Pre-seeds localStorage['boudica_session'] from the credential minted at
// Keycloak login time (PageController::index()) so agentAuth.js's
// ensureSession() finds it already there and never falls through to its own
// unconditional /beta/signup auto-signup. No-op (prints nothing) for a user
// with no provisioned key yet - e.g. the setup.sh admin account, or anyone
// who hasn't logged in through "Sign in with Boudica" yet.
if (!empty($_['boudica_provisioned_key'])) {
    print_unescaped(
        '<script' . $_cspNonceAttr . '>(function(){try{'
        . 'var existing=null;try{existing=JSON.parse(localStorage.getItem("boudica_session")||"null");}catch(e){}'
        . 'var provisionedEmail=' . json_encode($_['boudica_provisioned_email'], JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) . ';'
        . 'if(!existing||existing.email!==provisionedEmail){localStorage.setItem("boudica_session",'
        . json_encode(json_encode([
            'token' => $_['boudica_provisioned_key'],
            'email' => $_['boudica_provisioned_email'],
        ]), JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT)
        . ');}}catch(e){}})();</script>'
    );
}

script('boudicaagent', 'src/core/agentAuth');
script('boudicaagent', 'src/core/agentApi');
script('boudicaagent', 'src/agent/agentManager');
script('boudicaagent', 'src/main');
?>

<div id="app-content">
    <div id="boudica-agent-root">

        <div id="agentTileView">
            <div class="agent-header">
                <div>
                    <h1>Agents</h1>
                    <span id="agentsCountLabel" class="agents-count-label hidden"></span>
                </div>
                <button id="agentCreateBtn" class="btn btn-primary">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="12" y1="5" x2="12" y2="19"></line>
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                    New Agent
                </button>
            </div>

            <section class="agent-section">
                <h2 class="agent-section-title">Shared Agents</h2>
                <div id="agentSharedGrid" class="agent-grid"></div>
            </section>

            <section class="agent-section">
                <h2 class="agent-section-title">My Agents</h2>
                <div id="agentPrivateGrid" class="agent-grid"></div>
            </section>
        </div>

        <!-- ── Builder panel ─────────────────────────────────────────── -->
        <div id="agentBuilderPanel" class="agent-builder-panel hidden">
            <div class="agent-builder-header">
                <button id="agentBuilderBackBtn" class="btn btn-icon" title="Back" aria-label="Back">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="15 18 9 12 15 6"></polyline>
                    </svg>
                </button>
                <h2 id="agentBuilderTitle">Create Agent</h2>
            </div>

            <div id="agentBuilderError" class="agent-builder-error hidden"></div>

            <input type="hidden" id="agentBuilderId" value="0">

            <div class="ab-field">
                <label class="ab-label">Agent name <span class="ab-template-hint">(lowercase, letters/digits/underscores — used as <code>@name</code>)</span></label>
                <input type="text" id="agentBuilderName" class="agent-builder-input" placeholder="e.g. weekly_report">
            </div>

            <div class="ab-field">
                <label class="ab-label">Display name</label>
                <input type="text" id="agentBuilderDisplayName" class="agent-builder-input" placeholder="e.g. Weekly Report">
            </div>

            <div class="ab-field">
                <label class="ab-label">Description <span class="ab-template-hint">(optional — shown on the tile)</span></label>
                <input type="text" id="agentBuilderDescription" class="agent-builder-input" placeholder="What does this agent do?">
            </div>

            <h3 class="agent-steps-heading">Steps</h3>
            <div id="agentBuilderStepsList"></div>

            <button id="agentBuilderAddStep" type="button" class="btn btn-secondary agent-add-step-btn">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="12" y1="5" x2="12" y2="19"></line>
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                Add Step
            </button>

            <div class="agent-builder-actions">
                <button id="agentBuilderCancelBtn" class="btn btn-secondary">Cancel</button>
                <button id="agentBuilderSaveBtn" class="btn btn-primary">Save Agent</button>
            </div>
        </div>

        <!-- ── Input dialog (agents that require_input) ─────────────────── -->
        <div id="agentInputDialog" class="agent-modal hidden" aria-hidden="true">
            <div class="agent-modal-backdrop"></div>
            <div class="agent-modal-body">
                <h3 id="agentInputDialogName"></h3>
                <p id="agentInputDialogHint" class="agent-modal-hint"></p>
                <textarea id="agentInputDialogText" class="agent-builder-input" rows="3" placeholder="Enter input…"></textarea>
                <div class="agent-modal-actions">
                    <button id="agentInputCancelBtn" class="btn btn-secondary">Cancel</button>
                    <button id="agentInputRunBtn" class="btn btn-primary">Run</button>
                </div>
            </div>
        </div>

        <!-- ── Run result panel ─────────────────────────────────────────── -->
        <div id="agentRunResultPanel" class="agent-run-result hidden">
            <div class="agent-run-result-header">
                <h3 id="agentRunResultTitle">Agent result</h3>
                <button id="agentRunResultClose" class="btn btn-icon" title="Close" aria-label="Close">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>
            <pre id="agentRunResultText" class="agent-run-result-text"></pre>
        </div>

    </div>
</div>
