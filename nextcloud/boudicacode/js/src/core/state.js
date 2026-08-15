/**
 * state.js
 *
 * Single source of truth for cross-panel state. Classic script — see
 * eventBus.js for the loading-order rationale. Must load after
 * eventBus.js, before editorPanel.js / fileTree.js / chatPanel.js.
 *
 * "Tabs" are just: openFiles (a Map, so insertion order = tab order)
 * plus activeTab, which is either the string 'home' or a file path.
 * The Home tab always exists implicitly — it's never stored in
 * openFiles, just represented by activeTab === 'home'.
 */
(function (global) {
    'use strict';

    const BoudicaCode = global.BoudicaCode || (global.BoudicaCode = {});
    const { bus, EVENTS } = BoudicaCode;

    const state = {
        projectRoot: null,
        openFiles: new Map(), // path -> { content, isDirty } — Map preserves insertion order, used as tab order
        activeTab: 'home', // 'home' | filePath
    };

    BoudicaCode.AppState = {
        getProjectRoot() {
            return state.projectRoot;
        },

        setProjectRoot(path) {
            state.projectRoot = path;
            state.openFiles.clear();
            state.activeTab = 'home';
            // Persisted so a full page reload doesn't silently drop back to
            // the raw home directory — see main.js's boot(), which reads
            // this back as a fallback for the (currently always-empty)
            // server-rendered data-project-root attribute.
            try {
                localStorage.setItem('bc_last_project_root', path || '');
            } catch (err) {
                // localStorage unavailable (private browsing, quota, etc.) —
                // non-fatal, just means reloads won't remember the project.
            }
            bus.emit(EVENTS.PROJECT_SELECTED, { projectRoot: path });
        },

        getActiveTab() {
            return state.activeTab;
        },

        /** @param {string} tabId - 'home' or a file path already present in openFiles */
        setActiveTab(tabId) {
            state.activeTab = tabId;
            bus.emit(EVENTS.TAB_ACTIVATED, { tabId });
        },

        getOpenFilePaths() {
            return Array.from(state.openFiles.keys());
        },

        /** Convenience: null when the Home tab is active, else the active file's path. */
        getCurrentFilePath() {
            return state.activeTab === 'home' ? null : state.activeTab;
        },

        /** Opens a file as a tab (or switches to it if already open) and activates it. */
        setCurrentFile(path, content) {
            if (!state.openFiles.has(path)) {
                state.openFiles.set(path, { content, isDirty: false });
            }
            state.activeTab = path;
            bus.emit(EVENTS.FILE_OPENED, { path, content });
            bus.emit(EVENTS.TAB_ACTIVATED, { tabId: path });
        },

        /**
         * Closes a file's tab. If it was the active tab, falls back to
         * the next remaining open file, or 'home' if none are left.
         */
        closeFile(path) {
            if (!state.openFiles.has(path)) return;
            const paths = Array.from(state.openFiles.keys());
            const closedIndex = paths.indexOf(path);
            state.openFiles.delete(path);

            if (state.activeTab === path) {
                const remaining = Array.from(state.openFiles.keys());
                const fallback = remaining[closedIndex] || remaining[closedIndex - 1] || 'home';
                state.activeTab = fallback;
                bus.emit(EVENTS.FILE_CLOSED, { path });
                bus.emit(EVENTS.TAB_ACTIVATED, { tabId: fallback });
            } else {
                bus.emit(EVENTS.FILE_CLOSED, { path });
            }
        },

        updateFileContent(path, content) {
            const entry = state.openFiles.get(path);
            if (entry) {
                entry.content = content;
                entry.isDirty = true;
            }
            bus.emit(EVENTS.FILE_DIRTY, { path });
        },

        markFileSaved(path) {
            const entry = state.openFiles.get(path);
            if (entry) entry.isDirty = false;
            bus.emit(EVENTS.FILE_SAVED, { path });
        },

        /**
         * Like updateFileContent, but for content that arrived already
         * persisted on disk (e.g. the AI agent just wrote this file) —
         * so the tab should NOT show an unsaved-changes dot. No-op if
         * the file isn't currently open as a tab.
         */
        setFileContentFromDisk(path, content) {
            const entry = state.openFiles.get(path);
            if (!entry) return false;
            entry.content = content;
            entry.isDirty = false;
            bus.emit(EVENTS.FILE_SAVED, { path });
            return true;
        },

        isDirty(path) {
            return state.openFiles.get(path)?.isDirty ?? false;
        },

        getOpenFileContent(path) {
            return state.openFiles.get(path)?.content ?? '';
        },
    };
})(window);
