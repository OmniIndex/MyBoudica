/**
 * markdownFormatter.js
 *
 * A small, dependency-free markdown-to-HTML renderer — no vendored
 * library, matching this app's "no framework, no build pipeline" style
 * used elsewhere. Built specifically for editorPanel.js's Home tab, not
 * as a general-purpose parser — covers the common subset of markdown a
 * README/landing-page doc actually uses:
 *   headers (#, ##, ###...), **bold**, *italic*, `inline code`,
 *   fenced ``` code blocks, [links](url), - / * / 1. lists,
 *   > blockquotes, --- horizontal rules, and paragraphs.
 * Not covered: tables, footnotes, nested lists, HTML passthrough,
 * images. Add them here if the Home content ever needs them.
 *
 * SAFETY: the raw markdown text is HTML-escaped before any markdown
 * syntax is interpreted, so literal `<script>`, `<img onerror=...>`,
 * etc. in the source can never become live markup — they render as
 * visible text, same as any other markdown renderer. Link URLs are
 * additionally checked against an http(s)/relative allowlist before
 * being placed in an href, so a `[text](javascript:...)` link in the
 * source can't execute script either.
 */
(function (global) {
    'use strict';

    const BoudicaCode = global.BoudicaCode || (global.BoudicaCode = {});

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /** Only allow href schemes that can't execute script — everything else renders as plain text instead of a link. */
    function safeHref(url) {
        if (/^(https?:)?\/\//i.test(url) || /^#/.test(url) || /^\.{0,2}\//.test(url)) {
            return url;
        }
        return null;
    }

    /** Inline formatting: code spans first (so their contents are immune to bold/italic/link parsing), then links, bold, italic. */
    function renderInline(escapedText) {
        let text = escapedText;

        text = text.replace(/`([^`]+)`/g, '<code>$1</code>');

        text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, label, url) => {
            const href = safeHref(url);
            return href ? `<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>` : match;
        });

        text = text.replace(/\*\*([^*]+)\*\*|__([^_]+)__/g, (match, a, b) => `<strong>${a || b}</strong>`);
        text = text.replace(/\*([^*]+)\*|_([^_]+)_/g, (match, a, b) => `<em>${a || b}</em>`);

        return text;
    }

    /**
     * @param {string} markdown - raw markdown source (untrusted — will be escaped).
     * @returns {string} HTML — safe to assign to innerHTML.
     */
    function render(markdown) {
        const lines = (markdown || '').replace(/\r\n/g, '\n').split('\n');
        const html = [];

        let inCodeBlock = false;
        let codeBuffer = [];
        let listType = null; // 'ul' | 'ol' | null
        let listItemBuffer = []; // escaped text segments for the li currently being accumulated
        let paragraphBuffer = [];

        function flushParagraph() {
            if (paragraphBuffer.length) {
                html.push(`<p>${renderInline(paragraphBuffer.join(' '))}</p>`);
                paragraphBuffer = [];
            }
        }
        function flushListItem() {
            if (listItemBuffer.length) {
                html.push(`<li>${renderInline(listItemBuffer.join(' '))}</li>`);
                listItemBuffer = [];
            }
        }
        function closeList() {
            flushListItem();
            if (listType) {
                html.push(`</${listType}>`);
                listType = null;
            }
        }

        for (const rawLine of lines) {
            const line = escapeHtml(rawLine);

            if (/^```/.test(rawLine.trim())) {
                if (inCodeBlock) {
                    html.push(`<pre><code>${codeBuffer.join('\n')}</code></pre>`);
                    codeBuffer = [];
                }
                inCodeBlock = !inCodeBlock;
                continue;
            }
            if (inCodeBlock) {
                codeBuffer.push(line);
                continue;
            }

            const trimmed = rawLine.trim();

            if (trimmed === '') {
                flushParagraph();
                closeList();
                continue;
            }
            if (/^(---|\*\*\*|___)\s*$/.test(trimmed)) {
                flushParagraph();
                closeList();
                html.push('<hr>');
                continue;
            }

            const headerMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
            if (headerMatch) {
                flushParagraph();
                closeList();
                const level = headerMatch[1].length;
                html.push(`<h${level}>${renderInline(escapeHtml(headerMatch[2]))}</h${level}>`);
                continue;
            }

            const quoteMatch = trimmed.match(/^>\s?(.*)$/);
            if (quoteMatch) {
                flushParagraph();
                closeList();
                html.push(`<blockquote>${renderInline(escapeHtml(quoteMatch[1]))}</blockquote>`);
                continue;
            }

            const ulMatch = trimmed.match(/^[-*+]\s+(.*)$/);
            const olMatch = trimmed.match(/^\d+\.\s+(.*)$/);
            if (ulMatch || olMatch) {
                flushParagraph();
                const wantType = ulMatch ? 'ul' : 'ol';
                if (listType !== wantType) {
                    closeList(); // flushes any pending item from a previous list first
                    html.push(`<${wantType}>`);
                    listType = wantType;
                } else {
                    flushListItem(); // same list, but a new item marker — close out the previous item
                }
                listItemBuffer = [escapeHtml(ulMatch ? ulMatch[1] : olMatch[1])];
                continue;
            }

            // Plain text line: a continuation of the current list item if
            // one's open (markdown soft-wraps list items across lines with
            // no blank line between — very common in hand-written docs),
            // otherwise part of an ordinary paragraph.
            if (listType) {
                listItemBuffer.push(escapeHtml(trimmed));
            } else {
                paragraphBuffer.push(escapeHtml(trimmed));
            }
        }

        flushParagraph();
        closeList();
        if (inCodeBlock && codeBuffer.length) {
            html.push(`<pre><code>${codeBuffer.join('\n')}</code></pre>`);
        }

        return html.join('\n');
    }

    BoudicaCode.MarkdownFormatter = { render };
})(window);
