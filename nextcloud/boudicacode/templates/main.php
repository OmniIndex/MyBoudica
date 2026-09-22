<?php
// This template is intentionally minimal. It provides the mount point
// and pulls in JS + CSS via Nextcloud's own script()/style() helpers —
// which handle the CSP nonce correctly for us, so nothing here needs
// to touch CSP APIs directly.
//
// IMPORTANT: these are classic scripts (no import/export), loaded in
// dependency order onto a shared window.BoudicaCode namespace. Order
// matters — eventBus and state must load before anything that uses
// them, and main.js must load last.
//
// Once a real build step (webpack/esbuild) exists, collapse this into
// a single bundled script('boudicacode', 'boudica-code-main') call.

style('boudicacode', 'style');

// script()/style() (below) handle the CSP nonce automatically via
// Nextcloud's own asset pipeline - but that does NOT cover the two inline
// print_unescaped('<script>...') calls right below, which need their own
// explicit nonce attribute. Without it, Nextcloud's nonce-based CSP with
// 'strict-dynamic' on script-src-elem rejects any inline <script> outright
// (confirmed live via a real browser CSP violation - 'unsafe-inline' alone
// would not help either, browsers ignore it once 'strict-dynamic' is
// present), silently leaving window.BOUDICA_API_BASE unset and the
// localStorage pre-seed never applied. $_['cspNonce'] is injected into
// every template's own $_ array by \OC\Template\Base::__construct() (not
// just the page layout), so it's available here directly.
$_cspNonceAttr = ' nonce="' . \OCP\Util::sanitizeHTML($_['cspNonce']) . '"';

// Must print before boudicaAuth.js/boudicaApi.js load - both read
// window.BOUDICA_API_BASE as their override (see the comments in those
// files). $_['boudica_api_base'] comes from PageController::index().
print_unescaped('<script' . $_cspNonceAttr . '>window.BOUDICA_API_BASE = ' . json_encode($_['boudica_api_base'], JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) . ';</script>');

// Pre-seeds localStorage['boudica_session'] from the credential minted at
// Keycloak login time (PageController::index()) so boudicaAuth.js's
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

// Monaco's AMD loader must load before anything that calls window.require.
script('boudicacode', 'vendor/monaco/vs/loader');

script('boudicacode', 'src/core/eventBus');
script('boudicacode', 'src/core/state');
script('boudicacode', 'src/core/webdavClient');
script('boudicacode', 'src/chat/boudicaAuth');
script('boudicacode', 'src/chat/boudicaApi');
script('boudicacode', 'src/chat/promptBuilder');
script('boudicacode', 'src/chat/diffUtil');
script('boudicacode', 'src/project/projectScaffolder');
script('boudicacode', 'src/project/projectCreator');
script('boudicacode', 'src/project/newProjectDialog');
script('boudicacode', 'src/project/projectSwitcher');
script('boudicacode', 'src/editor/markdownFormatter');
script('boudicacode', 'src/editor/editorPanel');
script('boudicacode', 'src/files/fileSearch');
script('boudicacode', 'src/files/fileTree');
script('boudicacode', 'src/chat/chatPanel');
script('boudicacode', 'src/main');
?>

<div id="app-content">
    <div id="boudica-code-root" data-project-root="<?php p($_['projectRoot'] ?? ''); ?>">
        <!-- Populated entirely by js/src/main.js -->
    </div>
</div>
