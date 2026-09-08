/**
 * projectSwitcher.js
 *
 * A slim bar above the whole workspace showing the current project and,
 * on click, a dropdown of every other Boudica Code project in this
 * Nextcloud account — so switching projects doesn't mean manually
 * navigating the file tree back out to the top level and hoping you
 * recognize the right folder. Addresses the gap where the file tree
 * was being used as a de facto (but undiscoverable) project switcher.
 *
 * Classic script — depends on WebDavClient, AppState; load after both,
 * before main.js (which instantiates it).
 */
(function (global) {
    'use strict';

    const BoudicaCode = global.BoudicaCode || (global.BoudicaCode = {});
    const { bus, EVENTS, AppState, WebDavClient } = BoudicaCode;

    class ProjectSwitcher {
        constructor(mountEl) {
            this.mountEl = mountEl;
            this.projects = []; // [{ path, name, stack }]
            this.open = false;

            this._onDocClick = this._onDocClick.bind(this);
            this._onProjectSelected = this._onProjectSelected.bind(this);
            bus.on(EVENTS.PROJECT_SELECTED, this._onProjectSelected);
            // A freshly-created project won't be in the enumerated list yet
            // until the next refresh — re-scan whenever one's created.
            bus.on(EVENTS.CHAT_COMMAND_EXECUTED, (e) => {
                if (e.detail?.command === 'new') this.refresh();
            });
        }

        async init() {
            this._renderShell();
            await this.refresh();
        }

        _renderShell() {
            this.mountEl.innerHTML = `
                <button class="bc-projectbar__current" data-role="current" aria-haspopup="true" aria-expanded="false">
                    <span data-role="label">Loading projects…</span>
                    <span class="bc-projectbar__chevron">▾</span>
                </button>
                <ul class="bc-projectbar__dropdown" data-role="dropdown" hidden></ul>
            `;
            this.currentBtn = this.mountEl.querySelector('[data-role="current"]');
            this.labelEl = this.mountEl.querySelector('[data-role="label"]');
            this.dropdownEl = this.mountEl.querySelector('[data-role="dropdown"]');

            this.currentBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._toggle();
            });
            document.addEventListener('click', this._onDocClick);
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && this.open) this._toggle(false);
            });
        }

        _onDocClick(e) {
            if (this.open && !this.mountEl.contains(e.target)) this._toggle(false);
        }

        _toggle(force) {
            this.open = force !== undefined ? force : !this.open;
            this.dropdownEl.hidden = !this.open;
            this.currentBtn.setAttribute('aria-expanded', String(this.open));
        }

        _onProjectSelected() {
            this._updateLabel();
        }

        _updateLabel() {
            const root = AppState.getProjectRoot();
            if (!root) {
                this.labelEl.textContent = 'No project open';
                return;
            }
            const match = this.projects.find((p) => p.path === root);
            this.labelEl.textContent = match ? `${match.name} (${match.stack})` : root.split('/').pop();
        }

        /**
         * Scans the top level of the user's Nextcloud storage for folders
         * containing .boudica_project.json. One list() call plus one
         * exists() check per top-level entry — fine for the small number
         * of projects a single user is likely to have; would need a
         * cheaper approach (e.g. an index file) if that stops being true.
         */
        async refresh() {
            const homeClient = new WebDavClient('');
            let entries;
            try {
                entries = await homeClient.list('');
            } catch (err) {
                this.labelEl.textContent = 'Couldn\'t list projects';
                bus.emit(EVENTS.ERROR, { message: 'Project switcher: could not list storage', error: err });
                return;
            }

            const folders = entries.filter((e) => e.isDirectory);
            const checked = await Promise.all(
                folders.map(async (folder) => {
                    const projectClient = new WebDavClient(folder.name);
                    try {
                        const raw = await projectClient.readFile('.boudica_project.json');
                        const config = JSON.parse(raw);
                        return { path: folder.name, name: config.name || folder.name, stack: config.stack || '?' };
                    } catch (err) {
                        return null; // not a Boudica Code project — skip silently, this is expected for most folders
                    }
                })
            );

            this.projects = checked.filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
            this._renderDropdown();
            this._updateLabel();
        }

        _renderDropdown() {
            this.dropdownEl.innerHTML = '';

            // Always present, regardless of whether any projects exist —
            // this is the escape hatch that was missing entirely: once a
            // project was selected (and persisted across reloads via
            // localStorage), there was no way back to the raw home
            // directory, especially once a project's own
            // .boudica_project.json got deleted and it stopped being
            // "recognized" at all.
            const homeItem = document.createElement('li');
            homeItem.className = 'bc-projectbar__item bc-projectbar__item--home';
            homeItem.tabIndex = 0;
            if (!AppState.getProjectRoot()) {
                homeItem.classList.add('is-current');
            }
            homeItem.innerHTML = `<span class="bc-projectbar__item-name">🏠 Home (no project)</span>`;
            const selectHome = () => {
                // AppState.setProjectRoot() confirms first if there are
                // unsaved changes and returns false if declined — leave the
                // dropdown open in that case rather than closing it on a
                // switch that didn't actually happen.
                if (!AppState.getProjectRoot()) {
                    this._toggle(false);
                    return;
                }
                if (AppState.setProjectRoot('')) {
                    this._toggle(false);
                }
            };
            homeItem.addEventListener('click', selectHome);
            homeItem.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    selectHome();
                }
            });
            this.dropdownEl.appendChild(homeItem);

            if (this.projects.length === 0) {
                const li = document.createElement('li');
                li.className = 'bc-projectbar__empty';
                li.textContent = 'No projects yet — use "+ New Project" or /new to create one.';
                this.dropdownEl.appendChild(li);
                return;
            }

            const sep = document.createElement('li');
            sep.className = 'bc-projectbar__sep';
            this.dropdownEl.appendChild(sep);

            for (const project of this.projects) {
                const li = document.createElement('li');
                li.className = 'bc-projectbar__item';
                li.tabIndex = 0;
                if (project.path === AppState.getProjectRoot()) {
                    li.classList.add('is-current');
                }
                li.innerHTML = `<span class="bc-projectbar__item-name">${escapeHtml(project.name)}</span>` +
                    `<span class="bc-projectbar__item-stack">${escapeHtml(project.stack)}</span>` +
                    `<span class="bc-projectbar__item-actions">` +
                        `<button type="button" data-action="rename" title="Rename project">&#9998;</button>` +
                        `<button type="button" data-action="delete" title="Delete project">&#128465;</button>` +
                    `</span>`;

                const select = () => {
                    // See selectHome()'s comment — same deal here.
                    if (project.path === AppState.getProjectRoot()) {
                        this._toggle(false);
                        return;
                    }
                    if (AppState.setProjectRoot(project.path)) {
                        this._toggle(false);
                    }
                };
                li.addEventListener('click', select);
                li.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        select();
                    }
                });

                // stopPropagation so these don't also trigger select() above.
                li.querySelector('[data-action="rename"]').addEventListener('click', (e) => {
                    e.stopPropagation();
                    this._toggle(false);
                    this._renameProject(project);
                });
                li.querySelector('[data-action="delete"]').addEventListener('click', (e) => {
                    e.stopPropagation();
                    this._toggle(false);
                    this._deleteProject(project);
                });

                this.dropdownEl.appendChild(li);
            }
        }

        /**
         * Renames the project's actual top-level folder (this switcher only
         * ever discovers projects at the top level of storage — see
         * refresh()'s docblock) via WebDAV MOVE. If this is the currently
         * active project, AppState.renameProjectRoot() follows the rename
         * live — open tabs stay open, nothing is discarded, since their
         * paths are relative to the root and didn't change.
         */
        async _renameProject(project) {
            const newName = global.prompt(`Rename project "${project.name}" (folder: ${project.path}) to:`, project.path);
            if (!newName || newName === project.path) return;
            if (newName.includes('/')) {
                bus.emit(EVENTS.ERROR, { message: 'Project names can\'t contain "/".' });
                return;
            }

            const homeClient = new WebDavClient('');
            try {
                await homeClient.move(project.path, newName);
                AppState.renameProjectRoot(project.path, newName);
                await this.refresh();
            } catch (err) {
                bus.emit(EVENTS.ERROR, { message: `Could not rename project "${project.name}"`, error: err });
            }
        }

        /**
         * Deletes the project's folder outright — WebDAV DELETE on the
         * whole subtree, same as any other file-tree delete, just scoped
         * to a project root instead of one file. If the deleted project
         * was the currently active one, switches back to Home; that
         * itself goes through AppState.setProjectRoot()'s own unsaved-
         * changes confirm, which can decline the switch (a second,
         * separate confirm from the delete confirm below) — the project
         * is deleted on disk either way at that point, so declining just
         * leaves the workspace pointed at a now-nonexistent root until
         * the person picks somewhere else from this same dropdown.
         */
        async _deleteProject(project) {
            if (!global.confirm(`Delete project "${project.name}" and everything in it? This cannot be undone.`)) {
                return;
            }
            const homeClient = new WebDavClient('');
            try {
                await homeClient.delete(project.path);
                if (AppState.getProjectRoot() === project.path) {
                    AppState.setProjectRoot('');
                }
                await this.refresh();
            } catch (err) {
                bus.emit(EVENTS.ERROR, { message: `Could not delete project "${project.name}"`, error: err });
            }
        }
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    BoudicaCode.ProjectSwitcher = ProjectSwitcher;
})(window);
