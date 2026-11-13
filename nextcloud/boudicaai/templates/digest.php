<?php

declare(strict_types=1);

use OCP\Util;

Util::addScript(OCA\BoudicaAi\AppInfo\Application::APP_ID, 'boudicaai-digest');
Util::addStyle(OCA\BoudicaAi\AppInfo\Application::APP_ID, 'boudicaai-digest');

?>

<div id="app-content">
    <div id="boudicaai-digest-root">
        <div class="bd-digest-header">
            <div>
                <h1>Boudica Mail Digest</h1>
                <p class="bd-digest-subtitle">Your new email in one line each, sorted by Boudica, plus what happened in Talk while you were away.</p>
            </div>
            <button id="bdDigestRefresh" class="btn btn-secondary">Refresh</button>
        </div>

        <h2 class="bd-digest-section">New email <span class="bd-digest-section-note">(last 24 hours)</span></h2>
        <div id="bdMailDigest" class="bd-mail-digest">
            <span class="bd-digest-loading">Loading…</span>
        </div>

        <h2 class="bd-digest-section">Talk</h2>
        <div id="bdDigestList" class="bd-digest-list">
            <span class="bd-digest-loading">Loading…</span>
        </div>
    </div>
</div>
