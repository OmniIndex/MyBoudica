/**
 * main.js
 *
 * Entry point. Classic script — must load LAST, after eventBus.js,
 * state.js, webdavClient.js, editorPanel.js, fileTree.js, chatPanel.js
 * have all registered themselves on window.BoudicaCode.
 *
 * Builds the three-pane layout inside #boudica-code-root and wires up
 * EditorPanel, FileTree, and ChatPanel against a shared WebDavClient
 * and event bus.
 */
(function (global) {
    'use strict';

    const BoudicaCode = global.BoudicaCode || (global.BoudicaCode = {});
    const { bus, EVENTS, AppState, WebDavClient, EditorPanel, FileTree, ChatPanel, ProjectSwitcher } = BoudicaCode;

    async function boot() {
        const root = document.getElementById('boudica-code-root');
        if (!root) {
            console.error('Boudica Code: mount point #boudica-code-root not found');
            return;
        }

        // TODO: replace with real project selection UI. For now, read a
        // data attribute the PHP template can populate, falling back to
        // the last project this browser used (see state.js's
        // setProjectRoot), then to the root of the user's Nextcloud
        // files if neither is set.
        const initialProjectRoot = root.dataset.projectRoot || localStorage.getItem('bc_last_project_root') || '';

        root.innerHTML = `
            <div class="bc-projectbar" data-role="projectbar"></div>
            <div class="bc-layout">
                <aside class="bc-panel bc-panel--files" data-role="files"></aside>
                <main class="bc-panel bc-panel--editor" data-role="editor"></main>
                <div class="bc-resizer" data-role="chat-resizer" title="Drag to resize the chat panel"></div>
                <aside class="bc-panel bc-panel--chat" data-role="chat"></aside>
            </div>
            <div class="bc-statusbar" data-role="status"></div>
        `;

        const layoutEl = root.querySelector('.bc-layout');
        wireChatResizer(layoutEl);

        const davClient = new WebDavClient(initialProjectRoot);

        // Registered BEFORE any panel that constructs and might react to
        // PROJECT_SELECTED (FileTree, ChatPanel) — event listeners fire in
        // registration order, so this must run first or those panels will
        // refresh against davClient's stale (pre-switch) root. This was a
        // real bug: switching projects via the project bar updated the
        // breadcrumb (FileTree's own local state) correctly, but listed
        // the PREVIOUS project's contents, because FileTree's refresh
        // listener was registered — and therefore fired — before this one.
        bus.on(EVENTS.PROJECT_SELECTED, (e) => davClient.setProjectRoot(e.detail.projectRoot));

        const fileTree = new FileTree(root.querySelector('[data-role="files"]'), davClient);
        const editorPanel = new EditorPanel(root.querySelector('[data-role="editor"]'), davClient);
        const chatPanel = new ChatPanel(root.querySelector('[data-role="chat"]'), davClient);
        const projectSwitcher = new ProjectSwitcher(root.querySelector('[data-role="projectbar"]'));
        // Exposed so other panels can trigger chat-driven actions without
        // duplicating their logic — e.g. fileTree.js's "Restore previous
        // version" context-menu item reuses chatPanel's own _cmdRestore().
        BoudicaCode.chatPanel = chatPanel;

        chatPanel.init();
        await editorPanel.init();

        AppState.setProjectRoot(initialProjectRoot); // triggers FileTree's first load
        await fileTree.init();
        await projectSwitcher.init();

        wireStatusBar(root.querySelector('[data-role="status"]'));
    }

    function wireStatusBar(statusEl) {
        const setStatus = (text, isError = false) => {
            statusEl.textContent = text;
            statusEl.classList.toggle('bc-statusbar--error', isError);
        };

        bus.on(EVENTS.FILE_OPENED, (e) => setStatus(`Open: ${e.detail.path}`));
        bus.on(EVENTS.FILE_DIRTY, (e) => setStatus(`Open: ${e.detail.path} (unsaved)`));
        bus.on(EVENTS.FILE_SAVED, (e) => setStatus(`Open: ${e.detail.path} (saved)`));
        bus.on(EVENTS.ERROR, (e) => {
            setStatus(`Error: ${e.detail.message}`, true);
            console.error('Boudica Code error:', e.detail.message, e.detail.error);
        });
    }

    /**
     * Drag-to-resize for the chat panel (right edge of the layout).
     * Width lives in the --bc-chat-width CSS custom property that
     * style.css's .bc-layout grid-template-columns reads, and persists
     * across reloads via localStorage. Double-click resets to default.
     */
    function wireChatResizer(layoutEl) {
        const resizer = layoutEl.querySelector('[data-role="chat-resizer"]');
        const chatPanel = layoutEl.querySelector('.bc-panel--chat');
        if (!resizer || !chatPanel) return;

        const MIN_WIDTH = 240;
        const MAX_WIDTH = 640;
        const STORAGE_KEY = 'bc_chat_width';

        const storedWidth = parseInt(localStorage.getItem(STORAGE_KEY) || '', 10);
        if (storedWidth) {
            layoutEl.style.setProperty('--bc-chat-width', `${storedWidth}px`);
        }

        let dragging = false;
        let startX = 0;
        let startWidth = 0;

        resizer.addEventListener('mousedown', (e) => {
            dragging = true;
            resizer.classList.add('is-dragging');
            startX = e.clientX;
            startWidth = chatPanel.getBoundingClientRect().width;
            document.body.style.userSelect = 'none';
            e.preventDefault();
        });

        global.addEventListener('mousemove', (e) => {
            if (!dragging) return;
            // The resizer sits on the chat panel's LEFT edge, so dragging
            // left (negative delta) should widen it, not shrink it.
            const delta = startX - e.clientX;
            const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + delta));
            layoutEl.style.setProperty('--bc-chat-width', `${newWidth}px`);
        });

        global.addEventListener('mouseup', () => {
            if (!dragging) return;
            dragging = false;
            resizer.classList.remove('is-dragging');
            document.body.style.userSelect = '';
            const widthPx = parseInt(getComputedStyle(layoutEl).getPropertyValue('--bc-chat-width'), 10);
            if (widthPx) {
                localStorage.setItem(STORAGE_KEY, String(widthPx));
            }
        });

        resizer.addEventListener('dblclick', () => {
            layoutEl.style.removeProperty('--bc-chat-width');
            localStorage.removeItem(STORAGE_KEY);
        });
    }

    document.addEventListener('DOMContentLoaded', boot);
})(window);
