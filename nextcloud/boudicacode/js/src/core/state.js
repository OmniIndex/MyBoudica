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

    /** Paths of currently-open files with unsaved changes, most-recently-opened order preserved. */
    function dirtyPaths() {
        return Array.from(state.openFiles.entries())
            .filter(([, entry]) => entry.isDirty)
            .map(([path]) => path);
    }

    BoudicaCode.AppState = {
        getProjectRoot() {
            return state.projectRoot;
        },

        /**
         * Switches the active project root. Returns true if the switch
         * happened, false if it was declined (see below) — callers that
         * chain further UI updates (e.g. projectSwitcher.js closing its
         * dropdown) should check this rather than assuming success.
         *
         * If any open file has unsaved changes, this used to discard them
         * with zero warning (state.openFiles.clear() below ran
         * unconditionally) — switching projects, or even just picking
         * "Home" from the project bar, silently threw away in-progress
         * edits. Now it confirms first, same pattern as fileTree.js's own
         * delete confirmation, and aborts the switch entirely if declined.
         */
        setProjectRoot(path) {
            const dirty = dirtyPaths();
            if (dirty.length > 0) {
                const shown = dirty.slice(0, 5).join(', ') + (dirty.length > 5 ? `, and ${dirty.length - 5} more` : '');
                const proceed = global.confirm(
                    `You have unsaved changes in: ${shown}.\n\nSwitching projects will discard them. Continue?`
                );
                if (!proceed) return false;
            }

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
            return true;
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

        /**
         * Called after a successful WebDAV rename/move (see fileTree.js's
         * "Rename" context-menu item) so any open tab under the moved path
         * follows along instead of being left pointing at a path that no
         * longer exists on disk. Handles both a single renamed FILE (exact
         * path match) and a renamed FOLDER — every open path nested under
         * it gets re-prefixed, e.g. renaming "src" to "lib" also moves an
         * open "src/main.py" tab to "lib/main.py".
         * @returns {boolean} whether any open tab was actually affected
         */
        renameOpenFile(oldPath, newPath) {
            const renames = [];
            for (const path of state.openFiles.keys()) {
                if (path === oldPath) {
                    renames.push([path, newPath]);
                } else if (path.startsWith(`${oldPath}/`)) {
                    renames.push([path, newPath + path.slice(oldPath.length)]);
                }
            }
            if (renames.length === 0) return false;

            for (const [from, to] of renames) {
                const entry = state.openFiles.get(from);
                state.openFiles.delete(from);
                state.openFiles.set(to, entry);
                if (state.activeTab === from) {
                    state.activeTab = to;
                }
            }
            bus.emit(EVENTS.FILE_RENAMED, { renames });
            return true;
        },

        /**
         * Called after a project FOLDER itself was renamed (see
         * projectSwitcher.js) — distinct from setProjectRoot(), which
         * means "switch to a different project" and discards open tabs
         * (with a confirm if any are dirty). A rename doesn't invalidate
         * anything: every open tab's path is already relative to the
         * project root, so only the root string itself (and anything
         * keyed off it, like WebDavClient's prefix — see main.js's
         * PROJECT_SELECTED listener) needs to move. No-op if the renamed
         * project isn't the currently active one.
         */
        renameProjectRoot(oldPath, newPath) {
            if (state.projectRoot !== oldPath) return;
            state.projectRoot = newPath;
            try {
                localStorage.setItem('bc_last_project_root', newPath);
            } catch (err) {
                // non-fatal, see setProjectRoot's identical catch
            }
            bus.emit(EVENTS.PROJECT_SELECTED, { projectRoot: newPath });
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
