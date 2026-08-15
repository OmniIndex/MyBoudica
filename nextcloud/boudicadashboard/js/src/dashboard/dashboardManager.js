/**
 * dashboardManager.js
 *
 * Ported from the uploaded admin-portal dashboard.js. Changes from
 * the original:
 *
 *   1. Namespacing: the original assumed bare global `API` and
 *      `Utils` objects (defined elsewhere in the admin portal, not
 *      included in what was ported here). This uses
 *      BoudicaCode.API / BoudicaCode.Utils instead — see
 *      dashboardApi.js and dashboardUtils.js.
 *
 *   2. Scope: this dashboard shows only the logged-in Nextcloud
 *      user's own data. The `/dashboard/*_individual` endpoints
 *      scope their response server-side to whichever
 *      { user_id, api_key } pair is POSTed (see dashboardApi.js's
 *      docblock). loadOverallUsage() no longer reads/displays
 *      total_users, and the Top Users bar chart
 *      (loadTopUsers/topUsersChart) is dropped entirely, since
 *      "top users" doesn't apply to a single-user view.
 *
 *   3. Transport: every call is `API.post(path, extraBody?)` rather
 *      than `API.get(path)` — the backend takes credentials as a
 *      JSON body ({ user_id, api_key, ...extraBody }) rather than an
 *      Authorization header, so even read-only endpoints are POSTs.
 *      The endpoint names carry an `_individual` suffix; only
 *      `overall_usage_individual` has been confirmed against the
 *      real backend so far — the other three (`most_prompted_individual`,
 *      `security_risks_individual`, `usage_timeline_individual`)
 *      follow that same naming convention by assumption and should
 *      be confirmed.
 *
 * Classic script. Must load after dashboardUtils.js, dashboardAuth.js,
 * dashboardApi.js, and the vendored Chart.js, before src/main.js.
 */
