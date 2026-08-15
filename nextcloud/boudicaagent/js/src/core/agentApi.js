/**
 * agentApi.js
 *
 * Talks to https://boudi.ca/api/boudica/agents/* directly from the
 * browser (same direct-from-browser pattern as boudicaApi.js /
 * dashboardApi.js).
 *
 * AUTH: the original agents-ui.js (from the main Boudica web app)
 * authenticates via same-origin session cookies (`credentials:
 * 'same-origin'`, no api_key sent at all) — that doesn't work
 * cross-origin from Nextcloud. This instead follows the confirmed
 * convention from the dashboard app: api_key + user_id sent
 * explicitly with every call.
 *   - list() is a GET in the original, so api_key/user_id go as
 *     query params here (ASSUMPTION — not yet confirmed against the
 *     real backend; the original only ever sent user_id as a query
 *     param over a cookie session, so whether /agents/list even reads
 *     an api_key query param needs verifying).
 *   - save()/deleteAgent() are POSTs with a JSON body in the
 *     original, so api_key is just added into that same body
 *     (matches the confirmed dashboard convention exactly).
 *   - run() isn't a real endpoint in the original at all — the
 *     original hands off to the surrounding chat page (writes
 *     "@agentname text" into #chatInput and clicks #sendBtn) and lets
 *     that page's existing chat pipeline run the agent. This app has
 *     no such chat page, so run() instead calls /chat directly
 *     (ported from boudicaApi.js's send()) with that same
 *     "@agentname text" convention and returns the response text.
 *
 * Classic script. Must load after agentAuth.js, before agentManager.js.
 */
(function (global) {
    'use strict';

    const BoudicaCode = global.BoudicaCode || (global.BoudicaCode = {});

    const DEFAULT_API_BASE = 'https://boudi.ca/api/boudica';

    function apiBase() {
        return localStorage.getItem('boudica_api_url') || DEFAULT_API_BASE;
    }

    async function resolveCredentials() {
        const session = BoudicaCode.AgentAuth ? await BoudicaCode.AgentAuth.ensureSession() : null;
        const apiKey = (session && session.token) || localStorage.getItem('boudica_api_key') || '';
        const userId =
            (session && session.email) ||
            localStorage.getItem('boudica_user_id') ||
            (global.OC && OC.getCurrentUser && OC.getCurrentUser().uid) ||
            'anonymous';
        return { apiKey, userId };
    }

    async function wrapEndpointFetch(url, init) {
        try {
            return await fetch(url, init);
        } catch (err) {
            if (err instanceof TypeError) {
                const origin = new URL(url).origin;
                throw new Error(
                    `Could not reach ${origin} (${err.message}). This is usually either the network, or ` +
                    `Nextcloud's Content-Security-Policy blocking the request — check the browser console ` +
                    `for a "connect-src" violation, and if so, add ${origin} to it.`
                );
            }
            throw err;
        }
    }

    async function jsonOrThrow(response, context) {
        if (!response.ok) {
            const errorBody = await response.json().catch(() => ({}));
            const message = errorBody.error || `HTTP ${response.status} on ${context}`;
            const err = new Error(message);
            err.status = response.status;
            throw err;
        }
        const data = await response.json();
        if (data.success === false) {
            throw new Error(data.error || `${context} failed`);
        }
        return data;
    }

    async function listAgents() {
        const { apiKey, userId } = await resolveCredentials();
        const params = new URLSearchParams({ user_id: userId, api_key: apiKey });
        const url = `${apiBase()}/agents/list?${params.toString()}`;
        const res = await wrapEndpointFetch(url, { method: 'GET', credentials: 'omit' });
        return jsonOrThrow(res, 'agents/list');
    }

    /**
     * @param {object} agent - { agent_id, agent_name, display_name, description, steps }
     */
    async function saveAgent(agent) {
        const { apiKey, userId } = await resolveCredentials();
        const url = `${apiBase()}/agents/user/save`;
        const res = await wrapEndpointFetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'omit',
            body: JSON.stringify({ ...agent, user_id: userId, api_key: apiKey }),
        });
        return jsonOrThrow(res, 'agents/user/save');
    }

    async function deleteAgent(agentId) {
        const { apiKey, userId } = await resolveCredentials();
        const url = `${apiBase()}/agents/user/delete`;
        const res = await wrapEndpointFetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'omit',
            body: JSON.stringify({ agent_id: agentId, user_id: userId, api_key: apiKey }),
        });
        return jsonOrThrow(res, 'agents/user/delete');
    }

    function sessionId() {
        let id = localStorage.getItem('boudica_agent_session_id');
        if (!id) {
            id = `agent_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            localStorage.setItem('boudica_agent_session_id', id);
        }
        return id;
    }

    /**
     * Runs an agent by sending "@agentName userInput" to /chat —
     * same convention the original relied on the host chat page to
     * interpret. Returns the plain response text.
     */
    async function runAgent(agentName, userInput) {
        const { apiKey, userId } = await resolveCredentials();
        const prompt = userInput ? `@${agentName} ${userInput}` : `@${agentName} `;
        const url = `${apiBase()}/chat`;
        const res = await wrapEndpointFetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'omit',
            body: JSON.stringify({
                prompt,
                session_id: sessionId(),
                user_id: userId,
                user_email: '',
                stream: false,
                api_key: apiKey,
                temperature: 0.7,
                max_tokens: 4096,
                use_rag: false,
            }),
        });
        const data = await jsonOrThrow(res, 'chat');
        return data.response || data.text || '';
    }

    BoudicaCode.AgentApi = { listAgents, saveAgent, deleteAgent, runAgent };
})(window);
