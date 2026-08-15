/**
 * main.js
 *
 * Bootstraps the dashboard once the DOM (and everything loaded before
 * this script in templates/main.php) is ready. Same
 * DOMContentLoaded-> instantiate pattern as boudicacode's main.js.
 */
(function (global) {
    'use strict';

    const BoudicaCode = global.BoudicaCode || (global.BoudicaCode = {});

    document.addEventListener('DOMContentLoaded', () => {
        BoudicaCode.dashboardManager = new BoudicaCode.DashboardManager();
        BoudicaCode.dashboardManager.loadDashboard();
    });
})(window);
