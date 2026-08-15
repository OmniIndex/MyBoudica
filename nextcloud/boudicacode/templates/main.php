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

// Monaco's AMD loader must load before anything that calls window.require.
script('boudicacode', 'vendor/monaco/vs/loader');

script('boudicacode', 'src/core/eventBus');
script('boudicacode', 'src/core/state');
script('boudicacode', 'src/core/webdavClient');
script('boudicacode', 'src/chat/boudicaAuth');
script('boudicacode', 'src/chat/boudicaApi');
script('boudicacode', 'src/chat/promptBuilder');
script('boudicacode', 'src/project/projectScaffolder');
script('boudicacode', 'src/project/projectCreator');
script('boudicacode', 'src/project/newProjectDialog');
script('boudicacode', 'src/project/projectSwitcher');
script('boudicacode', 'src/editor/markdownFormatter');
script('boudicacode', 'src/editor/editorPanel');
script('boudicacode', 'src/files/fileTree');
script('boudicacode', 'src/chat/chatPanel');
script('boudicacode', 'src/main');
?>

<div id="app-content">
    <div id="boudica-code-root" data-project-root="<?php p($_['projectRoot'] ?? ''); ?>">
        <!-- Populated entirely by js/src/main.js -->
    </div>
</div>
