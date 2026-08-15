<?php
// Minimal shell template — mount point only, all logic in JS.
// Classic scripts (no import/export) on a shared window.BoudicaCode
// namespace, same convention as the boudicacode app. Order matters:
// vendor chart.js -> core utils/api -> dashboardManager -> bootstrap.

style('boudicadashboard', 'style');

script('boudicadashboard', 'vendor/chart.umd.min');

script('boudicadashboard', 'src/core/dashboardUtils');
script('boudicadashboard', 'src/core/dashboardAuth');
script('boudicadashboard', 'src/core/dashboardApi');
script('boudicadashboard', 'src/dashboard/dashboardManager');
script('boudicadashboard', 'src/main');
?>

<div id="app-content">
    <div id="boudica-dashboard-root">
        <div class="dashboard-header">
            <h1>My Boudica Usage</h1>
            <button id="refreshDashboard" class="btn btn-secondary">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="23 4 23 10 17 10"></polyline>
                    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                </svg>
                Refresh
            </button>
        </div>

        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-icon">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                </div>
                <div class="stat-content">
                    <h3>Total Prompts</h3>
                    <p class="stat-value" id="totalPrompts">—</p>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                </div>
                <div class="stat-content">
                    <h3>Prompts Today</h3>
                    <p class="stat-value" id="promptsToday">—</p>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                </div>
                <div class="stat-content">
                    <h3>Avg Response Time</h3>
                    <p class="stat-value" id="avgResponseTime">—</p>
                </div>
            </div>
        </div>

        <div class="charts-grid">
            <div class="chart-container">
                <h3>Your Usage — Last 30 Days</h3>
                <canvas id="usageTimelineChart"></canvas>
            </div>
            <div class="chart-container">
                <h3>Your Usage — Tokens</h3>
                <canvas id="topUsersChart"></canvas>
            </div>            
        </div>

        <div class="charts-grid">
            <div class="chart-container">
                <h3>Your Most Prompted</h3>
                <div id="mostPromptedList"></div>
            </div>
            <div class="chart-container">
                <h3>Your Flagged Prompts</h3>
                <div id="securityRisksList"></div>
            </div>
        </div>
    </div>
</div>
