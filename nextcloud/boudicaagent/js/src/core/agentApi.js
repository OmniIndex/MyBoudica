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

    // window.BOUDICA_API_BASE is injected server-side by the app's Nextcloud
    // template (reads an admin-configurable value) - lets a sovereign/
    // on-prem deployment point this app at its own inference server instead
    // of the boudi.ca SaaS default, without a code change per deployment.
    const DEFAULT_API_BASE = global.BOUDICA_API_BASE || 'https://boudi.ca/api/boudica';

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
                if (origin === global.location.origin) {
                    // Same origin as the page: Nextcloud's CSP always allows
                    // 'self', so a connect-src block is impossible here and
                    // blaming it (as the message below does for a genuinely
                    // cross-origin endpoint) sent a customer chasing the wrong
                    // thing on 2026-09-21. This is a network-level failure.
                    throw new Error(
                        `Could not reach ${origin} (${err.message}). Your connection to the server was ` +
                        `interrupted or unavailable - check your network/VPN and try again. If an agent ` +
                        `was already running, it may have finished on the server, so running it again is safe.`
                    );
                }
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
     *
     * STREAMS the response (stream: true) instead of waiting for one JSON
     * body. A self-checking agent runs several LLM steps and takes 60-90+ s;
     * with stream:false not a single byte reached the browser for that whole
     * time, and a proxy/VPN/firewall on the customer's path dropped the idle
     * connection ("Could not reach ... failed to fetch", 2026-09-21, Mermaid
     * agent - the server had finished fine). Streaming means the server sends
     * a {"type":"status"} line as each step starts (inference_server.cpp's
     * named-agent loop), so bytes keep flowing and the caller can show live
     * progress. Chunk shapes handled: {"type":"status","message"}, {"type":
     * "token","token"} (accumulated), a final {"response":...}, {"error":...};
     * anything else is ignored.
     *
     * @param {string} agentName
     * @param {string} userInput
     * @param {object} [opts]
     * @param {(message: string) => void} [opts.onStatus] - called with each progress line
     * @param {AbortSignal} [opts.signal]
     */
    async function runAgent(agentName, userInput, opts = {}) {
        const { onStatus, signal } = opts;
        const { apiKey, userId } = await resolveCredentials();
        const prompt = userInput ? `@${agentName} ${userInput}` : `@${agentName} `;
        const url = `${apiBase()}/chat`;
        const res = await wrapEndpointFetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'omit',
            signal,
            body: JSON.stringify({
                prompt,
                session_id: sessionId(),
                user_id: userId,
                user_email: '',
                stream: true,
                api_key: apiKey,
                temperature: 0.7,
                max_tokens: 4096,
                use_rag: false,
            }),
        });
        if (!res.ok) {
            const errorBody = await res.json().catch(() => ({}));
            throw new Error(errorBody.error || `HTTP ${res.status} on chat`);
        }

        let accumulated = '';   // token chunks, if the server streams the answer that way
        let finalText = null;   // a complete {"response": ...} chunk wins over tokens

        const handleLine = (line) => {
            if (!line.trim()) return;
            let chunk;
            try {
                chunk = JSON.parse(line);
            } catch (e) {
                return; // partial/garbled line - ignore
            }
            if (chunk.error) {
                throw new Error(chunk.error);
            }
            if (chunk.type === 'status') {
                if (onStatus && chunk.message) onStatus(String(chunk.message));
            } else if (chunk.type === 'token') {
                accumulated += chunk.token || '';
            } else if (chunk.response !== undefined) {
                finalText = chunk.response;
            }
        };

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';
                for (const line of lines) handleLine(line);
            }
            buffer += decoder.decode();
            if (buffer.trim()) handleLine(buffer);
        } catch (err) {
            if (err instanceof TypeError) {
                // The connection broke AFTER the request was accepted - fetch()
                // itself succeeded, so wrapEndpointFetch never saw this.
                throw new Error(
                    `The connection was interrupted while the agent was running (${err.message}). ` +
                    `The agent may have finished on the server - please run it again.`
                );
            }
            throw err;
        }

        return finalText !== null ? finalText : accumulated;
    }

    BoudicaCode.AgentApi = { listAgents, saveAgent, deleteAgent, runAgent };
})(window);
