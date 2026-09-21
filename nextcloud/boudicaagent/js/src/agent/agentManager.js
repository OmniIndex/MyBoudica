/**
 * agentManager.js
 *
 * Ported from the uploaded agents-ui.js. Changes from the original:
 *
 *   1. API calls: window.app.api / bare fetch calls replaced with
 *      BoudicaCode.AgentApi (agentApi.js) — see that file's docblock
 *      for the auth-convention assumptions this carries.
 *
 *   2. Running an agent: the original wrote "@agentname text" into a
 *      host page's #chatInput and clicked #sendBtn, relying on that
 *      page's own chat pipeline to actually run the agent. This app
 *      has no host chat page, so runAgent() instead calls
 *      AgentApi.runAgent() directly and renders the response text in
 *      an inline result panel (#agentRunResultPanel).
 *
 *   3. Namespacing: hung off window.BoudicaCode like the other
 *      Boudica Nextcloud apps, exported as BoudicaCode.AgentManager.
 *
 * Everything else — tile rendering, the step builder (service picker,
 * depends-on/loop-over wiring, add/remove step rows), save/delete —
 * is a straight port.
 *
 * Classic script. Must load after agentAuth.js and agentApi.js,
 * before src/main.js.
 */
(function (global) {
    'use strict';

    const BoudicaCode = global.BoudicaCode || (global.BoudicaCode = {});
    const AgentApi = BoudicaCode.AgentApi;

    // ── Service catalogue (mirrors admin portal KNOWN_SERVICES) ───────────────

    const KNOWN_SERVICES = [
        { value: 'boudica',    label: 'Boudica (local model)' },
        { value: 'reasoning',  label: 'Reasoning (bare LLM)' },
        { value: 'db:',        label: 'ODBC database (db:<name>)', placeholder: true },
        { value: 'gmail',      label: 'Gmail' },
        { value: 'gdrive',     label: 'Google Drive' },
        { value: 'gcalendar',  label: 'Google Calendar' },
        { value: 'hubspot',    label: 'HubSpot' },
        { value: 'sharepoint', label: 'SharePoint' },
        { value: 'outlook',    label: 'Outlook / Exchange' },
        { value: 'teams',      label: 'Microsoft Teams' },
        { value: 'slack',      label: 'Slack' },
        { value: 'salesforce', label: 'Salesforce' },
        { value: 'custom',     label: 'Custom service key', placeholder: true },
    ];

    function esc(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // ── State ─────────────────────────────────────────────────────────────────

    let _loaded        = false;
    let _sharedAgents  = [];
    let _privateAgents = [];
    let _pending       = null;   // agent awaiting user input

    // ── Input dialog ─────────────────────────────────────────────────────────

    function openInputDialog(agent) {
        _pending = agent;
        const dialog = document.getElementById('agentInputDialog');
        if (!dialog) return;
        const nameEl  = document.getElementById('agentInputDialogName');
        const hintEl  = document.getElementById('agentInputDialogHint');
        const inputEl = document.getElementById('agentInputDialogText');
        if (nameEl)  nameEl.textContent = agent.display_name || agent.agent_name;
        if (hintEl)  hintEl.textContent = agent.input_hint || agent.description || '';
        if (inputEl) inputEl.value = '';
        dialog.classList.remove('hidden');
        inputEl?.focus();
    }

    function closeInputDialog() {
        document.getElementById('agentInputDialog')?.classList.add('hidden');
        _pending = null;
    }

    function submitInputDialog() {
        if (!_pending) return;
        const inputEl  = document.getElementById('agentInputDialogText');
        const userText = inputEl ? inputEl.value.trim() : '';
        const agent    = _pending;
        closeInputDialog();
        runAgent(agent.agent_name, userText);
    }

    // ── Fetch & render tiles ──────────────────────────────────────────────────

    async function loadAgents() {
        const sharedGrid  = document.getElementById('agentSharedGrid');
        const privateGrid = document.getElementById('agentPrivateGrid');
        if (sharedGrid)  sharedGrid.innerHTML  = '<span class="agents-loading">Loading…</span>';
        if (privateGrid) privateGrid.innerHTML = '<span class="agents-loading">Loading…</span>';

        try {
            const data = await AgentApi.listAgents();
            const all = data.agents || [];
            _sharedAgents  = all.filter(a => !a.is_private);
            _privateAgents = all.filter(a =>  a.is_private);
            _loaded = true;

            renderSharedTiles();
            renderPrivateTiles();
            updateCountLabel(all.length);
        } catch (err) {
            if (sharedGrid)
                sharedGrid.innerHTML = `<span class="agents-empty">Could not load agents: ${esc(err.message)}</span>`;
            if (privateGrid)
                privateGrid.innerHTML = '';
        }
    }

    function getInitials(name) {
        const words = name.trim().split(/\s+/);
        if (words.length >= 2) return (words[0][0] + words[words.length - 1][0]).toUpperCase();
        return name.slice(0, 2).toUpperCase();
    }

    function makeTileHtml(agent, idx, isPrivate) {
        const initials    = getInitials(agent.display_name || agent.agent_name);
        const colorClass  = `agent-tile-color-${(idx % 8) + 1}`;
        const shortcutHtml = agent.shortcut
            ? `<span class="agent-tile-shortcut">${esc(agent.shortcut)}</span>`
            : '';
        const inputBadge = agent.requires_input
            ? `<span class="agent-tile-input-badge" title="This agent will ask for input">✏</span>`
            : '';

        const tileBtn = `
            <button class="agent-tile ${colorClass}"
                    data-agent-id="${agent.agent_id}"
                    title="${esc(agent.display_name || agent.agent_name)}"
                    aria-label="Activate agent: ${esc(agent.display_name || agent.agent_name)}">
                <div class="agent-tile-avatar" aria-hidden="true">${esc(initials)}</div>
                <div class="agent-tile-body">
                    <div class="agent-tile-name">
                        ${esc(agent.display_name || agent.agent_name)}
                        ${shortcutHtml}
                        ${inputBadge}
                    </div>
                    ${agent.description
                        ? `<p class="agent-tile-desc">${esc(agent.description)}</p>`
                        : ''}
                </div>
                <div class="agent-tile-run-hint" aria-hidden="true">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                         stroke="currentColor" stroke-width="2.5"
                         stroke-linecap="round" stroke-linejoin="round">
                        <polygon points="5,3 19,12 5,21"/>
                    </svg>
                    ${agent.requires_input ? 'Fill in…' : 'Run'}
                </div>
            </button>`;

        if (!isPrivate) return tileBtn;

        return `
            <div class="agent-tile-private" data-agent-id="${agent.agent_id}">
                ${tileBtn}
                <div class="agent-tile-actions">
                    <button class="agent-tile-edit-btn btn btn-icon" data-agent-id="${agent.agent_id}"
                            title="Edit agent" aria-label="Edit ${esc(agent.display_name || agent.agent_name)}">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                             stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                    </button>
                    <button class="agent-tile-delete-btn btn btn-icon" data-agent-id="${agent.agent_id}"
                            title="Delete agent" aria-label="Delete ${esc(agent.display_name || agent.agent_name)}">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                             stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="3,6 5,6 21,6"/>
                            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                            <path d="M10 11v6M14 11v6"/>
                            <path d="M9 6V4h6v2"/>
                        </svg>
                    </button>
                </div>
            </div>`;
    }

    function wireAgentTile(tile, agent, isPrivate) {
        if (isPrivate) {
            tile.querySelector('.agent-tile-edit-btn')?.addEventListener('click', (e) => {
                e.stopPropagation();
                openBuilder(agent);
            });
            tile.querySelector('.agent-tile-delete-btn')?.addEventListener('click', (e) => {
                e.stopPropagation();
                deletePrivateAgent(agent);
            });
            tile.querySelector('.agent-tile')?.addEventListener('click', () => {
                if (agent.requires_input) {
                    openInputDialog(agent);
                } else {
                    runAgent(agent.agent_name, '');
                }
            });
        } else {
            tile.addEventListener('click', () => {
                if (agent.requires_input) {
                    openInputDialog(agent);
                } else {
                    runAgent(agent.agent_name, '');
                }
            });
        }
    }

    function renderSharedTiles() {
        const grid = document.getElementById('agentSharedGrid');
        if (!grid) return;
        if (_sharedAgents.length === 0) {
            grid.innerHTML = '<span class="agents-empty">No corporate agents configured.</span>';
            return;
        }
        grid.innerHTML = _sharedAgents.map((a, idx) => makeTileHtml(a, idx, false)).join('');
        grid.querySelectorAll('.agent-tile').forEach((tile, idx) => {
            wireAgentTile(tile, _sharedAgents[idx], false);
        });
    }

    function renderPrivateTiles() {
        const grid = document.getElementById('agentPrivateGrid');
        if (!grid) return;
        if (_privateAgents.length === 0) {
            grid.innerHTML = '<span class="agents-empty-private">You have no private agents yet.</span>';
            return;
        }
        grid.innerHTML = _privateAgents.map((a, idx) => makeTileHtml(a, idx, true)).join('');
        grid.querySelectorAll('.agent-tile-private').forEach((tile, idx) => {
            wireAgentTile(tile, _privateAgents[idx], true);
        });
    }

    function updateCountLabel(count) {
        const label = document.getElementById('agentsCountLabel');
        if (!label) return;
        label.textContent = count === 1 ? '1 agent' : `${count} agents`;
        label.classList.toggle('hidden', count === 0);
    }

    // ── Builder ───────────────────────────────────────────────────────────────

    function openBuilder(agent) {
        document.getElementById('agentTileView')?.classList.add('hidden');
        const panel = document.getElementById('agentBuilderPanel');
        if (!panel) return;
        panel.classList.remove('hidden');

        const list = document.getElementById('agentBuilderStepsList');
        list.innerHTML = '';
        document.getElementById('agentBuilderError')?.classList.add('hidden');

        if (agent) {
            document.getElementById('agentBuilderTitle').textContent   = 'Edit Agent';
            document.getElementById('agentBuilderId').value            = agent.agent_id;
            document.getElementById('agentBuilderName').value          = agent.agent_name;
            document.getElementById('agentBuilderDisplayName').value   = agent.display_name || '';
            document.getElementById('agentBuilderDescription').value   = agent.description || '';
        } else {
            document.getElementById('agentBuilderTitle').textContent   = 'Create Agent';
            document.getElementById('agentBuilderId').value            = '0';
            document.getElementById('agentBuilderName').value          = '';
            document.getElementById('agentBuilderDisplayName').value   = '';
            document.getElementById('agentBuilderDescription').value   = '';
        }

        if (agent && agent.steps && agent.steps.length > 0) {
            agent.steps.forEach(s => addBuilderStepRow(s));
        } else {
            addBuilderStepRow(null);
        }
        document.getElementById('agentBuilderName')?.focus();
    }

    function closeBuilder() {
        document.getElementById('agentBuilderPanel')?.classList.add('hidden');
        document.getElementById('agentTileView')?.classList.remove('hidden');
    }

    // ── Step row builder ──────────────────────────────────────────────────────

    function _buildServiceOptions(savedService) {
        let html = '';
        let isCustom = false;
        let isKnown  = false;

        KNOWN_SERVICES.forEach(s => {
            let sel = '';
            if (savedService) {
                if (s.placeholder) {
                    if (savedService.startsWith(s.value) && savedService.length > s.value.length) sel = ' selected';
                } else {
                    if (savedService === s.value) sel = ' selected';
                }
            }
            if (sel) isKnown = true;
            html += `<option value="${esc(s.value)}"${sel}>${esc(s.label)}</option>`;
        });

        if (savedService && !isKnown) isCustom = true;
        html += `<option value="__custom__"${isCustom ? ' selected' : ''}>Custom…</option>`;
        return html;
    }

    function _customSuffixInfo(savedService) {
        if (!savedService) return { show: false, value: '', placeholder: '' };
        const prefixMatch = KNOWN_SERVICES.find(
            s => s.placeholder && savedService.startsWith(s.value) && savedService.length > s.value.length
        );
        if (prefixMatch) {
            return {
                show:        true,
                value:       savedService.substring(prefixMatch.value.length),
                placeholder: prefixMatch.value === 'db:' ? 'connection name, e.g. domain' : 'value'
            };
        }
        const exactMatch = KNOWN_SERVICES.find(s => !s.placeholder && s.value === savedService);
        if (!exactMatch) {
            return { show: true, value: savedService, placeholder: 'service key, e.g. db:sales' };
        }
        return { show: false, value: '', placeholder: '' };
    }

    function _buildDependsOptions(stepIndex, savedDepends) {
        let html = '<option value="">— none —</option>';
        for (let n = 1; n < stepIndex; n++) {
            const sel = savedDepends && String(savedDepends) === String(n) ? ' selected' : '';
            html += `<option value="${n}"${sel}>Step ${n}</option>`;
        }
        return html;
    }

    function _buildLoopOptions(stepIndex, savedLoop) {
        let html = '<option value="">— no loop —</option>';
        for (let n = 1; n < stepIndex; n++) {
            const sel = savedLoop && String(savedLoop) === String(n) ? ' selected' : '';
            html += `<option value="${n}"${sel}>Step ${n}</option>`;
        }
        return html;
    }

    function _renumberSteps() {
        const rows = document.querySelectorAll('#agentBuilderStepsList .ab-step-row');
        rows.forEach((row, i) => {
            const stepNum = i + 1;
            row.dataset.stepIdx = stepNum;
            row.querySelector('.ab-step-num').textContent = stepNum;

            const sel = row.querySelector('.ab-step-depends');
            if (sel) {
                const prev = sel.value;
                let html = '<option value="">— none —</option>';
                for (let n = 1; n < stepNum; n++) {
                    html += `<option value="${n}"${String(prev) === String(n) ? ' selected' : ''}>Step ${n}</option>`;
                }
                sel.innerHTML = html;
            }

            const loopSel = row.querySelector('.ab-step-loop');
            if (loopSel) {
                const prev = loopSel.value;
                let html = '<option value="">— no loop —</option>';
                for (let n = 1; n < stepNum; n++) {
                    html += `<option value="${n}"${String(prev) === String(n) ? ' selected' : ''}>Step ${n}</option>`;
                }
                loopSel.innerHTML = html;
                const llmSec = row.querySelector('.ab-llm-loop-section');
                if (llmSec) llmSec.style.display = loopSel.value ? 'block' : 'none';
            }

            const tpl = row.querySelector('.ab-step-template');
            if (tpl && !tpl.value) {
                tpl.placeholder = _templatePlaceholder(stepNum);
            }
        });
    }

    function _templatePlaceholder(stepNum) {
        if (stepNum === 1) return 'e.g. {{input}}  or  find emails from {{input}}';
        const prev = stepNum - 1;
        return `e.g. {{task${prev}.result}}  or  summarise: {{task${prev}.result}}`;
    }

    function addBuilderStepRow(step) {
        const list = document.getElementById('agentBuilderStepsList');
        if (!list) return;

        const stepNum = list.querySelectorAll('.ab-step-row').length + 1;
        const svcOpts = _buildServiceOptions(step ? step.service : null);
        const sfx     = _customSuffixInfo(step ? step.service : null);
        const depOpts = _buildDependsOptions(stepNum, step ? step.depends_on : null);
        const loopOpts = _buildLoopOptions(stepNum, step ? step.loop_over : null);
        const llmVisible = (step && step.loop_over) ? 'block' : 'none';

        const row = document.createElement('div');
        row.className = 'ab-step-row';
        row.dataset.stepIdx = stepNum;
        row.innerHTML = `
            <div class="ab-step-header">
                <span class="ab-step-num">${stepNum}</span>
                <span class="ab-step-label">Step ${stepNum}</span>
                <button type="button" class="btn btn-icon ab-step-remove" title="Remove step">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                         stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                </button>
            </div>

            <div class="ab-field">
                <label class="ab-label">Connection / Service</label>
                <div class="ab-service-row">
                    <select class="ab-step-service agent-builder-input">
                        ${svcOpts}
                    </select>
                    <input type="text" class="ab-step-service-suffix agent-builder-input"
                           style="display:${sfx.show ? 'block' : 'none'}"
                           placeholder="${esc(sfx.placeholder)}"
                           value="${esc(sfx.value)}"/>
                </div>
            </div>

            <div class="ab-field">
                <label class="ab-label">
                    Query / Prompt
                    <span class="ab-template-hint">Use <code>{{input}}</code> for user input,
                        <code>{{task1.result}}</code> for a previous step's output,
                        <code>{{item}}</code> when looping over a list</span>
                </label>
                <textarea class="ab-step-template agent-builder-input"
                          rows="3"
                          placeholder="${esc(_templatePlaceholder(stepNum))}"
                >${step ? esc(step.query_template) : ''}</textarea>
            </div>

            <div class="ab-field ab-depends-row">
                <label class="ab-label ab-depends-label">Requires step</label>
                <select class="ab-step-depends agent-builder-input ab-depends-select">
                    ${depOpts}
                </select>
            </div>

            <div class="ab-field ab-loop-row">
                <label class="ab-label ab-loop-label">Loop over items from step</label>
                <select class="ab-step-loop agent-builder-input ab-loop-select">
                    ${loopOpts}
                </select>
                <span class="ab-template-hint">Runs once per line of that step's output; use <code>{{item}}</code> in the query</span>
            </div>
            <div class="ab-field ab-llm-loop-section" style="display:${llmVisible}">
                <label class="ab-label">LLM prompt per item
                    <span class="ab-template-hint">— optional. Leave blank to accumulate raw content.
                    Use <code>{{item}}</code> (path) and <code>{{content}}</code> (fetched data).</span>
                </label>
                <textarea class="ab-step-llm-prompt agent-builder-input" rows="3"
                          placeholder="e.g. For the file {{item}}, list every function with a one-line description."
                >${step ? esc(step.loop_llm_prompt || '') : ''}</textarea>
                <div class="ab-llm-max-row" style="margin-top:0.4rem">
                    <label class="ab-label">Max items <span class="ab-template-hint">(0 = process all)</span></label>
                    <input type="number" class="ab-step-llm-max-items agent-builder-input"
                           min="0" step="1" style="width:6rem"
                           value="${step ? (step.loop_llm_max_items || 0) : 0}">
                </div>
            </div>
            <div class="ab-field">
                <label class="ab-label">Description <span class="ab-template-hint">(optional — shown in the tile)</span></label>
                <input type="text" class="ab-step-desc agent-builder-input"
                       placeholder="e.g. Search emails for the contact name"
                       value="${step ? esc(step.description) : ''}"/>
            </div>
        `;

        const svcSel    = row.querySelector('.ab-step-service');
        const svcSuffix = row.querySelector('.ab-step-service-suffix');
        svcSel.addEventListener('change', () => {
            const isCustom     = svcSel.value === '__custom__';
            const placeholderE = KNOWN_SERVICES.find(s => s.value === svcSel.value && s.placeholder);
            svcSuffix.style.display = (isCustom || placeholderE) ? 'block' : 'none';
            if (placeholderE) {
                svcSuffix.placeholder = svcSel.value === 'db:' ? 'connection name, e.g. domain' : 'value';
            } else if (isCustom) {
                svcSuffix.placeholder = 'service key, e.g. db:sales';
            }
            if (!isCustom && !placeholderE) svcSuffix.value = '';
        });

        const loopSel   = row.querySelector('.ab-step-loop');
        const llmSec    = row.querySelector('.ab-llm-loop-section');
        if (loopSel && llmSec) {
            loopSel.addEventListener('change', () => {
                llmSec.style.display = loopSel.value ? 'block' : 'none';
            });
        }

        row.querySelector('.ab-step-remove').addEventListener('click', () => {
            row.remove();
            _renumberSteps();
        });

        list.appendChild(row);
        _renumberSteps();
    }

    function _collectSteps() {
        const rows = document.querySelectorAll('#agentBuilderStepsList .ab-step-row');
        return Array.from(rows).map((row, i) => {
            const svcSel    = row.querySelector('.ab-step-service');
            const svcSuffix = row.querySelector('.ab-step-service-suffix');
            let svc = svcSel.value;
            if (svc === '__custom__') {
                svc = svcSuffix.value.trim();
            } else {
                const entry = KNOWN_SERVICES.find(s => s.value === svc);
                if (entry?.placeholder) {
                    const suffix = svcSuffix.value.trim();
                    if (suffix) svc = svc + suffix;
                }
            }
            return {
                step_index:     i + 1,
                service:        svc,
                query_template: row.querySelector('.ab-step-template').value.trim(),
                depends_on:     row.querySelector('.ab-step-depends').value.trim(),
                loop_over:          row.querySelector('.ab-step-loop')?.value.trim() || '',
                loop_llm_prompt:    row.querySelector('.ab-step-llm-prompt')?.value.trim() || '',
                loop_llm_max_items: parseInt(row.querySelector('.ab-step-llm-max-items')?.value || '0', 10) || 0,
                description:        row.querySelector('.ab-step-desc').value.trim(),
            };
        }).filter(s => s.service && s.query_template);
    }

    async function submitBuilder() {
        const errorEl = document.getElementById('agentBuilderError');
        const setErr  = (msg) => {
            if (errorEl) { errorEl.textContent = msg; errorEl.classList.remove('hidden'); }
        };
        errorEl?.classList.add('hidden');

        const agentId   = parseInt(document.getElementById('agentBuilderId')?.value || '0', 10);
        const agentName = document.getElementById('agentBuilderName')?.value.trim() || '';
        const dispName  = document.getElementById('agentBuilderDisplayName')?.value.trim() || '';
        const desc      = document.getElementById('agentBuilderDescription')?.value.trim() || '';

        if (!agentName) { setErr('Agent name is required.'); return; }
        if (!dispName)  { setErr('Display name is required.'); return; }
        if (!/^[a-z0-9_]+$/.test(agentName)) {
            setErr('Agent name may only contain lowercase letters, digits, and underscores.');
            return;
        }

        const steps = _collectSteps();
        if (steps.length === 0) {
            setErr('At least one step with a service and query is required.');
            return;
        }

        try {
            const saveBtn = document.getElementById('agentBuilderSaveBtn');
            if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving…'; }

            await AgentApi.saveAgent({
                agent_id:     agentId,
                agent_name:   agentName,
                display_name: dispName,
                description:  desc,
                steps,
            });

            if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save Agent'; }

            _loaded = false;
            closeBuilder();
            await loadAgents();
        } catch (err) {
            const saveBtn = document.getElementById('agentBuilderSaveBtn');
            if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save Agent'; }
            setErr(`Save failed: ${err.message}`);
        }
    }

    async function deletePrivateAgent(agent) {
        if (!confirm(`Delete agent "${agent.display_name || agent.agent_name}"? This cannot be undone.`)) return;
        try {
            await AgentApi.deleteAgent(agent.agent_id);
            _loaded = false;
            await loadAgents();
        } catch (err) {
            alert(`Delete failed: ${err.message}`);
        }
    }

    // ── Run an agent ──────────────────────────────────────────────────────────

    function showRunResult({ loading, title, text, error, status }) {
        const panel = document.getElementById('agentRunResultPanel');
        const titleEl = document.getElementById('agentRunResultTitle');
        const bodyEl  = document.getElementById('agentRunResultText');
        if (!panel || !bodyEl) return;

        panel.classList.remove('hidden');
        panel.classList.toggle('agent-run-result--error', !!error);
        if (titleEl) titleEl.textContent = title || 'Agent result';

        if (loading) {
            bodyEl.innerHTML = '<span class="agents-loading">Running…</span>';
            if (status) {
                // Live progress from the server (one line per agent step). Set
                // via textContent - it is model/agent-supplied text, never HTML.
                const line = document.createElement('div');
                line.className = 'agents-run-status';
                line.textContent = status;
                bodyEl.appendChild(line);
            }
        } else if (error) {
            bodyEl.textContent = error;
        } else {
            bodyEl.textContent = text || '(no output)';
        }
    }

    async function runAgent(agentName, userInput) {
        if (!agentName) return;
        const displayName = (
            _sharedAgents.find(a => a.agent_name === agentName) ||
            _privateAgents.find(a => a.agent_name === agentName) ||
            {}
        ).display_name || agentName;

        showRunResult({ loading: true, title: displayName });
        try {
            const text = await AgentApi.runAgent(agentName, userInput, {
                onStatus: (status) => showRunResult({ loading: true, title: displayName, status }),
            });
            showRunResult({ title: displayName, text });
        } catch (err) {
            showRunResult({ title: displayName, error: err.message });
        }
    }

    function closeRunResult() {
        document.getElementById('agentRunResultPanel')?.classList.add('hidden');
    }

    // ── Wire up controls ──────────────────────────────────────────────────────

    function init() {
        document.getElementById('agentInputRunBtn')?.addEventListener('click', submitInputDialog);
        document.getElementById('agentInputCancelBtn')?.addEventListener('click', closeInputDialog);
        document.getElementById('agentInputDialogText')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitInputDialog(); }
        });

        document.getElementById('agentCreateBtn')?.addEventListener('click', () => openBuilder(null));
        document.getElementById('agentBuilderBackBtn')?.addEventListener('click', closeBuilder);
        document.getElementById('agentBuilderCancelBtn')?.addEventListener('click', closeBuilder);
        document.getElementById('agentBuilderSaveBtn')?.addEventListener('click', submitBuilder);
        document.getElementById('agentBuilderAddStep')?.addEventListener('click', () => addBuilderStepRow(null));

        document.getElementById('agentRunResultClose')?.addEventListener('click', closeRunResult);

        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape') return;
            const builder = document.getElementById('agentBuilderPanel');
            const dialog  = document.getElementById('agentInputDialog');
            const result  = document.getElementById('agentRunResultPanel');
            if (builder && !builder.classList.contains('hidden'))      closeBuilder();
            else if (dialog && !dialog.classList.contains('hidden'))   closeInputDialog();
            else if (result && !result.classList.contains('hidden'))   closeRunResult();
        });
    }

    BoudicaCode.AgentManager = { init, loadAgents };
})(window);
