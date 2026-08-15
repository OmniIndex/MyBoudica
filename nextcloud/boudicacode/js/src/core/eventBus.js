/**
 * eventBus.js
 *
 * A minimal pub/sub built on the native EventTarget so the three panels
 * (editor, file tree, chat) can stay in sync without any framework.
 *
 * NOTE: this is a classic (non-module) script, loaded via Nextcloud's
 * script() helper — not an ES module. Everything hangs off the shared
 * window.BoudicaCode namespace so later files can use it. Load order
 * matters: this file must load before any file that references
 * BoudicaCode.bus or BoudicaCode.EVENTS.
 *
 * Usage (from a later script):
 *   BoudicaCode.bus.on(BoudicaCode.EVENTS.FILE_OPENED, (e) => ...);
 *   BoudicaCode.bus.emit(BoudicaCode.EVENTS.FILE_OPENED, { path: '...' });
 */
(function (global) {
    'use strict';

    const BoudicaCode = global.BoudicaCode || (global.BoudicaCode = {});

    class EventBus extends EventTarget {
        on(eventName, handler) {
            this.addEventListener(eventName, handler);
            return () => this.removeEventListener(eventName, handler);
        }

        off(eventName, handler) {
            this.removeEventListener(eventName, handler);
        }

        emit(eventName, detail = {}) {
            this.dispatchEvent(new CustomEvent(eventName, { detail }));
        }
    }

    BoudicaCode.bus = new EventBus();

    BoudicaCode.EVENTS = {
        // Project / file lifecycle
        PROJECT_SELECTED: 'project:selected',
        FILE_LIST_LOADED: 'files:list-loaded',
        FILE_CREATED: 'file:created',
        FILE_DELETED: 'file:deleted',
        FILE_RENAMED: 'file:renamed',

        // Editor
        FILE_OPEN_REQUESTED: 'file:open-requested',
        FILE_OPENED: 'file:opened',
        FILE_DIRTY: 'file:dirty',
        FILE_SAVED: 'file:saved',
        FILE_CLOSED: 'file:closed',
        TAB_ACTIVATED: 'tab:activated', // detail: { tabId: 'home' | filePath }
        COMPILE_RESULT: 'compile:result', // detail: { path, success, output, exitCode }

        // Fired when the AI agent writes a file directly to disk (project
        // scaffold, /create, or an auto-applied /edit) rather than through
        // the editor's own save path. EditorPanel listens for this to keep
        // any open Monaco model in sync with what's actually on disk.
        // detail: { path, content }
        FILE_EXTERNALLY_UPDATED: 'file:externally-updated',

        // Chat / bot
        CHAT_MESSAGE_SENT: 'chat:message-sent',
        CHAT_MESSAGE_RECEIVED: 'chat:message-received',
        CHAT_COMMAND_EXECUTED: 'chat:command-executed',

        // App-level
        ERROR: 'app:error',
    };
})(window);
