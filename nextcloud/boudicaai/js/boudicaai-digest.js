// boudicaai-digest.js — Boudica Mail Digest page (was Talk Digest until 2026-11-13)
//
// Two sections: "New email" (one line per message, Boudica's summary and
// badges, from /digest/mail -> the Boudica Mail server's /api/digest) and
// "Talk" (below, unchanged). Every value from a server is set as text,
// never as HTML: subjects and senders come from strangers.
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


    // ── New email (Boudica Mail) ─────────────────────────────────────────
    const CATEGORY_LABEL = {
        personal: 'Personal', work: 'Work', customer: 'Customer', order: 'Order',
        invoice: 'Invoice', newsletter: 'Newsletter', notification: 'Notification', other: 'Other',
    };

    function node(tag, cls, text) {
        const n = document.createElement(tag);
        if (cls) n.className = cls;
        if (text !== undefined && text !== null) n.textContent = text;
        return n;
    }

    function badge(text, kind, title) {
        const b = node('span', 'bd-mail-badge bd-mail-badge--' + kind, text);
        if (title) b.title = title;
        return b;
    }

    function shortTime(iso) {
        const t = Date.parse(iso);
        if (!t) return '';
        const d = new Date(t);
        const today = new Date();
        const hm = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        return d.toDateString() === today.toDateString() ? hm : d.toLocaleDateString([], { weekday: 'short' }) + ' ' + hm;
    }

    function senderName(from) {
        const m = /^\s*"?([^"<]+?)"?\s*<[^>]+>\s*$/.exec(from || '');
        return m ? m[1] : (from || '');
    }

    function renderMailItem(it) {
        const row = node('div', 'bd-mail-row' + (it.suspicious ? ' bd-mail-row--suspicious' : ''));
        row.appendChild(node('span', 'bd-mail-time', shortTime(it.at)));
        const badges = node('span', 'bd-mail-badges');
        if (it.suspicious || it.risk === 'high') {
            badges.appendChild(badge('Suspicious', 'danger', (it.reasons || []).join('\n') || 'Moved to your Suspicious folder'));
        } else {
            if (it.priority === 'urgent') badges.appendChild(badge('Urgent', 'urgent'));
            if (it.needs_reply) badges.appendChild(badge('Reply needed', 'reply'));
        }
        badges.appendChild(badge(CATEGORY_LABEL[it.category] || 'Other', 'cat'));
        row.appendChild(badges);
        const text = node('span', 'bd-mail-text');
        text.appendChild(node('span', 'bd-mail-from', senderName(it.from)));
        text.appendChild(node('span', 'bd-mail-summary', it.summary || it.subject || ''));
        text.title = (it.subject || '') + (it.suspicious ? '\nIn your Suspicious folder: ' + (it.reasons || []).join('; ') : '');
        row.appendChild(text);
        return row;
    }

    function renderLinkForm(hosts, intro) {
        const box = node('details', 'bd-mail-link');
        if (intro) box.open = true;
        box.appendChild(node('summary', '', intro ? 'Connect your Boudica Mail mailbox' : 'Connect another mailbox'));
        box.appendChild(node('p', 'bd-digest-empty',
            'If you use Nextcloud Mail, mailboxes you added there appear here by themselves. Otherwise enter your mailbox address and an app password for it.'));
        const form = node('form', 'bd-mail-link-form');
        const email = node('input'); email.type = 'email'; email.required = true; email.placeholder = 'you@example.com'; email.autocomplete = 'username';
        const pw = node('input'); pw.type = 'password'; pw.required = true; pw.placeholder = 'App password'; pw.autocomplete = 'current-password';
        const host = node('select');
        (hosts || []).forEach(h => { const o = node('option', '', h); o.value = h; host.appendChild(o); });
        const btn = node('button', 'btn btn-primary', 'Connect'); btn.type = 'submit';
        const msg = node('span', 'bd-mail-link-msg');
        [email, pw, host, btn, msg].forEach(x => form.appendChild(x));
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            btn.disabled = true; msg.textContent = 'Checking…';
            fetch(OC.generateUrl('/apps/boudicaai/digest/mail/link'), {
                method: 'POST', credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json', requesttoken: OC.requestToken },
                body: JSON.stringify({ email: email.value, password: pw.value, host: host.value }),
            }).then(r => r.json()).then(d => {
                pw.value = '';
                if (d.ok) { msg.textContent = 'Connected.'; loadMail(); }
                else msg.textContent = d.error || 'Not connected.';
            }).catch(() => { msg.textContent = 'Could not connect.'; })
              .finally(() => { btn.disabled = false; });
        });
        box.appendChild(form);
        return box;
    }

    function unlinkButton(email) {
        const b = node('button', 'bd-mail-unlink', 'Disconnect');
        b.addEventListener('click', () => {
            fetch(OC.generateUrl('/apps/boudicaai/digest/mail/unlink'), {
                method: 'POST', credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json', requesttoken: OC.requestToken },
                body: JSON.stringify({ email }),
            }).then(() => loadMail());
        });
        return b;
    }

    function renderMail(data) {
        const root = el('bdMailDigest');
        if (!root) return;
        root.innerHTML = '';
        const boxes = data.mailboxes || [];
        if (!boxes.length) {
            root.appendChild(renderLinkForm(data.hosts, true));
            return;
        }
        boxes.forEach(mb => {
            const sec = node('div', 'bd-mail-box');
            const head = node('div', 'bd-mail-box-head');
            head.appendChild(node('span', 'bd-mail-box-name', mb.email));
            const items = mb.items || [];
            if (mb.ok) {
                const urgent = items.filter(i => !i.suspicious && i.priority === 'urgent').length;
                const reply = items.filter(i => !i.suspicious && i.needs_reply).length;
                const susp = items.filter(i => i.suspicious || i.risk === 'high').length;
                const parts = [items.length + (items.length === 1 ? ' new email' : ' new emails')];
                if (urgent) parts.push(urgent + ' urgent');
                if (reply) parts.push(reply + ' need' + (reply === 1 ? 's' : '') + ' a reply');
                if (susp) parts.push(susp + ' suspicious');
                head.appendChild(node('span', 'bd-mail-box-count', parts.join(' · ')));
            }
            if (mb.source === 'linked') head.appendChild(unlinkButton(mb.email));
            sec.appendChild(head);
            if (!mb.ok) {
                sec.appendChild(node('div', 'bd-digest-error', mb.error || 'Could not load this mailbox.'));
            } else if (!items.length) {
                sec.appendChild(node('div', 'bd-digest-empty', 'No new email in the last 24 hours (or Boudica is not switched on for this mailbox yet).'));
            } else {
                items.forEach(it => sec.appendChild(renderMailItem(it)));
            }
            root.appendChild(sec);
        });
        root.appendChild(renderLinkForm(data.hosts, false));
    }

    function loadMail() {
        const root = el('bdMailDigest');
        if (root) root.innerHTML = '<span class="bd-digest-loading">Loading…</span>';
        fetch(OC.generateUrl('/apps/boudicaai/digest/mail'), { headers: { Accept: 'application/json' }, credentials: 'same-origin' })
            .then(r => r.json())
            .then(renderMail)
            .catch(err => { if (root) { root.innerHTML = ''; root.appendChild(node('span', 'bd-digest-error', 'Could not load email: ' + err.message)); } });
    }

    function init() {
        el('bdDigestRefresh')?.addEventListener('click', () => { load(); loadMail(); });
        load();
        loadMail();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
