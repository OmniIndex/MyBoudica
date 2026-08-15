/**
 * fileTree.js
 *
 * Left panel: lists the current project's files/folders. Classic
 * script — see eventBus.js for load-order rationale. Must load after
 * eventBus.js and state.js.
 *
 * Tracks the currently-browsed directory (relative to the project
 * root) so that navigating into subfolders and creating files/folders
 * both operate on the right location, and shows a breadcrumb so the
 * user can navigate back out.
 *
 * TODO: project switcher — see README.
 */
(function (global) {
    'use strict';

    const BoudicaCode = global.BoudicaCode || (global.BoudicaCode = {});
    const { bus, EVENTS } = BoudicaCode;
    const { AppState } = BoudicaCode;

    function joinRelative(dir, name) {
        return dir ? `${dir.replace(/\/+$/, '')}/${name}` : name;
    }

    class FileTree {
        constructor(mountEl, davClient) {
            this.mountEl = mountEl;
            this.davClient = davClient;
            this.currentDir = ''; // relative to project root — '' means project root itself
            this.collapsed = localStorage.getItem('bc_files_collapsed') === '1';
            this.clipboard = null; // { path, isDirectory, mode: 'copy' | 'cut' }
            this._menuEl = null;

            this._onProjectSelected = this._onProjectSelected.bind(this);
            this._onCommandExecuted = this._onCommandExecuted.bind(this);
            this._updateActiveHighlight = this._updateActiveHighlight.bind(this);
            bus.on(EVENTS.PROJECT_SELECTED, this._onProjectSelected);
            bus.on(EVENTS.CHAT_COMMAND_EXECUTED, this._onCommandExecuted);
            // Keep the "currently open" highlight in the tree in sync with
            // whatever the editor considers active — covers opening a file,
            // switching tabs, and closing the active tab.
            bus.on(EVENTS.FILE_OPENED, this._updateActiveHighlight);
            bus.on(EVENTS.TAB_ACTIVATED, this._updateActiveHighlight);
            bus.on(EVENTS.FILE_CLOSED, this._updateActiveHighlight);
        }

        async init() {
            this._renderShell();
            if (AppState.getProjectRoot() !== null) {
                await this.refresh('');
            }
        }

        _renderShell() {
            this.mountEl.innerHTML = `
                <div class="bc-file-tree">
                    <div class="bc-file-tree__toolbar">
                        <button data-action="collapse" title="Collapse panel">⟨</button>
                        <button data-action="new-file" title="New file">+ File</button>
                        <button data-action="new-folder" title="New folder">+ Folder</button>
                        <button data-action="refresh" title="Refresh">&#8635;</button>
                        <button data-action="download-zip" title="Download project as .zip">&#8681; Zip</button>
                    </div>
                    <div class="bc-file-tree__breadcrumb" data-role="breadcrumb"></div>
                    <ul class="bc-file-tree__list" data-role="list"></ul>
                </div>
            `;
            this.listEl = this.mountEl.querySelector('[data-role="list"]');
            this.breadcrumbEl = this.mountEl.querySelector('[data-role="breadcrumb"]');

            this.mountEl.querySelector('[data-action="collapse"]')
                .addEventListener('click', () => this._toggleCollapse());
            this.mountEl.querySelector('[data-action="new-file"]')
                .addEventListener('click', () => this._promptCreate(false));
            this.mountEl.querySelector('[data-action="new-folder"]')
                .addEventListener('click', () => this._promptCreate(true));
            this.mountEl.querySelector('[data-action="refresh"]')
                .addEventListener('click', () => this.refresh(this.currentDir));
            this.mountEl.querySelector('[data-action="download-zip"]')
                .addEventListener('click', () => this._downloadZip());

            // Right-click on empty list space (not on an item) offers Paste,
            // same as a desktop file manager's background context menu.
            this.listEl.addEventListener('contextmenu', (e) => {
                if (e.target !== this.listEl) return;
                e.preventDefault();
                this._showContextMenu(e.clientX, e.clientY, this._pasteOnlyMenuItems(this.currentDir));
            });

            this._applyCollapsedState(); // restore last session's collapsed/expanded state
        }

        /** Shrinks the panel to just the toggle button so the editor can use the space, or restores it. Persisted across reloads. */
        _toggleCollapse() {
            this.collapsed = !this.collapsed;
            localStorage.setItem('bc_files_collapsed', this.collapsed ? '1' : '0');
            this._applyCollapsedState();
        }

        _applyCollapsedState() {
            const treeRoot = this.mountEl.querySelector('.bc-file-tree');
            const layoutEl = this.mountEl.parentElement; // .bc-layout
            const toggleBtn = this.mountEl.querySelector('[data-action="collapse"]');
            if (treeRoot) {
                treeRoot.classList.toggle('bc-file-tree--collapsed', this.collapsed);
            }
            if (layoutEl) {
                layoutEl.style.setProperty('--bc-files-width', this.collapsed ? '36px' : '220px');
            }
            if (toggleBtn) {
                toggleBtn.textContent = this.collapsed ? '⟩' : '⟨';
                toggleBtn.title = this.collapsed ? 'Expand panel' : 'Collapse panel';
            }
        }

        /**
         * @param {string} relativeDir - path relative to the project root.
         *   Becomes the new "current directory" — everything (creation,
         *   the refresh button, breadcrumb) is relative to this afterward.
         */
        async refresh(relativeDir) {
            const dir = relativeDir !== undefined ? relativeDir : this.currentDir;
            try {
                const entries = await this.davClient.list(dir);
                this.currentDir = dir;
                this._renderBreadcrumb();
                this._renderEntries(entries);
                bus.emit(EVENTS.FILE_LIST_LOADED, { entries, dir });
            } catch (err) {
                bus.emit(EVENTS.ERROR, { message: 'Could not load file list', error: err });
            }
        }

        _renderBreadcrumb() {
            const parts = this.currentDir ? this.currentDir.split('/').filter(Boolean) : [];
            this.breadcrumbEl.innerHTML = '';

            const rootCrumb = document.createElement('span');
            rootCrumb.className = 'bc-file-tree__crumb bc-file-tree__crumb--root';
            rootCrumb.textContent = '/';
            rootCrumb.title = 'Back to project root';
            rootCrumb.addEventListener('click', () => this.refresh(''));
            this.breadcrumbEl.appendChild(rootCrumb);

            let pathSoFar = '';
            for (const part of parts) {
                pathSoFar = pathSoFar ? `${pathSoFar}/${part}` : part;
                const sep = document.createElement('span');
                sep.className = 'bc-file-tree__crumb-sep';
                sep.textContent = ' / ';
                this.breadcrumbEl.appendChild(sep);

                const crumb = document.createElement('span');
                crumb.className = 'bc-file-tree__crumb';
                crumb.textContent = part;
                const targetPath = pathSoFar;
                crumb.addEventListener('click', () => this.refresh(targetPath));
                this.breadcrumbEl.appendChild(crumb);
            }
        }

        _renderEntries(entries) {
            this.listEl.innerHTML = '';
            const sorted = [...entries].sort((a, b) => {
                if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
                return a.name.localeCompare(b.name);
            });

            const currentFile = AppState.getCurrentFilePath();

            for (const entry of sorted) {
                const fullPath = joinRelative(this.currentDir, entry.name);
                const isActive = !entry.isDirectory && fullPath === currentFile;

                const li = document.createElement('li');
                li.className = `bc-file-tree__item ${entry.isDirectory ? 'is-folder' : 'is-file'}${isActive ? ' is-active' : ''}`;
                li.textContent = (entry.isDirectory ? '📁 ' : '📄 ') + entry.name;
                li.title = entry.name; // full name on hover — the list itself truncates long names
                li.dataset.path = fullPath;
                li.tabIndex = 0; // keyboard-focusable, so the tree is Tab/Enter-navigable, not click-only

                const activate = () => {
                    if (entry.isDirectory) {
                        this.refresh(fullPath);
                    } else {
                        bus.emit(EVENTS.FILE_OPEN_REQUESTED, { path: fullPath });
                    }
                };
                li.addEventListener('click', activate);
                li.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        activate();
                    }
                });

                li.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    this._showContextMenu(e.clientX, e.clientY, this._itemMenuItems(entry, fullPath));
                });

                this.listEl.appendChild(li);
            }

            if (sorted.length === 0) {
                const empty = document.createElement('li');
                empty.className = 'bc-file-tree__empty';
                empty.textContent = this.currentDir ? 'Empty folder.' : 'Nothing here yet — use + File, + Folder, or ask Boudica to scaffold a project.';
                this.listEl.appendChild(empty);
            }
        }

        /** Keeps the "currently open file" highlight in sync without a full tree reload — cheaper and avoids losing scroll position on every tab switch. */
        _updateActiveHighlight() {
            const currentFile = AppState.getCurrentFilePath();
            for (const li of this.listEl.querySelectorAll('.bc-file-tree__item')) {
                li.classList.toggle('is-active', li.dataset.path === currentFile);
            }
        }

        // ─── Context menu ───────────────────────────────────────────

        _itemMenuItems(entry, fullPath) {
            const items = [
                { label: 'Cut', onClick: () => { this.clipboard = { path: fullPath, isDirectory: entry.isDirectory, mode: 'cut' }; } },
                { label: 'Copy', onClick: () => { this.clipboard = { path: fullPath, isDirectory: entry.isDirectory, mode: 'copy' }; } },
            ];
            if (this.clipboard && this.clipboard.path !== fullPath) {
                // Pasting onto a folder places the item inside it; onto a
                // file (or anywhere else) it lands alongside it, in the
                // current directory — matches most desktop file managers.
                const target = entry.isDirectory ? fullPath : this.currentDir;
                items.push({ label: `Paste "${this._basename(this.clipboard.path)}" here`, onClick: () => this._pasteInto(target) });
            }
            items.push({ separator: true });
            if (!entry.isDirectory) {
                items.push({ label: 'Restore previous version…', onClick: () => BoudicaCode.chatPanel._cmdRestore(fullPath) });
            }
            items.push({ label: 'Download', onClick: () => this._downloadItem(entry, fullPath) });
            items.push({ label: 'Delete', onClick: () => this._promptDelete(fullPath) });
            return items;
        }

        _pasteOnlyMenuItems(targetDir) {
            if (!this.clipboard) {
                return [{ label: 'Nothing to paste', disabled: true }];
            }
            return [{ label: `Paste "${this._basename(this.clipboard.path)}" here`, onClick: () => this._pasteInto(targetDir) }];
        }

        _basename(path) {
            return path.split('/').pop();
        }

        _closeContextMenu() {
            if (this._menuEl) {
                this._menuEl.remove();
                this._menuEl = null;
            }
        }

        _showContextMenu(x, y, items) {
            this._closeContextMenu();

            const menu = document.createElement('ul');
            menu.className = 'bc-context-menu';
            menu.style.left = `${x}px`;
            menu.style.top = `${y}px`;

            for (const item of items) {
                if (item.separator) {
                    const sep = document.createElement('li');
                    sep.className = 'bc-context-menu__sep';
                    menu.appendChild(sep);
                    continue;
                }
                const li = document.createElement('li');
                li.className = `bc-context-menu__item${item.disabled ? ' is-disabled' : ''}`;
                li.textContent = item.label;
                if (!item.disabled) {
                    li.addEventListener('click', () => {
                        this._closeContextMenu();
                        item.onClick();
                    });
                }
                menu.appendChild(li);
            }

            document.body.appendChild(menu);
            this._menuEl = menu;

            // Close on the next click elsewhere, or Escape. Bound on the
            // next tick so the click that opened the menu doesn't also close it.
            const onDocMouseDown = (e) => {
                if (!menu.contains(e.target)) cleanup();
            };
            const onDocKeyDown = (e) => {
                if (e.key === 'Escape') cleanup();
            };
            const cleanup = () => {
                this._closeContextMenu();
                document.removeEventListener('mousedown', onDocMouseDown);
                document.removeEventListener('keydown', onDocKeyDown);
            };
            setTimeout(() => {
                document.addEventListener('mousedown', onDocMouseDown);
                document.addEventListener('keydown', onDocKeyDown);
            }, 0);
        }

        // ─── Item actions ───────────────────────────────────────────

        async _pasteInto(targetDir) {
            if (!this.clipboard) return;
            const { path: srcPath, mode } = this.clipboard;
            const name = this._basename(srcPath);
            const destPath = targetDir ? `${targetDir}/${name}` : name;

            if (destPath === srcPath || destPath.startsWith(`${srcPath}/`)) {
                bus.emit(EVENTS.ERROR, { message: `Can't paste "${name}" into itself.` });
                return;
            }

            try {
                if (mode === 'copy') {
                    await this.davClient.copy(srcPath, destPath);
                } else {
                    await this.davClient.move(srcPath, destPath);
                    this.clipboard = null; // cut is one-shot, same as a desktop file manager
                }
                await this.refresh(this.currentDir);
            } catch (err) {
                bus.emit(EVENTS.ERROR, { message: `Could not paste ${name}`, error: err });
            }
        }

        _downloadItem(entry, fullPath) {
            if (entry.isDirectory) {
                this._downloadZip(fullPath);
                return;
            }
            const link = document.createElement('a');
            link.href = this.davClient.fileUrl(fullPath);
            link.download = entry.name;
            document.body.appendChild(link);
            link.click();
            link.remove();
        }

        /** @param {string} [subPath] - project-relative subfolder to zip; omit to download the whole current project. */
        _downloadZip(subPath) {
            const projectRoot = AppState.getProjectRoot() || '';
            const targetPath = subPath ? (projectRoot ? `${projectRoot}/${subPath}` : subPath) : projectRoot;
            const base = (global.OC && OC.generateUrl)
                ? OC.generateUrl('/apps/boudicacode/download-zip')
                : '/apps/boudicacode/download-zip';
            const url = `${base}?path=${encodeURIComponent(targetPath)}`;

            // A real navigation (not fetch) so the browser's native
            // download handling takes over — no need to touch the
            // response bytes on the client side at all.
            const link = document.createElement('a');
            link.href = url;
            link.download = '';
            document.body.appendChild(link);
            link.click();
            link.remove();
        }

        async _promptCreate(isFolder) {
            const label = isFolder ? 'New folder name' : 'New file name (e.g. main.py)';
            const name = global.prompt(label);
            if (!name) return;

            const fullPath = joinRelative(this.currentDir, name);

            try {
                if (isFolder) {
                    await this.davClient.makeDirectory(fullPath);
                } else {
                    await this.davClient.writeFile(fullPath, '');
                }
                bus.emit(EVENTS.FILE_CREATED, { path: fullPath, isDirectory: isFolder });
                await this.refresh(this.currentDir);
            } catch (err) {
                bus.emit(EVENTS.ERROR, { message: `Could not create ${fullPath}`, error: err });
            }
        }

        async _promptDelete(fullPath) {
            if (!global.confirm(`Delete ${fullPath}?`)) return;
            try {
                await this.davClient.delete(fullPath);
                bus.emit(EVENTS.FILE_DELETED, { path: fullPath });
                await this.refresh(this.currentDir);
            } catch (err) {
                bus.emit(EVENTS.ERROR, { message: `Could not delete ${fullPath}`, error: err });
            }
        }

        async _onProjectSelected() {
            this.currentDir = '';
            await this.refresh('');
        }

        async _onCommandExecuted(event) {
            const { command } = event.detail || {};
            // 'new'/'create'/'edit' are the AI agent's project/file commands
            // (see chatPanel.js + projectCreator.js) — they write directly
            // to storage, so the tree needs a refresh same as the
            // pre-existing local file operations.
            if (['create-file', 'create-folder', 'delete-file', 'new', 'create', 'edit'].includes(command)) {
                await this.refresh(this.currentDir);
            }
        }
    }

    BoudicaCode.FileTree = FileTree;
})(window);
