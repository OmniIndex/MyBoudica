/**
 * boudicaApi.js
 *
 * Talks to the Boudica inference server DIRECTLY from the browser —
 * ported from chat-api.js's CGI-mode ChatAPI (sendMessageCGI +
 * handleStreamingResponse + the session-isolation/stripChannelThought
 * helpers). Classic script — see eventBus.js for load-order rationale.
 * No dependency on other BoudicaCode modules, so it can load any time
 * before chatPanel.js.
 *
 * DELIBERATELY DROPPED from the original chat-api.js (all out of
 * scope for a code editor's AI agent):
 *   - Flask/SAML backend mode (sendMessageFlask/standardResponse/
 *     streamResponse) — this app only ever talks to the CGI endpoint.
 *   - File uploads, and the pdf/pptx/docx/xlsx/epub/dashboard
 *     generated-document handling — Boudica Code only ever wants back
 *     plain source code text.
 *   - Shared chats, user-to-user messaging, suggestions, chat history,
 *     user settings — none of that applies here.
 *   - The this.auth wrapper (Keycloak session/keepalive) — Boudica
 *     Code runs inside Nextcloud, a different origin from the main
 *     Boudica Torc app, so it can't read that app's session out of
 *     localStorage. See the auth note below.
 *
 * AUTH: gets its credentials from boudicaAuth.js, which auto-signs-up
 * for a Boudica API key using the current Nextcloud user's identity if
 * one isn't already sitting in localStorage — see that file's
 * docblock (ported from saml-auth.js). Falls back to the manual
 * `boudica_api_key` / `boudica_user_id` localStorage overrides
 * (settable via chatPanel.js's /boudica-key command) if auto-signup
 * isn't available or fails.
 *
 * INFRA NOTE: this means the browser now makes cross-origin requests
 * to https://boudi.ca from inside Nextcloud. This already has to work
 * for boudicaAuth.js's signup call to succeed at all, so if that's
 * working, Nextcloud's CSP already permits it — no separate connect-src
 * change should be needed beyond whatever the existing BoudicaAI
 * integration already required.
 */
