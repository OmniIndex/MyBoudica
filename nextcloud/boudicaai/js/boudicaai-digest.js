// boudicaai-digest.js — Talk Digest page
//
// Reads from this app's own /digest/data endpoint (same-origin, normal
// Nextcloud session auth — no api_key involved, unlike the cross-origin
// Boudica CGI calls elsewhere in this app). Data is produced by
// DigestPollJob + DigestService, not generated live on page load.

(function () {
    'use strict';

    function el(id) { return document.getElementById(id); }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function timeAgo(unixSeconds) {
        if (!unixSeconds) return '';
        const diff = Math.max(0, Math.floor(Date.now() / 1000) - unixSeconds);
        if (diff < 60) return 'just now';
        if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
        if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
        return Math.floor(diff / 86400) + 'd ago';
    }

    function roomUrl(token) {
        return OC.generateUrl('/call/' + encodeURIComponent(token));
    }

    function renderEntry(entry) {
        const isActive = entry.status === 'active';
        const card = document.createElement('div');
        card.className = 'bd-digest-card' + (isActive ? ' bd-digest-card--active' : '');

        const header = document.createElement('div');
        header.className = 'bd-digest-card-header';

        const name = document.createElement('span');
        name.className = 'bd-digest-room-name';
        name.textContent = entry.room_name;
        header.appendChild(name);

        if (isActive) {
            const badge = document.createElement('span');
            badge.className = 'bd-digest-badge bd-digest-badge--active';
            badge.textContent = 'Active discussion — go join in';
            header.appendChild(badge);
        } else if (entry.generated_at) {
            const ts = document.createElement('span');
            ts.className = 'bd-digest-timestamp';
            ts.textContent = timeAgo(entry.generated_at);
            header.appendChild(ts);
        }

        card.appendChild(header);

        const body = document.createElement('div');
        body.className = 'bd-digest-card-body';
        if (isActive) {
            body.innerHTML = '<span class="bd-digest-active-text">More going on here than a quick summary would do justice to.</span>';
        } else if (entry.summary) {
            body.textContent = entry.summary;
        } else {
            body.innerHTML = '<span class="bd-digest-empty">No new activity yet.</span>';
        }
        card.appendChild(body);

        const footer = document.createElement('a');
        footer.className = 'bd-digest-link';
        footer.href = roomUrl(entry.token);
        footer.textContent = 'Open in Talk →';
        card.appendChild(footer);

        return card;
    }

    function render(digest) {
        const list = el('bdDigestList');
        if (!list) return;

        if (!digest || digest.length === 0) {
            list.innerHTML = '<span class="bd-digest-empty">Nothing to show yet — check back after a few Talk conversations happen.</span>';
            return;
        }

        list.innerHTML = '';
        digest.forEach(entry => list.appendChild(renderEntry(entry)));
    }

    function load() {
        const list = el('bdDigestList');
        if (list) list.innerHTML = '<span class="bd-digest-loading">Loading…</span>';

        fetch(OC.generateUrl('/apps/boudicaai/digest/data'), {
            headers: { 'Accept': 'application/json' },
            credentials: 'same-origin',
        })
            .then(r => r.json())
            .then(data => render(data.digest || []))
            .catch(err => {
                if (list) list.innerHTML = '<span class="bd-digest-error">Could not load digest: ' + escapeHtml(err.message) + '</span>';
            });
    }

    function init() {
        el('bdDigestRefresh')?.addEventListener('click', load);
        load();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