(function (global) {
    'use strict';

    const BoudicaCode = global.BoudicaCode || (global.BoudicaCode = {});
    const API = BoudicaCode.API;
    const Utils = BoudicaCode.Utils;

    class DashboardManager {
        constructor() {
            this.charts = {
                timeline: null,
            };

            document.getElementById('refreshDashboard')?.addEventListener('click', () => {
                this.loadDashboard();
            });
        }

        async loadDashboard() {
            try {
                await Promise.all([
                    this.loadOverallUsage(),
                    this.loadMostPrompted(),
                    this.loadSecurityRisks(),
                    this.loadUsageTimeline(),
                    this.loadTokenUsage(),
                ]);
            } catch (error) {
                console.error('Dashboard load error:', error);
                Utils.showToast('Failed to load dashboard data', 'error');
            }
        }

        async loadOverallUsage() {
            try {
                const data = await API.post('/dashboard/overall_usage_individual');

                document.getElementById('totalPrompts').textContent = Utils.formatNumber(data.total_prompts);
                document.getElementById('promptsToday').textContent = Utils.formatNumber(data.prompts_today);

                const avgTime = Math.round(data.avg_response_time_ms);
                document.getElementById('avgResponseTime').textContent = `${avgTime}ms`;

            } catch (error) {
                console.error('Failed to load overall usage:', error);
                document.getElementById('totalPrompts').textContent = 'Error';
                document.getElementById('promptsToday').textContent = 'Error';
                document.getElementById('avgResponseTime').textContent = 'Error';
            }
        }

        async loadMostPrompted() {
            const container = document.getElementById('mostPromptedList');

            try {
                const data = await API.post('/dashboard/most_prompted_individual');
                const prompts = data.most_prompted || [];

                if (prompts.length === 0) {
                    container.innerHTML = '<p class="empty-state">No data available</p>';
                    return;
                }

                container.innerHTML = prompts.map(item => `
                    <div class="prompted-item">
                        <div class="prompted-content">
                            <div class="prompted-text">${this.escapeHtml(item.prompt_preview)}</div>
                            <div class="prompted-meta">Asked ${item.frequency} times</div>
                        </div>
                        <div class="prompted-frequency">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
                            </svg>
                            ${item.frequency}
                        </div>
                    </div>
                `).join('');

            } catch (error) {
                console.error('Failed to load most prompted:', error);
                container.innerHTML = '<p class="error">Failed to load data</p>';
            }
        }

        async loadSecurityRisks() {
            const container = document.getElementById('securityRisksList');

            try {
                const data = await API.post('/dashboard/security_risks_individual');
                const risks = data.security_risks || [];

                if (risks.length === 0) {
                    container.innerHTML = `
                        <div class="empty-state">
                            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                                <path d="M9 12l2 2 4-4"></path>
                            </svg>
                            <h3>No Flagged Prompts</h3>
                            <p>Nothing of yours has been flagged</p>
                        </div>
                    `;
                    return;
                }

                container.innerHTML = risks.map(risk => `
                    <div class="risk-item">
                        <div class="risk-header">
                            <div class="risk-timestamp">${Utils.formatDate(risk.timestamp)}</div>
                        </div>
                        <div class="risk-prompt">${this.escapeHtml(risk.prompt_preview)}</div>
                        <div class="risk-reason">${this.escapeHtml(risk.flag_reason)}</div>
                    </div>
                `).join('');

            } catch (error) {
                console.error('Failed to load security risks:', error);
                container.innerHTML = '<p class="error">Failed to load data</p>';
            }
        }

        async loadUsageTimeline() {
            try {
                const data = await API.post('/dashboard/usage_timeline_individual', { days: 30 });
                const timeline = data.timeline || [];

                const canvas = document.getElementById('usageTimelineChart');
                const ctx = canvas.getContext('2d');

                if (this.charts.timeline) {
                    this.charts.timeline.destroy();
                }

                this.charts.timeline = new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: timeline.map(item => new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })),
                        datasets: [
                            {
                                label: 'Your Prompts',
                                data: timeline.map(item => item.prompt_count),
                                borderColor: '#2563eb',
                                backgroundColor: 'rgba(37, 99, 235, 0.1)',
                                tension: 0.4,
                                fill: true,
                            },
                        ],
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: true,
                        plugins: {
                            legend: {
                                position: 'bottom',
                            },
                            tooltip: {
                                mode: 'index',
                                intersect: false,
                            },
                        },
                        scales: {
                            y: {
                                beginAtZero: true,
                                ticks: {
                                    precision: 0,
                                },
                            },
                        },
                    },
                });

            } catch (error) {
                console.error('Failed to load usage timeline:', error);
            }
        }

    async loadTokenUsage() {
        try {
            const data = await API.post('/dashboard/user_usage_individual');
            const users = (data.user_usage || []).slice(0, 10);
            
            const canvas = document.getElementById('topUsersChart');
            const ctx = canvas.getContext('2d');
            
            // Destroy existing chart
            if (this.charts.topUsers) {
                this.charts.topUsers.destroy();
            }
            
            this.charts.topUsers = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: users.map(user => this.truncateUserId(user.user_id)),
                    datasets: [{
                        label: 'Total Prompts',
                        data: users.map(user => user.total_prompts),
                        backgroundColor: 'rgba(37, 99, 235, 0.8)',
                        borderColor: '#2563eb',
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    indexAxis: 'y',
                    plugins: {
                        legend: {
                            display: false
                        },
                        tooltip: {
                            callbacks: {
                                title: (items) => {
                                    const index = items[0].dataIndex;
                                    return users[index].user_id;
                                },
                                afterBody: (items) => {
                                    const index = items[0].dataIndex;
                                    const user = users[index];
                                    return [
                                        `Total Tokens: ${Utils.formatNumber(user.total_tokens)}`,
                                        `Avg Response: ${Math.round(user.avg_response_time)}ms`
                                    ];
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            beginAtZero: true,
                            ticks: {
                                precision: 0
                            }
                        }
                    }
                }
            });
            
        } catch (error) {
            console.error('Failed to load top users:', error);
        }
    }        

    truncateUserId(userId) {
        if (userId.length <= 20) return userId;
        return userId.substring(0, 17) + '...';
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    }

    BoudicaCode.DashboardManager = DashboardManager;
})(window);
