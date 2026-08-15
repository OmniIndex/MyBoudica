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
                <h1>Talk Digest</h1>
                <p class="bd-digest-subtitle">What happened while you were away — summarized where it's a quick catch-up, flagged where you should actually go join in.</p>
            </div>
            <button id="bdDigestRefresh" class="btn btn-secondary">Refresh</button>
        </div>

        <div id="bdDigestList" class="bd-digest-list">
            <span class="bd-digest-loading">Loading…</span>
        </div>
    </div>
</div>
