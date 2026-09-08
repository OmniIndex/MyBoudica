/**
 * diffUtil.js
 *
 * A small, dependency-free line-level diff — same "no vendored library"
 * approach as editor/markdownFormatter.js. Built specifically so an AI
 * edit has SOME visible preview of what changed before/as it's
 * auto-applied — previously the only way to see what an edit actually
 * did was to manually pull up the .boudica_backups/ copy _backupFile()
 * writes and diff it by hand after the fact. Not a general-purpose diff
 * engine — classic LCS-based line diff, sized for what this app targets
 * (small scripts), not huge generated files.
 *
 * Classic script — no dependencies, safe to load any time before
 * chatPanel.js.
 */
(function (global) {
    'use strict';

    const BoudicaCode = global.BoudicaCode || (global.BoudicaCode = {});

    // Above this many lines on either side, the O(n*m) LCS table (and the
    // DP fill itself) gets expensive for a plain chat-log preview with no
    // real payoff — fall back to a line-count-only summary instead of a
    // full diff rather than risk janking the UI thread on a huge file.
    const MAX_DIFF_LINES = 1500;

    /** Classic LCS table, backtracked forward into a sequence of {type, line} ops in original order. */
    function lineDiff(oldLines, newLines) {
        const n = oldLines.length;
        const m = newLines.length;
        const lcs = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));

        for (let i = n - 1; i >= 0; i--) {
            for (let j = m - 1; j >= 0; j--) {
                lcs[i][j] = oldLines[i] === newLines[j]
                    ? lcs[i + 1][j + 1] + 1
                    : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
            }
        }

        const ops = [];
        let i = 0;
        let j = 0;
        while (i < n && j < m) {
            if (oldLines[i] === newLines[j]) {
                ops.push({ type: 'context', line: oldLines[i] });
                i++;
                j++;
            } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
                ops.push({ type: 'remove', line: oldLines[i] });
                i++;
            } else {
                ops.push({ type: 'add', line: newLines[j] });
                j++;
            }
        }
        while (i < n) {
            ops.push({ type: 'remove', line: oldLines[i] });
            i++;
        }
        while (j < m) {
            ops.push({ type: 'add', line: newLines[j] });
            j++;
        }
        return ops;
    }

    /**
     * @param {string} oldText
     * @param {string} newText
     * @param {number} [maxShownLines] - caps how many +/- lines actually get printed, so one giant rewrite doesn't dump hundreds of lines into the chat log
     * @returns {string} a compact, plain-text diff summary suitable for a chat bubble (rendered via textContent, not innerHTML — see chatPanel.js's _appendMessage/_setMessage — so this is deliberately plain text, no markup)
     */
    function summarize(oldText, newText, maxShownLines = 40) {
        const oldLines = (oldText || '').split('\n');
        const newLines = (newText || '').split('\n');

        if (oldLines.length > MAX_DIFF_LINES || newLines.length > MAX_DIFF_LINES) {
            return `${oldLines.length} → ${newLines.length} lines (file too large for a full diff preview).`;
        }

        const ops = lineDiff(oldLines, newLines);
        const changed = ops.filter((o) => o.type !== 'context');
        if (changed.length === 0) {
            return 'No line changes.';
        }

        const added = changed.filter((o) => o.type === 'add').length;
        const removed = changed.filter((o) => o.type === 'remove').length;
        const shown = changed.slice(0, maxShownLines);
        const body = shown.map((o) => (o.type === 'add' ? `+ ${o.line}` : `- ${o.line}`)).join('\n');
        const omitted = changed.length - shown.length;

        return `+${added} -${removed} lines\n${body}${omitted > 0 ? `\n… and ${omitted} more changed line(s)` : ''}`;
    }

    BoudicaCode.DiffUtil = { summarize };
})(window);
