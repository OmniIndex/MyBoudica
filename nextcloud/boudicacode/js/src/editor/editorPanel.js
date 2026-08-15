/**
 * editorPanel.js
 *
 * Wraps Monaco Editor and adds tab support. Classic script — see
 * eventBus.js for load-order rationale. Must load after eventBus.js
 * and state.js.
 *
 * Tabs = AppState.getOpenFilePaths() (insertion-ordered) plus an
 * always-present 'home' tab. Each open file gets its own Monaco
 * model, kept alive in this.models so switching tabs is instant and
 * doesn't lose scroll position/undo history. The Home tab fetches a
 * markdown doc and renders it via markdownFormatter.js.
 *
 * By default this fetches from this app's own docs/ folder (see
 * DocsController.php and docs/README.md) — same-origin, so no CSP or
 * CORS considerations apply. homeMarkdownUrl() below is the one place
 * to change if the doc should come from somewhere else instead (an
 * external URL needs its own connect-src CSP entry and CORS support
 * from that server — see _loadHomeContent()'s docblock).
 */
(function (global) {
    'use strict';

    const BoudicaCode = global.BoudicaCode || (global.BoudicaCode = {});
    const { bus, EVENTS } = BoudicaCode;
    const { AppState } = BoudicaCode;

    const HOME_DOC_PATH = 'USER-GUIDE.md'; // filename inside docs/ — see docs/README.md

    function homeMarkdownUrl() {
        const path = `/apps/boudicacode/docs/${HOME_DOC_PATH}`;
        return (global.OC && OC.generateUrl) ? OC.generateUrl(path) : path;
    }

    function escapeForAttribute(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    const LANGUAGE_MAP = {
        py: 'python',
        js: 'javascript',
        ts: 'typescript',
        jsx: 'javascript',
        tsx: 'typescript',
        cpp: 'cpp',
        cc: 'cpp',
        cxx: 'cpp',
        h: 'cpp',
        hpp: 'cpp',
        c: 'c',
        java: 'java',
        json: 'json',
        md: 'markdown',
        html: 'html',
        css: 'css',
        sh: 'shell',
        yml: 'yaml',
        yaml: 'yaml',
        txt: 'plaintext',
    };

    function languageForPath(path) {
        const ext = path.split('.').pop().toLowerCase();
        return LANGUAGE_MAP[ext] || 'plaintext';
    }

    function basename(path) {
        return path.split('/').pop();
    }

    class EditorPanel {
        constructor(mountEl, davClient) {
            this.mountEl = mountEl;
            this.davClient = davClient;
            this.editor = null;
            this.models = new Map(); // path -> monaco.editor.ITextModel
            this.homeLoaded = false;

            this._onFileOpenRequested = this._onFileOpenRequested.bind(this);
            this._onFileOpened = this._onFileOpened.bind(this);
            this._onTabActivated = this._onTabActivated.bind(this);
            this._onFileClosed = this._onFileClosed.bind(this);
            this._onDirtyOrSaved = this._onDirtyOrSaved.bind(this);
            this._onFileExternallyUpdated = this._onFileExternallyUpdated.bind(this);

            bus.on(EVENTS.FILE_OPEN_REQUESTED, this._onFileOpenRequested);
            bus.on(EVENTS.FILE_OPENED, this._onFileOpened);
            bus.on(EVENTS.TAB_ACTIVATED, this._onTabActivated);
            bus.on(EVENTS.FILE_CLOSED, this._onFileClosed);
            bus.on(EVENTS.FILE_DIRTY, this._onDirtyOrSaved);
            bus.on(EVENTS.FILE_EXTERNALLY_UPDATED, this._onFileExternallyUpdated);
            bus.on(EVENTS.FILE_SAVED, this._onDirtyOrSaved);
        }

        async init() {
            this._renderShell();
            this._renderTabs();

            return new Promise((resolve) => {
                if (!global.require) {
                    console.error(
                        'Boudica Code: Monaco AMD loader (window.require) not found. ' +
                        'Check that vendor/monaco/vs/loader.js is being served and loaded ' +
                        'before this script.'
                    );
                    this.monacoMountEl.innerHTML =
                        '<div class="bc-editor-placeholder">Editor failed to load — Monaco\'s loader.js did not run.</div>';
                    resolve();
                    return;
                }

                const vsBase = (global.OC && OC.generateUrl)
                    ? OC.generateUrl('/apps/boudicacode/vendor-assets')
                    : '/apps/boudicacode/vendor-assets';

                global.MonacoEnvironment = {
                    getWorkerUrl: function (moduleId, label) {
                        return `data:text/javascript;charset=utf-8,${encodeURIComponent(`
                            self.MonacoEnvironment = { baseUrl: '${vsBase}/../' };
                            importScripts('${vsBase}/base/worker/workerMain.js');
                        `)}`;
                    },
                };

                global.require.config({ paths: { vs: vsBase } });
                global.require(['vs/editor/editor.main'], () => {
                    this._createEditor();
                    resolve();
                }, (err) => {
                    console.error('Boudica Code: Monaco failed to load', err);
                    this.monacoMountEl.innerHTML =
                        '<div class="bc-editor-placeholder">Editor failed to load — see console for details.</div>';
                    resolve();
                });
            });
        }

        _renderShell() {
            this.mountEl.innerHTML = `
                <div class="bc-editor">
                    <div class="bc-editor-tabs" data-role="tabs"></div>
                    <div class="bc-editor-toolbar">
                        <button data-action="new-project" title="Create a new project">+ New Project</button>
                        <button data-action="compile-check" title="Syntax/compile check the current file">&#9654; Check</button>
                    </div>
                    <div class="bc-editor-body">
                        <div class="bc-editor-monaco-mount" data-role="monaco-mount"></div>
                        <div class="bc-editor-home" data-role="home-content"></div>
                    </div>
                </div>
            `;
            this.tabsEl = this.mountEl.querySelector('[data-role="tabs"]');
            this.monacoMountEl = this.mountEl.querySelector('[data-role="monaco-mount"]');
            this.homeContentEl = this.mountEl.querySelector('[data-role="home-content"]');
            this.mountEl.querySelector('[data-action="compile-check"]')
                .addEventListener('click', () => this._runCompileCheck());
            this.mountEl.querySelector('[data-action="new-project"]')
                .addEventListener('click', () => BoudicaCode.NewProjectDialog.open());
        }

        _createEditor() {
            this.editor = global.monaco.editor.create(this.monacoMountEl, {
                value: '',
                language: 'plaintext',
                theme: 'vs-dark',
                automaticLayout: true,
                minimap: { enabled: true },
                fontSize: 13,
            });

            this.editor.onDidChangeModelContent(() => {
                const path = AppState.getCurrentFilePath();
                if (!path) return;
                AppState.updateFileContent(path, this.editor.getValue());
            });

            this.editor.addCommand(
                global.monaco.KeyMod.CtrlCmd | global.monaco.KeyCode.KeyS,
                () => this.saveCurrentFile()
            );

            // In case tabs/files were opened before Monaco finished loading.
            for (const path of AppState.getOpenFilePaths()) {
                if (!this.models.has(path)) {
                    const content = AppState.getOpenFileContent(path);
                    this.models.set(path, global.monaco.editor.createModel(content, languageForPath(path)));
                }
            }
            this._syncVisibleContent();
        }

        _renderTabs() {
            const activeTab = AppState.getActiveTab();
            const openPaths = AppState.getOpenFilePaths();

            this.tabsEl.innerHTML = '';

            const homeTab = document.createElement('div');
            homeTab.className = `bc-editor-tab ${activeTab === 'home' ? 'is-active' : ''}`;
            homeTab.textContent = '🏠 Home';
            homeTab.tabIndex = 0;
            homeTab.addEventListener('click', () => AppState.setActiveTab('home'));
            homeTab.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); AppState.setActiveTab('home'); }
            });
            this.tabsEl.appendChild(homeTab);

            for (const path of openPaths) {
                const isActive = activeTab === path;
                const isDirty = AppState.isDirty(path);

                const tab = document.createElement('div');
                tab.className = `bc-editor-tab ${isActive ? 'is-active' : ''}`;
                tab.title = path;
                tab.tabIndex = 0;

                const label = document.createElement('span');
                label.className = 'bc-editor-tab__label';
                label.textContent = basename(path);
                tab.appendChild(label);

                if (isDirty) {
                    const dot = document.createElement('span');
                    dot.className = 'bc-editor-tab__dirty-dot';
                    dot.title = 'Unsaved changes';
                    tab.appendChild(dot);
                }

                const closeBtn = document.createElement('span');
                closeBtn.className = 'bc-editor-tab__close';
                closeBtn.textContent = '×';
                closeBtn.title = 'Close';
                closeBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    AppState.closeFile(path);
                });
                tab.appendChild(closeBtn);

                tab.addEventListener('click', () => AppState.setActiveTab(path));
                tab.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); AppState.setActiveTab(path); }
                });
                this.tabsEl.appendChild(tab);
            }
        }

        /** Shows either the Monaco mount or the rendered Home content, matching the active tab. */
        _syncVisibleContent() {
            const activeTab = AppState.getActiveTab();

            if (activeTab === 'home') {
                this.monacoMountEl.style.display = 'none';
                this.homeContentEl.style.display = 'block';
                if (!this.homeLoaded) {
                    this.homeLoaded = true;
                    this._loadHomeContent();
                }
                return;
            }

            this.homeContentEl.style.display = 'none';
            this.monacoMountEl.style.display = 'block';

            if (this.editor && this.models.has(activeTab)) {
                this.editor.setModel(this.models.get(activeTab));
            }
        }

        /**
         * Fetches homeMarkdownUrl() and renders it via MarkdownFormatter.
         *
         * Same-origin by default (see homeMarkdownUrl()) — no CSP/CORS
         * considerations. If this ever points at an EXTERNAL url
         * instead, two things change: it needs connect-src (not
         * frame-src — a fetch() is governed by a different CSP
         * directive than the old iframe embed was), and the source
         * server needs to send Access-Control-Allow-Origin permitting
         * this Nextcloud's origin, which is outside this app's control
         * entirely. Either way, a failed fetch falls back to a short
         * message with a direct link rather than a blank pane.
         */
        async _loadHomeContent() {
            this.homeContentEl.innerHTML = '<p class="bc-editor-home__status">Loading…</p>';
            const url = homeMarkdownUrl();
            try {
                const res = await fetch(url);
                if (!res.ok) {
                    throw new Error(`HTTP ${res.status}`);
                }
                const markdown = await res.text();
                this.homeContentEl.innerHTML = BoudicaCode.MarkdownFormatter.render(markdown);
            } catch (err) {
                this.homeContentEl.innerHTML =
                    `<p class="bc-editor-home__status bc-editor-home__status--error">Couldn't load this page ` +
                    `(${escapeForAttribute(err.message)}). <a href="${url}" target="_blank" rel="noopener noreferrer">` +
                    `Open it directly instead ↗</a></p>`;
            }
        }

        async _onFileOpenRequested(event) {
            const { path } = event.detail;

            // Already open — just switch to its tab, no need to re-fetch.
            if (AppState.getOpenFilePaths().includes(path)) {
                AppState.setActiveTab(path);
                return;
            }

            try {
                const content = await this.davClient.readFile(path);
                AppState.setCurrentFile(path, content); // emits FILE_OPENED + TAB_ACTIVATED
            } catch (err) {
                bus.emit(EVENTS.ERROR, { message: `Could not open ${path}`, error: err });
            }
        }

        _onFileOpened(event) {
            const { path, content } = event.detail;
            if (this.editor && !this.models.has(path)) {
                const model = global.monaco.editor.createModel(content, languageForPath(path));
                this.models.set(path, model);
            }
            this._renderTabs();
        }

        _onTabActivated() {
            this._renderTabs();
            this._syncVisibleContent();
        }

        _onFileClosed(event) {
            const { path } = event.detail;
            const model = this.models.get(path);
            if (model) {
                model.dispose();
                this.models.delete(path);
            }
            this._renderTabs();
        }

        _onDirtyOrSaved() {
            this._renderTabs();
        }

        /**
         * The AI agent (via chatPanel.js -> /api/command or /api/chat)
         * wrote `path` directly to disk — e.g. a freshly generated file,
         * or an auto-applied edit to the file currently open. If it's
         * open as a tab, push the new content into its live Monaco
         * model (without clobbering the user's undo stack by replacing
         * the model) and mark it clean, since it's already on disk.
         */
        _onFileExternallyUpdated(event) {
            const { path, content } = event.detail;
            const model = this.models.get(path);
            if (model && model.getValue() !== content) {
                model.setValue(content);
            }
            AppState.setFileContentFromDisk(path, content);
        }

        /** Public entry point used by fileTree.js / chatPanel.js — kept for backward compatibility. */
        loadFile(path, content) {
            AppState.setCurrentFile(path, content);
        }

        async saveCurrentFile() {
            const path = AppState.getCurrentFilePath();
            if (!path || !this.editor) return;
            const content = this.editor.getValue();
            try {
                await this.davClient.writeFile(path, content);
                AppState.markFileSaved(path);
            } catch (err) {
                bus.emit(EVENTS.ERROR, { message: `Could not save ${path}`, error: err });
            }
        }

        async _runCompileCheck() {
            const path = AppState.getCurrentFilePath();
            if (!path || !this.editor) {
                bus.emit(EVENTS.ERROR, { message: 'Open a file before running a compile check.' });
                return;
            }

            const content = this.editor.getValue();
            const base = (global.OC && OC.generateUrl)
                ? OC.generateUrl('/apps/boudicacode/compile-check')
                : '/apps/boudicacode/compile-check';

            try {
                const res = await fetch(base, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        requesttoken: (global.OC && OC.requestToken) || '',
                    },
                    body: JSON.stringify({ filename: path, content }),
                });
                const data = await res.json();
                bus.emit(EVENTS.COMPILE_RESULT, { path, ...data });
            } catch (err) {
                bus.emit(EVENTS.ERROR, { message: `Compile check failed for ${path}`, error: err });
            }
        }
    }

    BoudicaCode.EditorPanel = EditorPanel;
})(window);
