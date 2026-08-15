/**
 * dashboardUtils.js
 *
 * Small formatting/toast helpers used by dashboardManager.js. Not
 * provided in the original admin-portal upload (dashboard.js calls a
 * global `Utils` it assumes already exists), so this is a minimal
 * from-scratch implementation covering just what dashboardManager.js
 * actually calls: formatNumber, formatDate, showToast.
 *
 * Classic script, no dependencies, must load before dashboardManager.js.
 */
(function (global) {
    'use strict';

    const BoudicaCode = global.BoudicaCode || (global.BoudicaCode = {});

    function formatNumber(n) {
        if (n === null || n === undefined || Number.isNaN(n)) return '—';
        return new Intl.NumberFormat('en-US').format(n);
    }

    function formatDate(value) {
        if (!value) return '—';
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return String(value);
        return d.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
        });
    }

    /**
     * Minimal toast — uses Nextcloud's own OC.Notification when
     * available (so it matches the rest of the NC UI), falls back to
     * console output otherwise.
     */
    function showToast(message, type) {
        if (global.OC && OC.Notification && typeof OC.Notification.show === 'function') {
            OC.Notification.show(message, { type: type === 'error' ? 'error' : undefined, timeout: 5 });
            return;
        }
        (type === 'error' ? console.error : console.log)(`[BoudicaDashboard] ${message}`);
    }

    BoudicaCode.Utils = { formatNumber, formatDate, showToast };
})(window);
