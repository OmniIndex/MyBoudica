// Memory dialog (2026-11-25): what Boudica has learnt from this person.
//
// Opened from the header's Memory button, the same kind of overlay as the
// Knowledge Base and Connected Services. Lists the person's learnt rules and
// facts, their suggestions from recent chats, and their organisation's items
// (read-only), with search and filters. Each of their own items can be
// deleted or proposed to their organisation's administrators; suggestions
// can be kept or dropped. Items not used or added in the last 90 days are
// behind "Show all", so a long memory stays easy to look through.
//
// Server: GET/POST <apiBase>/learned_memory (slm_cgi_handlers.cpp
// handle_learned_memory, src/learned_memory.hpp) - the same functions as the
// chat commands ("show what you have learned", "forget learned #N", ...).
//
// The same file is used by MyBoudica's boudicaai app (js/memory-ui.js): keep
// the two copies identical.
(function () {
    'use strict';

    const RECENT_DAYS = 90;
    let items = [];
    let filter = 'all';
    let showAll = false;
    let confirmingId = 0;

    function el(id) { return document.getElementById(id); }

    function apiBase() {
        return (window.app && window.app.api && window.app.api.apiBase) ? window.app.api.apiBase : '/api/boudica';
    }

    function authHeaders() {
        const api = window.app && window.app.api;
        return (api && typeof api._authHeaders === 'function') ? api._authHeaders() : {};
    }

    function esc(text) {
        const d = document.createElement('div');
        d.textContent = text == null ? '' : String(text);
        return d.innerHTML;
    }

    function setStatus(text, isError) {
        const s = el('memoryStatus');
        if (!s) return;
        s.textContent = text || '';
        s.classList.toggle('hidden', !text);
        s.classList.toggle('memory-status-error', !!isError);
    }

    function isRecent(it) {
        const last = it.last_used || it.created;
        if (!last) return true;
        const days = (Date.now() - new Date(last + 'T00:00:00').getTime()) / 86400000;
        return days <= RECENT_DAYS;
    }

    function kindOf(it) {
        if (it.status === 'proposed') return 'suggestion';
        return it.kind;   // rule | fact
    }

    function matches(it, query) {
        if (filter !== 'all' && kindOf(it) !== filter) return false;
        if (query && it.content.toLowerCase().indexOf(query) === -1) return false;
        return true;
    }

    function badge(it) {
        if (it.scope === 'org') return '<span class="memory-badge memory-badge-org">From your organisation</span>';
        if (it.status === 'proposed') return '<span class="memory-badge memory-badge-suggestion">Suggestion</span>';
        if (it.share === 'waiting') return '<span class="memory-badge memory-badge-waiting">Waiting for approval</span>';
        if (it.share === 'rejected') return '<span class="memory-badge memory-badge-rejected">Not approved for the organisation</span>';
        return '';
    }

    function actions(it) {
        if (it.scope === 'org') return '';
        if (confirmingId === it.id) {
            return '<span class="memory-confirm">Delete this?</span>' +
                `<button class="btn btn-sm btn-danger" data-act="delete-yes" data-id="${it.id}">Delete</button>` +
                `<button class="btn btn-sm btn-secondary" data-act="delete-no" data-id="${it.id}">Cancel</button>`;
        }
        if (it.status === 'proposed') {
            return `<button class="btn btn-sm btn-primary" data-act="keep" data-id="${it.id}">Keep</button>` +
                `<button class="btn btn-sm btn-secondary" data-act="drop" data-id="${it.id}">Drop</button>`;
        }
        let html = '';
        if (it.share !== 'waiting') {
            html += `<button class="btn btn-sm btn-secondary" data-act="share" data-id="${it.id}" ` +
                'title="Ask your organisation\'s administrators to use this for everyone">Propose to organisation</button>';
        }
        html += `<button class="btn btn-sm btn-secondary memory-delete" data-act="delete" data-id="${it.id}" title="Delete">Delete</button>`;
        return html;
    }

    function meta(it) {
        const parts = [it.kind === 'rule' ? 'How you like things done' : 'Fact'];
        if (it.created) parts.push('added ' + it.created);
        if (it.status !== 'proposed') {
            parts.push(it.use_count ? `used ${it.use_count} time${it.use_count === 1 ? '' : 's'}` : 'not used yet');
            if (it.last_used) parts.push('last used ' + it.last_used);
        }
        return parts.join(' · ');
    }

    function render() {
        const list = el('memoryList');
        if (!list) return;
        const query = (el('memorySearch') && el('memorySearch').value || '').trim().toLowerCase();
        const shown = items.filter(it => matches(it, query));
        // Suggestions waiting for a decision always show; everything else is
        // limited to recent items unless "Show all" is on.
        const visible = (showAll || query) ? shown : shown.filter(it => it.status === 'proposed' || isRecent(it));
        const hidden = shown.length - visible.length;

        const counts = { rule: 0, fact: 0, suggestion: 0 };
        items.forEach(it => { counts[kindOf(it)] = (counts[kindOf(it)] || 0) + 1; });
        const label = el('memoryCountLabel');
        if (label) label.textContent = items.length ? `${items.length} item${items.length === 1 ? '' : 's'}` : '';
        document.querySelectorAll('#memoryOverlay .memory-filter').forEach(b => {
            const f = b.getAttribute('data-filter');
            b.classList.toggle('active', f === filter);
            const n = f === 'all' ? items.length : (counts[f] || 0);
            const base = b.getAttribute('data-label');
            b.textContent = n ? `${base} (${n})` : base;
        });

        if (!items.length) {
            list.innerHTML = '<div class="memory-empty">Boudica hasn\'t learnt anything from you yet. ' +
                'Tell it in a chat how you like things done ("From now on, keep my emails short") or something ' +
                'to remember ("Remember that our lab partner is in Lima"), and it will appear here.</div>';
        } else if (!visible.length) {
            list.innerHTML = '<div class="memory-empty">Nothing matches.</div>';
        } else {
            list.innerHTML = visible.map(it => `
                <div class="memory-item${it.scope === 'org' ? ' memory-item-org' : ''}">
                    <div class="memory-item-text">${esc(it.content)} ${badge(it)}</div>
                    <div class="memory-item-meta">${esc(meta(it))}</div>
                    <div class="memory-item-actions">${actions(it)}</div>
                </div>`).join('');
        }
        const more = el('memoryShowAll');
        if (more) {
            more.classList.toggle('hidden', !hidden && !showAll);
            more.textContent = showAll ? 'Show only recent' : `Show all (${hidden} more not used in the last ${RECENT_DAYS} days)`;
        }
    }

    async function load() {
        setStatus('');
        const list = el('memoryList');
        if (list && !items.length) list.innerHTML = '<div class="memory-empty">Loading…</div>';
        try {
            const r = await fetch(`${apiBase()}/learned_memory`, { headers: authHeaders(), credentials: 'same-origin' });
            const data = await r.json();
            if (!data.success) throw new Error(data.error || 'Could not load');
            items = data.items || [];
            render();
        } catch (e) {
            items = [];
            render();
            setStatus(e.message || 'Could not load what Boudica has learnt.', true);
        }
    }

    async function act(action, id) {
        setStatus('');
        try {
            const r = await fetch(`${apiBase()}/learned_memory`, {
                method: 'POST',
                headers: { ...authHeaders(), 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ action, id: String(id) }),
            });
            const data = await r.json();
            if (!data.success) throw new Error(data.error || 'That did not work');
            const done = {
                delete: 'Deleted. Boudica no longer uses it.',
                share: 'Sent to your organisation\'s administrators. Until they approve it, it is only used in your own chats.',
                keep: 'Kept. Boudica uses it from your next message.',
                drop: 'Dropped. Boudica will not suggest it again.',
            }[action];
            confirmingId = 0;
            await load();
            setStatus(done, false);
        } catch (e) {
            setStatus(e.message, true);
        }
    }

    function open() {
        const ov = el('memoryOverlay');
        if (!ov) return;
        ov.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
        confirmingId = 0;
        load();
    }

    function close() {
        const ov = el('memoryOverlay');
        if (!ov) return;
        ov.classList.add('hidden');
        document.body.style.overflow = '';
    }

    function init() {
        const btn = el('memoryBtn');
        if (!btn || !el('memoryOverlay')) return;
        btn.addEventListener('click', open);
        el('memoryCloseBtn').addEventListener('click', close);
        el('memoryRefreshBtn').addEventListener('click', load);
        const backdrop = el('memoryOverlay').querySelector('.services-overlay-backdrop');
        if (backdrop) backdrop.addEventListener('click', close);
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape' && !el('memoryOverlay').classList.contains('hidden')) close();
        });
        el('memorySearch').addEventListener('input', render);
        el('memoryShowAll').addEventListener('click', () => { showAll = !showAll; render(); });
        document.querySelectorAll('#memoryOverlay .memory-filter').forEach(b => {
            b.setAttribute('data-label', b.textContent.trim());
            b.addEventListener('click', () => { filter = b.getAttribute('data-filter'); render(); });
        });
        el('memoryList').addEventListener('click', e => {
            const b = e.target.closest('button[data-act]');
            if (!b) return;
            const id = parseInt(b.getAttribute('data-id'), 10);
            const a = b.getAttribute('data-act');
            if (a === 'delete') { confirmingId = id; render(); }
            else if (a === 'delete-no') { confirmingId = 0; render(); }
            else if (a === 'delete-yes') act('delete', id);
            else act(a, id);
        });
    }

    window.MemoryUI = { open, close, reload: load };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
