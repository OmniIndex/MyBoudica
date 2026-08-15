/**
 * newProjectDialog.js
 *
 * A small modal for creating a new project: name, stack dropdown, and
 * an optional destination folder picked via Nextcloud's own file
 * picker (OC.dialogs.filepicker) rather than a hand-rolled tree —
 * defaults to the top level of storage if that API isn't available or
 * the person doesn't choose one. Delegates the actual scaffolding to
 * projectCreator.js (the same code chatPanel.js's "/new" command
 * uses), then switches the workspace into the new project.
 *
 * Classic script — depends on ProjectScaffolder (for the stack list)
 * and ProjectCreator; load after both, before editorPanel.js (which
 * opens this from its toolbar).
 */
(function (global) {
    'use strict';

    const BoudicaCode = global.BoudicaCode || (global.BoudicaCode = {});
    const { bus, EVENTS, AppState, ProjectScaffolder, ProjectCreator } = BoudicaCode;

    const STACK_LABELS = {
        cpp: 'C++',
        python: 'Python',
        nodejs: 'Node.js',
        typescript: 'TypeScript',
        java: 'Java',
        bash: 'Bash',
        batch: 'Windows Batch',
    };

    class NewProjectDialog {
        constructor() {
            this.destination = ''; // '' = top level of storage
            this.el = null;
        }

        open() {
            if (this.el) return; // already open
            this.destination = '';
            this._render();
        }

        _close() {
            if (this.el) {
                this.el.remove();
                this.el = null;
            }
        }

        _render() {
            const overlay = document.createElement('div');
            overlay.className = 'bc-modal-overlay';
            overlay.innerHTML = `
                <div class="bc-modal" role="dialog" aria-label="New project">
                    <h2>New project</h2>
                    <label class="bc-modal__field">
                        <span>Name</span>
                        <input type="text" data-role="name" placeholder="my-app" autofocus />
                    </label>
                    <label class="bc-modal__field">
                        <span>Stack</span>
                        <select data-role="stack">
                            ${ProjectScaffolder.SUPPORTED_STACKS.map(
                                (s) => `<option value="${s}">${STACK_LABELS[s] || s}</option>`
                            ).join('')}
                        </select>
                    </label>
                    <div class="bc-modal__field">
                        <span>Location</span>
                        <div class="bc-modal__location">
                            <span data-role="destination-label">/ (top level)</span>
                            <button type="button" data-action="choose-folder">Choose folder…</button>
                        </div>
                    </div>
                    <p class="bc-modal__error" data-role="error" hidden></p>
                    <div class="bc-modal__actions">
                        <button type="button" data-action="cancel">Cancel</button>
                        <button type="button" data-action="create" class="is-primary">Create</button>
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);
            this.el = overlay;

            this.nameEl = overlay.querySelector('[data-role="name"]');
            this.stackEl = overlay.querySelector('[data-role="stack"]');
            this.destLabelEl = overlay.querySelector('[data-role="destination-label"]');
            this.errorEl = overlay.querySelector('[data-role="error"]');

            overlay.querySelector('[data-action="cancel"]').addEventListener('click', () => this._close());
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) this._close(); // click outside the card
            });
            overlay.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') this._close();
            });
            overlay.querySelector('[data-action="choose-folder"]').addEventListener('click', () => this._chooseFolder());
            overlay.querySelector('[data-action="create"]').addEventListener('click', () => this._submit());
            this.nameEl.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') this._submit();
            });

            this.nameEl.focus();
        }

        /** Uses Nextcloud's own folder picker when present so this doesn't need a hand-rolled tree browser. */
        _chooseFolder() {
            if (!(global.OC && OC.dialogs && OC.dialogs.filepicker)) {
                this._showError('Folder picker unavailable in this Nextcloud version — creating at the top level.');
                return;
            }
            OC.dialogs.filepicker(
                'Choose a location for the new project',
                (path) => {
                    this.destination = (path || '').replace(/^\/+/, '');
                    this.destLabelEl.textContent = this.destination ? `/${this.destination}` : '/ (top level)';
                },
                false, // multiselect
                undefined, // mimeTypeFilter — folders only, no filter needed
                true, // modal
                OC.dialogs.FILEPICKER_TYPE_CHOOSE
            );
        }

        _showError(message) {
            this.errorEl.textContent = message;
            this.errorEl.hidden = false;
        }

        async _submit() {
            const name = this.nameEl.value.trim();
            const stack = this.stackEl.value;
            if (!name) {
                this._showError('Enter a project name.');
                return;
            }

            const createBtn = this.el.querySelector('[data-action="create"]');
            createBtn.disabled = true;
            createBtn.textContent = 'Creating…';
            this.errorEl.hidden = true;

            try {
                const { projectRoot } = await ProjectCreator.createProject(this.destination, name, stack);
                AppState.setProjectRoot(projectRoot);
                bus.emit(EVENTS.CHAT_COMMAND_EXECUTED, { command: 'new', result: { projectRoot } });
                this._close();
            } catch (err) {
                this._showError(err.message);
                createBtn.disabled = false;
                createBtn.textContent = 'Create';
            }
        }
    }

    BoudicaCode.NewProjectDialog = new NewProjectDialog();
})(window);
