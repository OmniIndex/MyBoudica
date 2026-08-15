(function (global) {
    'use strict';

    const BoudicaCode = global.BoudicaCode || (global.BoudicaCode = {});

    document.addEventListener('DOMContentLoaded', () => {
        BoudicaCode.AgentManager.init();
        BoudicaCode.AgentManager.loadAgents();
    });
})(window);