(function (global) {
    'use strict';

    const BoudicaCode = global.BoudicaCode || (global.BoudicaCode = {});

    const DEFAULT_API_BASE = 'https://boudi.ca/api/boudica';

    function apiBase() {
        return localStorage.getItem('boudica_api_url') || DEFAULT_API_BASE;
    }

    /**
     * Resolves { apiKey, userId } for a request. Tries the auto-signed-up
     * session first (boudicaAuth.js); falls back to manual localStorage
     * overrides, then to the Nextcloud user id as a last resort so
     * requests are at least attributable even with no key at all.
     */
    async function resolveCredentials() {
        const session = BoudicaCode.BoudicaAuth ? await BoudicaCode.BoudicaAuth.ensureSession() : null;
        const apiKey = (session && session.token) || localStorage.getItem('boudica_api_key') || '';
        const userId =
            (session && session.email) ||
            localStorage.getItem('boudica_user_id') ||
            (global.OC && OC.getCurrentUser && OC.getCurrentUser().uid) ||
            'anonymous';
        return { apiKey, userId };
    }

    /** Ported verbatim from chat-api.js's stripChannelThought(). */
    function stripChannelThought(text) {
        let result = text.replace(/<thought[\s>][\s\S]*?<\/thought>/gi, '');
        result = result.replace(/<thinking[\s>][\s\S]*?<\/thinking>/gi, '');
        result = result.replace(/<thought[\s>][\s\S]*/i, '');
        result = result.replace(/<thinking[\s>][\s\S]*/i, '');
        result = result.replace(/<\|channel>>thought/g, '');
        result = result.replace(/<\|channel>thought/g, '');
        result = result.replace(/<\|channel>/g, '');
        result = result.replace(/<channel\|>/g, '');
        result = result.replace(/^\s+/, '');
        return result;
    }

    /**
     * fetch() rejects with a generic "TypeError: Failed to fetch" for
     * both a genuine network outage AND a CSP connect-src block — the
     * browser gives JS no way to tell those apart. Since a silent CSP
     * block (no fetch ever leaves the browser, no CORS/network error
     * either) is a very easy trap to fall into here specifically —
     * this app calls a different origin (https://boudi.ca) than the
     * Nextcloud instance it runs on — wrapEndpointFetch turns that
     * ambiguous TypeError into a message that actually points at the
     * likely cause, instead of just "Failed to fetch".
     */
    async function wrapEndpointFetch(url, init) {
        try {
            return await fetch(url, init);
        } catch (err) {
            if (err instanceof TypeError) {
                const origin = new URL(url).origin;
                throw new Error(
                    `Could not reach ${origin} (${err.message}). This is usually either the network, or ` +
                    `Nextcloud's Content-Security-Policy blocking the request — check the browser console ` +
                    `for a "connect-src" violation, and if so, add ${origin} to it (Apache: Header edit ` +
                    `Content-Security-Policy "connect-src 'self'" "connect-src 'self' ${origin}").`
                );
            }
            throw err;
        }
    }

    class BoudicaApi {
        constructor() {
            // Ported from chat-api.js's _sharedIsolatedSessions: reuse the
            // same isolated session for follow-up "No Memory" calls within
            // one base session (e.g. clarify -> edit for the same file),
            // rather than starting a fresh isolated session per call.
            this._isolatedSessions = new Map(); // baseSessionId -> isolated id
        }

        /** Ported from shouldIsolateSession() (RAG-phrase branch dropped — Boudica Code never sends use_rag: true). */
        shouldIsolateSession(messageText) {
            const lower = (messageText || '').toLowerCase();
            return (
                lower.includes('no memory') ||
                lower.includes('disable memory') ||
                lower.includes('without memory') ||
                lower.includes("don't use memory") ||
                lower.includes('do not use memory') ||
                lower.includes('skip memory') ||
                lower.includes('ignore memory')
            );
        }

        /** Ported verbatim from buildIsolatedSessionId(). */
        buildIsolatedSessionId(baseId) {
            return `${baseId}_isolated_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        }

        _effectiveSessionId(baseSessionId, promptText) {
            if (!this.shouldIsolateSession(promptText)) {
                return baseSessionId;
            }
            if (!this._isolatedSessions.has(baseSessionId)) {
                this._isolatedSessions.set(baseSessionId, this.buildIsolatedSessionId(baseSessionId));
            }
            return this._isolatedSessions.get(baseSessionId);
        }

        async healthCheck() {
            try {
                const res = await fetch(`${apiBase()}/health`, { method: 'GET' });
                return res.ok;
            } catch (err) {
                return false;
            }
        }

        /**
         * Send a prompt to Boudica and resolve with the full text response.
         * promptBuilder.js's prompts all start with "No Memory\n\n" by
         * design (see its docblock) — shouldIsolateSession() above picks
         * that up automatically, so every Boudica Code request already
         * gets an isolated session with no extra wiring needed here.
         *
         * @param {string} baseSessionId - stable id for the chat/project (see chatPanel.js's _sessionKey())
         * @param {string} promptText
         * @param {object} [opts]
         * @param {number} [opts.temperature]
         * @param {number} [opts.maxTokens]
         * @param {(partialText: string) => void} [opts.onToken] - if provided, streams; called with the growing text as tokens arrive
         * @returns {Promise<string>}
         */
        async send(baseSessionId, promptText, opts = {}) {
            const sessionId = this._effectiveSessionId(baseSessionId, promptText);
            const { apiKey, userId } = await resolveCredentials();
            const url = `${apiBase()}/chat`;
            const body = {
                prompt: promptText,
                session_id: sessionId,
                user_id: userId,
                user_email: '',
                stream: !!opts.onToken,
                api_key: apiKey,
                temperature: opts.temperature ?? 0.7,
                max_tokens: opts.maxTokens ?? 4096,
                // Boudica Code's prompts are self-contained (full file content
                // is inlined directly) — RAG would search unrelated past
                // conversations and add noise, not context, here.
                use_rag: false,
                inference_type: 'code_assistant',
            };

            return opts.onToken ? this._sendStreaming(url, body, opts.onToken) : this._sendOnce(url, body);
        }

        async _sendOnce(url, body) {
            const res = await wrapEndpointFetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({ error: `Boudica request failed (${res.status})` }));
                throw new Error(err.error || `Boudica request failed (${res.status})`);
            }
            const data = await res.json();
            if (data.error) {
                throw new Error(data.error);
            }
            return stripChannelThought(data.response || data.text || '');
        }

        /**
         * Ported/trimmed from handleStreamingResponse(): the CGI backend
         * streams newline-delimited JSON chunks. Only the token/response
         * chunk shapes are handled — the pdf/pptx/docx/xlsx/epub/dashboard
         * branches from the original are intentionally not ported (see
         * this file's docblock).
         */
        async _sendStreaming(url, body, onToken) {
            const res = await wrapEndpointFetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({ error: `Boudica request failed (${res.status})` }));
                throw new Error(err.error || `Boudica request failed (${res.status})`);
            }

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let fullContent = '';

            const handleLine = (line) => {
                if (!line.trim()) return;
                let chunk;
                try {
                    chunk = JSON.parse(line);
                } catch (e) {
                    return; // partial/garbled line — ignore, matches original's behavior
                }
                if (chunk.error) {
                    throw new Error(chunk.error);
                }
                if (chunk.type === 'token') {
                    fullContent += chunk.token;
                    onToken(stripChannelThought(fullContent));
                } else if (chunk.response !== undefined && chunk.response !== fullContent) {
                    fullContent = chunk.response;
                }
            };

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';
                for (const line of lines) {
                    handleLine(line);
                }
            }
            if (buffer.trim()) {
                handleLine(buffer);
            }

            return stripChannelThought(fullContent);
        }
    }

    // Singleton — one set of isolated-session bookkeeping for the whole app.
    BoudicaCode.BoudicaApi = new BoudicaApi();
})(window);
