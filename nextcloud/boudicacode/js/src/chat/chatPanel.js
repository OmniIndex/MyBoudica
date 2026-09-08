/**
 * chatPanel.js
 *
 * Right panel: chat + slash-commands. Classic script — see eventBus.js
 * for load-order rationale. Must load after eventBus.js, state.js,
 * webdavClient.js, boudicaApi.js, promptBuilder.js, projectScaffolder.js.
 *
 * Everything here runs client-side: prompts are built locally
 * (promptBuilder.js), sent straight to Boudica from the browser
 * (boudicaApi.js — see its docblock for why there's no PHP proxy),
 * and file writes go through the same WebDavClient the file tree and
 * editor already use. There is no more /api/command or /api/chat call
 * — those PHP-side placeholders were removed once boudicaApi.js
 * revealed the real production integration talks to Boudica directly.
 */
(function (global) {
    'use strict';

    const BoudicaCode = global.BoudicaCode || (global.BoudicaCode = {});
    const { bus, EVENTS, AppState, BoudicaApi, PromptBuilder, ProjectScaffolder, DiffUtil } = BoudicaCode;

    const EXTENSION_TO_STACK = {
        cpp: 'cpp', cc: 'cpp', cxx: 'cpp', h: 'cpp', hpp: 'cpp',
        py: 'python',
        js: 'nodejs', jsx: 'nodejs',
        ts: 'typescript', tsx: 'typescript',
        java: 'java',
        sh: 'bash',
        bat: 'batch', cmd: 'batch',
    };

    // Where a freshly-scaffolded project's "main" file lives per stack (see
    // projectScaffolder.js). Used as the default target for a free-text
    // "create/build me an app that..." with no file open and no explicit
    // path in the message. cpp/python don't scaffold a starter file, so a
    // request there becomes a genuine create; nodejs/typescript/java/bash/
    // batch DO ship a Hello-World stub at these paths, so it becomes an
    // edit that fills the stub in — which is the more useful behavior
    // either way.
    const DEFAULT_ENTRY_FILE = {
        cpp: 'src/main.cpp',
        python: 'main.py',
        nodejs: 'src/index.js',
        typescript: 'src/index.ts',
        java: 'src/main/java/com/example/App.java',
        bash: 'src/main.sh',
        batch: 'src/main.bat',
    };

    // Imperative build/creation verbs — distinguishes "create an app that
    // does X" (wants code) from "what stack should I use for X" (wants
    // advice), so free text with no file open doesn't default to planning
    // chat just because there's nowhere else to route it.
    const CREATE_INTENT_RE = /^(create|build|make|write|generate|implement|add|develop)\b/i;

    // Ported from parse_create_request()'s heuristic filepath matcher.
    const FILEPATH_RE = /(?:src\/|\.?\/?[\w-]+\/)*[\w-]+\.\w+/;

    // buildEditPrompt() (promptBuilder.js) inlines the ENTIRE current file
    // (with line numbers) into the prompt and asks for the entire updated
    // file back — no tokenizer here to estimate an exact budget, but "the
    // whole file round-trips through one prompt+response" stops being
    // sensible well before any hard token limit for a file this size
    // anyway. Sized for what this app targets (small scripts), not big
    // generated files — see _runEdit()'s guard.
    const MAX_EDIT_LINES = 800;
    const MAX_EDIT_CHARS = 40000;

    function extractFilePath(text) {
        const match = text.match(FILEPATH_RE);
        return match ? match[0] : null;
    }

    function dirname(path) {
        const idx = path.lastIndexOf('/');
        return idx === -1 ? '' : path.slice(0, idx);
    }

    function ensureTrailingNewline(text) {
        return text.endsWith('\n') ? text : text + '\n';
    }

    class ChatPanel {
        constructor(mountEl, davClient) {
            this.mountEl = mountEl;
            this.davClient = davClient; // rooted at the CURRENT project (kept in sync by main.js)
            // Set for the duration of one _handleSubmit() call so a Boudica
            // request (chat/create/edit) can be cancelled mid-flight — see
            // _setBusy()/the Stop button in _renderShell(). A submit may
            // make more than one sequential BoudicaApi.send() call (e.g.
            // clarify -> edit); one controller per submit covers all of them.
            this._activeController = null;
            this._onCompileResult = this._onCompileResult.bind(this);
            bus.on(EVENTS.COMPILE_RESULT, this._onCompileResult);

            // App-wide error surface. Previously EVENTS.ERROR only ever
            // reached the status bar (main.js's wireStatusBar) — a 22px
            // strip at the very bottom, easy to miss entirely, which is
            // exactly what happened with "Open a file before running a
            // compile check": it fired, updated the status bar, and
            // otherwise looked like nothing happened. `silent: true` skips
            // errors chatPanel already displayed inline itself (e.g.
            // updating an existing pending bubble reads better than a
            // second, separate message repeating the same thing).
            this._onGlobalError = this._onGlobalError.bind(this);
            bus.on(EVENTS.ERROR, this._onGlobalError);
        }

        _onGlobalError(event) {
            if (event.detail.silent || !this.logEl) return; // logEl not built yet if this fires before init()
            this._appendMessage('bot', event.detail.message, false, 'error');
        }

        init() {
            this._renderShell();
            this._ensureBoudicaSession();
        }

        /** Fire the auto-signup (see boudicaAuth.js) as soon as the panel loads, and let the person know either way — rather than waiting for their first message to discover it silently failed. */
        async _ensureBoudicaSession() {
            if (!BoudicaCode.BoudicaAuth) return;
            const session = await BoudicaCode.BoudicaAuth.ensureSession();
            if (session && session.email) {
                this._appendMessage('bot', `Connected to Boudica as ${session.email}.`, false, 'success');
            } else if (!localStorage.getItem('boudica_api_key')) {
                this._appendMessage(
                    'bot',
                    "Couldn't auto-connect to Boudica. Set a key manually with /boudica-key <your key>, or check the console for details.",
                    false,
                    'error'
                );
            }
        }

        _renderShell() {
            this.mountEl.innerHTML = `
                <div class="bc-chat">
                    <div class="bc-chat__log" data-role="log"></div>
                    <form class="bc-chat__form" data-role="form">
                        <textarea data-role="input" rows="4"
                               placeholder="/new my-app cpp, /create src/util.py a csv parser, or just ask&#10;(Enter to send, Shift+Enter for a new line)"></textarea>
                        <div class="bc-chat__form-actions">
                            <button type="button" data-role="stop" class="bc-chat__stop-btn" hidden>Stop</button>
                            <button type="submit" data-role="send">Send</button>
                        </div>
                    </form>
                </div>
            `;
            this.logEl = this.mountEl.querySelector('[data-role="log"]');
            this.inputEl = this.mountEl.querySelector('[data-role="input"]');
            this.sendBtn = this.mountEl.querySelector('[data-role="send"]');
            this.stopBtn = this.mountEl.querySelector('[data-role="stop"]');

            this.stopBtn.addEventListener('click', () => this._activeController?.abort());

            this.mountEl.querySelector('[data-role="form"]').addEventListener('submit', (e) => {
                e.preventDefault();
                if (this._activeController) return; // a request is already in flight — use Stop, not another Send
                const text = this.inputEl.value.trim();
                if (!text) return;
                this.inputEl.value = '';
                this._handleSubmit(text);
            });

            // Enter sends; Shift+Enter (or any other modifier) inserts a
            // real newline, since the box is multiline now.
            this.inputEl.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (this._activeController) return;
                    const text = this.inputEl.value.trim();
                    if (!text) return;
                    this.inputEl.value = '';
                    this._handleSubmit(text);
                }
            });
        }

        /** Toggles the Send/Stop pair and disables input for the duration of one in-flight request. */
        _setBusy(busy) {
            if (this.sendBtn) this.sendBtn.disabled = busy;
            if (this.inputEl) this.inputEl.disabled = busy;
            if (this.stopBtn) this.stopBtn.hidden = !busy;
        }

        /**
         * Shared by every catch block downstream of a BoudicaApi.send()
         * call — distinguishes "the person hit Stop" (AbortError, expected,
         * not a failure) from a genuine error, so cancelling a request
         * doesn't read as though something broke.
         * @returns {{text: string, tone: 'warning'|'error'}}
         */
        _describeError(err, context) {
            if (err && err.name === 'AbortError') {
                return { text: 'Cancelled.', tone: 'warning' };
            }
            return { text: `${context}: ${err.message}`, tone: 'error' };
        }

        /**
         * @param {boolean} [pending] - true for an in-progress placeholder ("On it…", "Asking Boudica to…") — pulses via CSS until _setMessage() marks it settled.
         * @param {'neutral'|'success'|'error'|'warning'} [tone] - color-codes the bubble so success/failure/caution are scannable at a glance, not just readable.
         */
        _appendMessage(role, text, pending = false, tone = 'neutral') {
            const div = document.createElement('div');
            div.className = `bc-chat__message bc-chat__message--${role}`;
            div.textContent = text;
            div.classList.toggle('bc-chat__message--pending', pending);
            if (role === 'bot' && tone !== 'neutral') {
                div.classList.add(`bc-chat__message--${tone}`);
            }
            this.logEl.appendChild(div);
            this.logEl.scrollTop = this.logEl.scrollHeight;
            return div;
        }

        /** Updates an existing bubble's text, pending (pulsing), and tone together, so none of the three can drift out of sync. */
        _setMessage(bubble, text, pending = false, tone = 'neutral') {
            bubble.textContent = text;
            bubble.classList.toggle('bc-chat__message--pending', pending);
            bubble.classList.remove('bc-chat__message--success', 'bc-chat__message--error', 'bc-chat__message--warning');
            if (tone !== 'neutral') {
                bubble.classList.add(`bc-chat__message--${tone}`);
            }
            this.logEl.scrollTop = this.logEl.scrollHeight;
        }

        /**
         * Like _setMessage, but for a genuine failure — appends an inline
         * Retry action to the SAME bubble rather than requiring the person
         * to retype the whole request. `retryFn` is expected to be
         * `() => this._runWithLifecycle(() => <the original call again>)`
         * — re-running just the failed action, not the whole submit (which
         * would re-append a new "user said X" bubble above it).
         */
        _setMessageWithRetry(bubble, text, tone, retryFn) {
            bubble.textContent = '';
            bubble.classList.remove('bc-chat__message--pending', 'bc-chat__message--success', 'bc-chat__message--error', 'bc-chat__message--warning');
            if (tone !== 'neutral') {
                bubble.classList.add(`bc-chat__message--${tone}`);
            }
            bubble.appendChild(document.createTextNode(text));

            const retryBtn = document.createElement('button');
            retryBtn.type = 'button';
            retryBtn.className = 'bc-chat__retry-btn';
            retryBtn.textContent = 'Retry';
            retryBtn.addEventListener('click', () => {
                retryBtn.remove();
                this._setMessage(bubble, 'Retrying…', true);
                retryFn();
            });
            bubble.appendChild(retryBtn);

            this.logEl.scrollTop = this.logEl.scrollHeight;
        }

        _onCompileResult(event) {
            const { path, success, output } = event.detail;
            const icon = success ? '✅' : '❌';
            this._appendMessage('bot', `${icon} Compile check — ${path}\n${output}`, false, success ? 'success' : 'error');
        }

        /**
         * Wraps one async action with the busy/cancel lifecycle (a fresh
         * AbortController, Send/Stop toggled for the duration) that used
         * to live directly in _handleSubmit(). Pulled out so a Retry
         * button (see _setMessageWithRetry) can re-run just the ONE failed
         * action through the same lifecycle, without going through
         * _handleSubmit() itself and re-appending a new user-message bubble.
         */
        async _runWithLifecycle(taskFn) {
            this._activeController = new AbortController();
            this._setBusy(true);
            try {
                await taskFn();
            } finally {
                this._activeController = null;
                this._setBusy(false);
            }
        }

        async _handleSubmit(text) {
            this._appendMessage('user', text);
            bus.emit(EVENTS.CHAT_MESSAGE_SENT, { text });

            try {
                await this._runWithLifecycle(() =>
                    text.startsWith('/') ? this._handleCommand(text) : this._handleFreeText(text)
                );
            } catch (err) {
                const { text: msg, tone } = this._describeError(err, 'Error');
                this._appendMessage('bot', msg, false, tone);
                if (tone !== 'warning') {
                    bus.emit(EVENTS.ERROR, { message: 'Chat/command failed', error: err, silent: true });
                }
            }
        }

        _parseCommand(text) {
            const [cmdRaw, ...rest] = text.slice(1).split(' ');
            return { command: (cmdRaw || '').toLowerCase(), argsRaw: rest.join(' ').trim() };
        }

        /**
         * Recognized slash-commands:
         *   /new <name> [stack]        scaffold a brand-new project (cpp,
         *                              python, nodejs, typescript, java,
         *                              bash, batch) and switch into it
         *   /create <path> <descr>     ask Boudica to generate a new file
         *                              and open it
         *   /edit <change description> ask Boudica to rewrite the file
         *                              currently open in the editor
         *   /restore <path> [N]        undo an AI edit — restores the Nth
         *                              most recent backup (default: 1,
         *                              the latest). See _backupFile().
         *   /status                    quick project summary
         *   /boudica-key <key>         manual override for your Boudica API
         *                              key (rarely needed — see
         *                              boudicaAuth.js; auto-signup using
         *                              your Nextcloud identity is tried first)
         *   /help                      list commands
         */
        async _handleCommand(text) {
            const { command, argsRaw } = this._parseCommand(text);

            switch (command) {
                case 'new':
                    return this._cmdNew(argsRaw);
                case 'create':
                    return this._cmdCreate(argsRaw);
                case 'edit':
                    return this._cmdEdit(argsRaw);
                case 'restore':
                    return this._cmdRestore(argsRaw);
                case 'status':
                    return this._cmdStatus();
                case 'boudica-key':
                    return this._cmdBoudicaKey(argsRaw);
                case 'help':
                case '':
                    this._appendMessage('bot', this._helpText());
                    return;
                default:
                    this._appendMessage('bot', `Unknown command "/${command}". ${this._helpText()}`, false, 'warning');
                    return;
            }
        }

        /**
         * Free text (no leading '/'): if a file is open in the editor,
         * treat it as an edit request against that file (auto-applied —
         * matches the "editing in the window -> auto-edit" requirement).
         * Otherwise it's a planning/discussion question about the
         * project, streamed live into the chat log.
         */
        async _handleFreeText(text) {
            const currentFile = AppState.getCurrentFilePath();
            if (currentFile) {
                return this._runEdit(currentFile, text);
            }
            if (CREATE_INTENT_RE.test(text.trim())) {
                return this._handleCreateIntent(text);
            }

            const { stack: detectedStack } = await this._detectStack(null);
            const stack = detectedStack || 'general'; // planning chat's own fallback — no file will be written, so no need to flag a guess here
            const status = await this._quickStatus();
            const bubble = this._appendMessage('bot', '…', true);
            return this._sendPlanningChat(text, stack, status, bubble);
        }

        /** Split out of _handleFreeText so a failed request's Retry button can re-run just this call — see _setMessageWithRetry. */
        async _sendPlanningChat(text, stack, status, bubble) {
            const prompt = PromptBuilder.buildPlanningPrompt(stack, status, text);
            try {
                const reply = await BoudicaApi.send(this._sessionKey(), prompt, {
                    temperature: 0.7,
                    maxTokens: 2048,
                    onToken: (partial) => this._setMessage(bubble, partial, true), // still pulsing — more tokens may still arrive
                    signal: this._activeController?.signal,
                });
                this._setMessage(bubble, reply || '(no response)', false);
                bus.emit(EVENTS.CHAT_MESSAGE_RECEIVED, { reply });
            } catch (err) {
                const { text: msg, tone } = this._describeError(err, "Couldn't reach Boudica");
                if (tone === 'error') {
                    this._setMessageWithRetry(bubble, msg, tone, () => this._runWithLifecycle(() => this._sendPlanningChat(text, stack, status, bubble)));
                } else {
                    this._setMessage(bubble, msg, false, tone);
                }
                if (tone !== 'warning') {
                    bus.emit(EVENTS.ERROR, { message: 'Chat request failed', error: err, silent: true });
                }
            }
        }

        /**
         * Free text that reads as "create/build me X" with no file open:
         * routes to an actual code-generation flow (same one /create
         * uses) instead of the planning-chat prompt, which was asking
         * Boudica for advice about the request rather than writing it.
         * If the message names a path explicitly, that's the target;
         * otherwise it's the stack's default entry file (see
         * DEFAULT_ENTRY_FILE) — and if THAT already exists (a freshly
         * scaffolded stub, typically), this becomes an edit that fills
         * it in rather than a blocked "already exists" create.
         */
        async _handleCreateIntent(text) {
            if (!this._requireProject()) return;

            // Immediate feedback before any network round trips (stack
            // detection, existence check) — those alone can take a
            // second or two, and with nothing shown yet it's easy to
            // think the message didn't register at all.
            const bubble = this._appendMessage('bot', 'On it — figuring out what to build…', true);

            const explicitPath = extractFilePath(text);
            const stack = await this._resolveStack(explicitPath);
            const path = explicitPath || DEFAULT_ENTRY_FILE[stack] || 'main.txt';
            const description = explicitPath ? text.replace(explicitPath, '').trim() || text : text;

            if (await this._existsInCurrentProject(path)) {
                return this._runEdit(path, description, stack, bubble);
            }
            return this._routeCreate(path, description, stack, bubble);
        }

        /** Routes to _createCppPair for a .cpp/.cc/.cxx target when stack is cpp, else plain single-file _createNewFile. */
        _routeCreate(path, description, stack, bubble) {
            if (stack === 'cpp' && /\.(cpp|cc|cxx)$/i.test(path)) {
                return this._createCppPair(path, description, bubble);
            }
            return this._createNewFile(path, description, stack, bubble);
        }

        // ─── Commands ────────────────────────────────────────────────

        /** "/new <name> [stack]" — scaffold a brand-new project and switch into it. */
        async _cmdNew(argsRaw) {
            const [name, stack = 'python'] = argsRaw.split(/\s+/).filter(Boolean);

            if (!name) {
                this._appendMessage('bot', `Usage: /new <project-name> [stack]. Stacks: ${ProjectScaffolder.SUPPORTED_STACKS.join(', ')}`);
                return;
            }

            try {
                // Chat's /new always scaffolds at the top level of storage;
                // use the "+ New Project" button (editor toolbar) for a
                // folder picker if you want it somewhere else.
                const { projectRoot, fileCount } = await BoudicaCode.ProjectCreator.createProject('', name, stack);
                // Emitted before the switch attempt (not after) so the
                // project bar/file tree refresh their listings either way —
                // the project now exists on disk regardless of whether the
                // workspace actually switches into it below.
                bus.emit(EVENTS.CHAT_COMMAND_EXECUTED, { command: 'new', result: { projectRoot } });
                // setProjectRoot() confirms first if unsaved changes are
                // open elsewhere and returns false if the person declines —
                // the project is still created either way, just not entered.
                const switched = AppState.setProjectRoot(projectRoot); // triggers main.js's listener -> this.davClient.setProjectRoot + fileTree reload
                this._appendMessage(
                    'bot',
                    switched
                        ? `Created new ${stack} project "${projectRoot}" (${fileCount} files) and switched to it.`
                        : `Created new ${stack} project "${projectRoot}" (${fileCount} files). Save your current work, then switch to it from the project bar.`,
                    false,
                    'success'
                );
            } catch (err) {
                this._appendMessage('bot', err.message, false, 'error');
            }
        }

        /** "/create <path> <description...>" — generate a new file from a description. */
        async _cmdCreate(argsRaw) {
            if (!this._requireProject()) return;

            const spaceIdx = argsRaw.indexOf(' ');
            const path = spaceIdx === -1 ? argsRaw : argsRaw.slice(0, spaceIdx);
            const description = spaceIdx === -1 ? '' : argsRaw.slice(spaceIdx + 1).trim();

            if (!path || !description) {
                this._appendMessage('bot', 'Usage: /create <path/to/file.ext> <what it should do>');
                return;
            }

            if (await this._existsInCurrentProject(path)) {
                this._appendMessage('bot', `"${path}" already exists — use /edit on it instead, or pick a different name.`, false, 'warning');
                return;
            }
            const stack = await this._resolveStack(path);
            return this._routeCreate(path, description, stack);
        }

        /**
         * Shared by /create and _handleCreateIntent — assumes `path`
         * doesn't already exist. `knownStack` skips the redundant
         * .boudica_project.json lookup when the caller's already done it.
         * `bubble`, if given, is an existing chat message to update in
         * place rather than appending a new one (see _handleCreateIntent's
         * immediate "On it…" acknowledgment).
         */
        async _createNewFile(path, description, knownStack, bubble) {
            const stack = knownStack || (await this._resolveStack(path));
            const prompt = PromptBuilder.buildCreatePrompt(stack, description);

            bubble = bubble || this._appendMessage('bot', '', true);
            this._setMessage(bubble, `Asking Boudica to write ${path}…`, true);
            try {
                const raw = await BoudicaApi.send(this._sessionKey(), prompt, {
                    temperature: 0.7,
                    maxTokens: 8192,
                    signal: this._activeController?.signal,
                });
                const code = PromptBuilder.cleanCodeResponse(raw);
                if (!code.trim()) {
                    this._setMessage(bubble, 'Boudica returned an empty response — try rephrasing the description.', false, 'error');
                    return;
                }
                await this._ensureRemoteDir(this.davClient, dirname(path));
                await this.davClient.writeFile(path, ensureTrailingNewline(code));

                this._setMessage(bubble, `Created ${path}.`, false, 'success');
                bus.emit(EVENTS.CHAT_COMMAND_EXECUTED, { command: 'create', result: { path } });
                bus.emit(EVENTS.FILE_OPEN_REQUESTED, { path });
            } catch (err) {
                const { text: msg, tone } = this._describeError(err, `Couldn't create ${path}`);
                if (tone === 'error') {
                    // Retry with the already-resolved `stack`, not the original (possibly undefined) knownStack — avoids re-resolving it on every retry.
                    this._setMessageWithRetry(bubble, msg, tone, () => this._runWithLifecycle(() => this._createNewFile(path, description, stack, bubble)));
                    return;
                }
                this._setMessage(bubble, msg, false, tone);
            }
        }

        /**
         * Multi-file creation for C++'s header/implementation split — the
         * one case explicitly asked for: generate the header (interface)
         * first, then generate the .cpp implementation using that header
         * as context, so it actually implements what was declared rather
         * than the two files disagreeing on signatures. Ported in spirit
         * from the Python CLI's two-step flow (header first, then feed it
         * back in for the implementation).
         *
         * Scoped to C++ only for now — the pattern doesn't obviously
         * generalize to the other stacks Boudica Code scaffolds (Python/
         * JS/TS/Java don't split declaration from implementation the same
         * way), so this isn't a generic "multi-file" system, just this
         * one concrete, explicitly-requested case.
         */
        async _createCppPair(cppPath, description, bubble) {
            const headerPath = cppPath.replace(/\.(cpp|cc|cxx)$/i, '.h');

            if (headerPath === cppPath) {
                // Path didn't actually end in a recognized C++ impl extension
                // (shouldn't happen given the caller's check, but fail safe
                // into single-file creation rather than silently no-op).
                return this._createNewFile(cppPath, description, 'cpp', bubble);
            }
            if (await this._existsInCurrentProject(headerPath)) {
                // Don't clobber an existing header the person may have
                // hand-written or already generated — fall back to a plain
                // single-file create for the .cpp alone.
                return this._createNewFile(cppPath, description, 'cpp', bubble);
            }

            bubble = bubble || this._appendMessage('bot', '', true);
            this._setMessage(bubble, `Designing the header ${headerPath}…`, true);
            try {
                const headerRaw = await BoudicaApi.send(
                    this._sessionKey(),
                    PromptBuilder.buildHeaderPrompt('cpp', description),
                    { temperature: 0.5, maxTokens: 2048, signal: this._activeController?.signal }
                );
                const headerCode = PromptBuilder.cleanCodeResponse(headerRaw);
                if (!headerCode.trim()) {
                    this._setMessage(bubble, 'Boudica returned an empty header — try rephrasing the description.', false, 'error');
                    return;
                }
                await this._ensureRemoteDir(this.davClient, dirname(headerPath));
                await this.davClient.writeFile(headerPath, ensureTrailingNewline(headerCode));

                this._setMessage(bubble, `Wrote ${headerPath} — now implementing ${cppPath}…`, true);
                const cppRaw = await BoudicaApi.send(
                    this._sessionKey(),
                    PromptBuilder.buildCreatePrompt('cpp', description, headerCode),
                    { temperature: 0.5, maxTokens: 8192, signal: this._activeController?.signal }
                );
                const cppCode = PromptBuilder.cleanCodeResponse(cppRaw);
                if (!cppCode.trim()) {
                    this._setMessage(bubble, `Wrote ${headerPath}, but Boudica returned an empty implementation for ${cppPath}.`, false, 'warning');
                    bus.emit(EVENTS.FILE_OPEN_REQUESTED, { path: headerPath });
                    return;
                }
                await this.davClient.writeFile(cppPath, ensureTrailingNewline(cppCode));

                this._setMessage(bubble, `Created ${headerPath} and ${cppPath}.`, false, 'success');
                bus.emit(EVENTS.CHAT_COMMAND_EXECUTED, { command: 'create', result: { path: headerPath } });
                bus.emit(EVENTS.CHAT_COMMAND_EXECUTED, { command: 'create', result: { path: cppPath } });
                bus.emit(EVENTS.FILE_OPEN_REQUESTED, { path: cppPath });
            } catch (err) {
                const { text: msg, tone } = this._describeError(err, `Couldn't create ${headerPath}/${cppPath}`);
                if (tone === 'error') {
                    // Safe to retry the whole call as-is even if the header
                    // already got written before the .cpp call failed — the
                    // existence check near the top of this function falls
                    // back to a single-file create for just the .cpp then,
                    // rather than re-asking for (and re-writing) the header.
                    this._setMessageWithRetry(bubble, msg, tone, () => this._runWithLifecycle(() => this._createCppPair(cppPath, description, bubble)));
                    return;
                }
                this._setMessage(bubble, msg, false, tone);
            }
        }

        /** "/edit <description>" — rewrite the currently-open file. */
        async _cmdEdit(argsRaw) {
            if (!this._requireProject()) return;

            const currentFile = AppState.getCurrentFilePath();
            if (!currentFile) {
                this._appendMessage('bot', 'No file is open in the editor — open one first, or use /create <path> <description> for a new file.', false, 'error');
                return;
            }
            if (!argsRaw.trim()) {
                this._appendMessage('bot', 'Usage: /edit <description of the change>');
                return;
            }
            return this._runEdit(currentFile, argsRaw);
        }

        /**
         * Backs up whatever is CURRENTLY ON DISK at `path` before an AI
         * edit overwrites it — the safety net the original Python CLI had
         * (session_manager.py's file_backups table) that got dropped when
         * this app was ported and never replaced. Without this, a bad
         * Boudica edit destroys the previous version permanently unless
         * the file happened to be open in Monaco (undo) or Nextcloud's own
         * file versioning is enabled server-side.
         *
         * Backs up disk content specifically (not the possibly-unsaved
         * editor buffer used for the edit prompt) — that's what's actually
         * at risk of being lost forever; unsaved editor changes are a
         * separate, already-covered case (Monaco's own undo).
         *
         * Stored at .boudica_backups/<path>.<timestamp>, preserving the
         * original directory structure so same-named files in different
         * folders don't collide. Failure here is logged but never blocks
         * the edit — a missed backup shouldn't be worse than no edit at all.
         */
        async _backupFile(path) {
            try {
                const diskContent = await this.davClient.readFile(path);
                const backupPath = `.boudica_backups/${path}.${Date.now()}`;
                await this._ensureRemoteDir(this.davClient, dirname(backupPath));
                await this.davClient.writeFile(backupPath, diskContent);
                return backupPath;
            } catch (err) {
                console.warn('Boudica Code: backup failed, proceeding without one', err);
                return null;
            }
        }

        /** Lists available backups for `path`, most recent first. */
        async _listBackups(path) {
            const dir = dirname(`.boudica_backups/${path}`);
            const prefix = `${this._basenameOf(path)}.`;
            let entries;
            try {
                entries = await this.davClient.list(dir);
            } catch (err) {
                return [];
            }
            return entries
                .filter((e) => !e.isDirectory && e.name.startsWith(prefix))
                .map((e) => ({
                    name: e.name,
                    path: `${dir}/${e.name}`,
                    timestamp: Number(e.name.slice(prefix.length)) || 0,
                }))
                .sort((a, b) => b.timestamp - a.timestamp);
        }

        _basenameOf(path) {
            return path.split('/').pop();
        }

        /** "/restore <path> [N]" — restores a previous backup; defaults to the most recent (N=1). */
        async _cmdRestore(argsRaw) {
            if (!this._requireProject()) return;

            const [path, nRaw] = argsRaw.trim().split(/\s+/);
            if (!path) {
                this._appendMessage('bot', 'Usage: /restore <path> [N] — N=1 (default) is the most recent backup, 2 the one before that, etc.');
                return;
            }
            const n = Math.max(1, parseInt(nRaw, 10) || 1);

            const backups = await this._listBackups(path);
            if (backups.length === 0) {
                this._appendMessage('bot', `No backups found for ${path}. Backups are only made when Boudica edits an existing file, not on creation.`, false, 'warning');
                return;
            }
            if (n > backups.length) {
                this._appendMessage('bot', `Only ${backups.length} backup(s) exist for ${path} — try N between 1 and ${backups.length}.`, false, 'warning');
                return;
            }

            const chosen = backups[n - 1];
            try {
                const content = await this.davClient.readFile(chosen.path);
                await this.davClient.writeFile(path, content);
                const when = new Date(chosen.timestamp).toLocaleString();
                this._appendMessage('bot', `Restored ${path} from the backup made ${when}.`, false, 'success');

                if (AppState.getOpenFilePaths().includes(path)) {
                    bus.emit(EVENTS.FILE_EXTERNALLY_UPDATED, { path, content });
                } else {
                    bus.emit(EVENTS.FILE_OPEN_REQUESTED, { path });
                }
            } catch (err) {
                this._appendMessage('bot', `Couldn't restore ${path}: ${err.message}`, false, 'error');
            }
        }

        /**
         * Shared by /edit, free-text-with-a-file-open, and
         * _handleCreateIntent's "fill in the existing stub" case — so
         * `targetFile` isn't necessarily open in the editor yet.
         * `knownStack` skips the redundant .boudica_project.json lookup
         * when the caller's already done it. `bubble`, if given, is an
         * existing chat message to update in place rather than appending
         * a new one (see _handleCreateIntent's immediate "On it…"
         * acknowledgment).
         */
        async _runEdit(targetFile, changeDescription, knownStack, bubble) {
            changeDescription = changeDescription.trim();

            const [isValid, error] = PromptBuilder.validateEditRequest(changeDescription);
            if (!isValid) {
                this._setMessage(bubble || this._appendMessage('bot', '', true), error, false, 'error');
                return;
            }

            const alreadyOpen = AppState.getOpenFilePaths().includes(targetFile);
            let currentContent;
            if (alreadyOpen) {
                currentContent = AppState.getOpenFileContent(targetFile); // live editor buffer, may be unsaved
            } else {
                try {
                    currentContent = (await this.davClient.readFile(targetFile)) ?? '';
                } catch (err) {
                    this._setMessage(bubble || this._appendMessage('bot', '', true), `Couldn't read ${targetFile}: ${err.message}`, false, 'error');
                    return;
                }
            }

            const lineCount = currentContent.split('\n').length;
            if (lineCount > MAX_EDIT_LINES || currentContent.length > MAX_EDIT_CHARS) {
                this._setMessage(
                    bubble || this._appendMessage('bot', '', true),
                    `${targetFile} is ${lineCount.toLocaleString()} lines / ${currentContent.length.toLocaleString()} characters — too large to safely inline into a full-file edit prompt (this app targets small scripts, not big files). Try editing a smaller section directly in Monaco, or splitting this file up.`,
                    false,
                    'warning'
                );
                return;
            }

            const stack = knownStack || (await this._resolveStack(targetFile));

            bubble = bubble || this._appendMessage('bot', '', true);
            this._setMessage(bubble, `Working out exactly what to change in ${targetFile}…`, true);
            try {
                const clarifiedRaw = await BoudicaApi.send(
                    this._sessionKey(),
                    PromptBuilder.buildClarifyPrompt(changeDescription, stack),
                    { temperature: 0.3, maxTokens: 256, signal: this._activeController?.signal }
                );
                const clarified = PromptBuilder.cleanClarifiedResponse(clarifiedRaw, changeDescription);

                this._setMessage(bubble, `Asking Boudica to update ${targetFile}…`, true);
                const editedRaw = await BoudicaApi.send(
                    this._sessionKey(),
                    PromptBuilder.buildEditPrompt(targetFile, currentContent, clarified, stack),
                    { temperature: 0.2, maxTokens: 8192, signal: this._activeController?.signal }
                );
                const updatedCode = PromptBuilder.cleanCodeResponse(editedRaw);
                if (!updatedCode.trim()) {
                    this._setMessage(bubble, 'Boudica returned an empty edit — nothing was changed.', false, 'error');
                    return;
                }

                const finalCode = ensureTrailingNewline(updatedCode);
                // Previously the only way to see what an edit actually did
                // was to pull up the .boudica_backups/ copy _backupFile()
                // writes below and diff it by hand after the fact. Compute
                // it up front instead so it can go straight in the success
                // message — visible immediately, not just recoverable.
                const diffSummary = DiffUtil.summarize(currentContent, finalCode);
                await this._backupFile(targetFile); // safety net before the overwrite below — see _backupFile's docblock
                await this.davClient.writeFile(targetFile, finalCode);

                this._setMessage(bubble, `Updated ${targetFile}.\n\n${diffSummary}`, false, 'success');
                bus.emit(EVENTS.CHAT_COMMAND_EXECUTED, { command: 'edit', result: { path: targetFile } });
                if (alreadyOpen) {
                    // Push the new content straight into the live Monaco model.
                    bus.emit(EVENTS.FILE_EXTERNALLY_UPDATED, { path: targetFile, content: finalCode });
                } else {
                    // Wasn't open — open it now so the result is actually visible.
                    bus.emit(EVENTS.FILE_OPEN_REQUESTED, { path: targetFile });
                }
            } catch (err) {
                const { text: msg, tone } = this._describeError(err, `Couldn't edit ${targetFile}`);
                if (tone === 'error') {
                    // Retry with the already-resolved `stack` and the
                    // original (not clarified) changeDescription — the
                    // clarify step re-runs fresh on retry too, which is
                    // correct since it's cheap and non-destructive.
                    this._setMessageWithRetry(bubble, msg, tone, () => this._runWithLifecycle(() => this._runEdit(targetFile, changeDescription, stack, bubble)));
                    return;
                }
                this._setMessage(bubble, msg, false, tone);
            }
        }

        /** Refuses to run project/file commands against the raw home directory — see the setProjectRoot persistence note in state.js. */
        _requireProject() {
            if (AppState.getProjectRoot()) return true;
            this._appendMessage(
                'bot',
                'No project is open. Use /new <name> <stack>, the "+ New Project" button, or open one from the file tree first.',
                false,
                'error'
            );
            return false;
        }

        async _cmdStatus() {
            const status = await this._quickStatus();
            const languages = status.languages.length ? status.languages.join(', ') : 'unknown';
            this._appendMessage('bot', `Project "${status.name}" — ${status.files} top-level files, language: ${languages}.`);
        }

        _cmdBoudicaKey(argsRaw) {
            const key = argsRaw.trim();
            if (!key) {
                this._appendMessage('bot', 'Usage: /boudica-key <your Boudica API key>. Stored in this browser only (localStorage), never sent to Nextcloud.');
                return;
            }
            localStorage.setItem('boudica_api_key', key);
            this._appendMessage('bot', 'Boudica API key saved for this browser.', false, 'success');
        }

        _helpText() {
            return (
                `Commands: /new <name> <stack> (${ProjectScaffolder.SUPPORTED_STACKS.join('|')}), ` +
                `/create <path> <description>, /edit <description> (edits the open file), ` +
                `/restore <path> [N] (undo an AI edit), /status, ` +
                `/boudica-key <key>. Or just type normally to ask a question or, with a file open, request an edit.`
            );
        }

        // ─── Helpers ─────────────────────────────────────────────────

        /** Stable per-project session id; boudicaApi.js layers "No Memory" isolation on top per-call. */
        _sessionKey() {
            return `boudicacode:${AppState.getProjectRoot() || 'home'}`;
        }

        async _existsInCurrentProject(path) {
            try {
                return await this.davClient.exists(path);
            } catch (err) {
                return false;
            }
        }

        /**
         * Three-step stack detection, each a fallback for the last:
         *  1. .boudica_project.json — authoritative, written by the scaffolder.
         *  2. The target path's extension, if one was given.
         *  3. Marker files in the project root (CMakeLists.txt, pom.xml,
         *     etc.) — covers projects with no .boudica_project.json (made
         *     before the scaffolder wrote one, or created outside this
         *     app entirely) and a message with no explicit filename.
         * @returns {Promise<{stack: string|null, guessed: boolean}>}
         *   guessed=true means step 3 fired, or nothing worked at all —
         *   i.e. the caller is about to silently default to Python and
         *   the person should be told that's a guess, not a detection.
         */
        async _detectStack(path) {
            try {
                const raw = await this.davClient.readFile('.boudica_project.json');
                const config = JSON.parse(raw);
                if (config && config.stack) return { stack: config.stack, guessed: false };
            } catch (err) {
                // no config file yet, or not JSON — fall through
            }
            if (path) {
                const ext = path.split('.').pop().toLowerCase();
                if (EXTENSION_TO_STACK[ext]) return { stack: EXTENSION_TO_STACK[ext], guessed: false };
            }
            const fromFiles = await this._detectStackFromProjectFiles();
            return { stack: fromFiles, guessed: true };
        }

        /** Last-resort fallback: infer the stack from characteristic files sitting in the project root. */
        async _detectStackFromProjectFiles() {
            let entries;
            try {
                entries = await this.davClient.list('');
            } catch (err) {
                return null;
            }
            const names = new Set(entries.map((e) => e.name));
            if (names.has('CMakeLists.txt')) return 'cpp';
            if (names.has('pom.xml')) return 'java';
            if (names.has('tsconfig.json')) return 'typescript';
            if (names.has('package.json')) return 'nodejs';
            if (names.has('requirements.txt') || names.has('setup.py')) return 'python';
            return null; // bash/batch have no distinctive root-level marker file to key off
        }

        /**
         * Resolves a stack for a create/edit call and, if it had to guess
         * (see _detectStack), tells the person so in the chat log —
         * silently defaulting to Python for a non-Python project was
         * exactly the bug this replaces.
         */
        async _resolveStack(path) {
            const { stack, guessed } = await this._detectStack(path);
            if (stack && !guessed) return stack;
            const finalStack = stack || 'python';
            this._appendMessage(
                'bot',
                `(Couldn't tell this project's stack — no .boudica_project.json and no recognizable project ` +
                `files. Assuming ${finalStack}; name the file with its real extension, e.g. "build src/main.cpp ` +
                `that...", to override this.)`,
                false,
                'warning'
            );
            return finalStack;
        }

        async _quickStatus() {
            const projectRoot = AppState.getProjectRoot();
            const name = projectRoot ? projectRoot.split('/').pop() : '(home)';
            let files = 0;
            try {
                const entries = await this.davClient.list('');
                files = entries.filter((e) => !e.isDirectory && !e.name.startsWith('.')).length;
            } catch (err) {
                // leave files at 0 — a broken listing shouldn't block chat
            }
            const { stack } = await this._detectStack(null);
            return { name, files, languages: stack ? [stack] : [] };
        }

        /** WebDAV's MKCOL can only create one level at a time and needs the parent to already exist. */
        async _ensureRemoteDir(client, relativeDirPath) {
            const segments = relativeDirPath.split('/').filter(Boolean);
            let current = '';
            for (const segment of segments) {
                current = current ? `${current}/${segment}` : segment;
                try {
                    await client.makeDirectory(current);
                } catch (err) {
                    // Already exists (405) — expected and fine; anything else
                    // surfaces naturally when the subsequent write fails.
                }
            }
        }
    }

    BoudicaCode.ChatPanel = ChatPanel;
})(window);
