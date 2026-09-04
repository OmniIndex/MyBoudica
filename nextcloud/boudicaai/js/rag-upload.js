// rag-upload.js — Boudica RAG Document Upload UI
// Handles file upload, directory listing, and deletion within the user's
// domain-isolated corpus folder (/mnt/boudica/corpus/<domain>/public/).
//
// Depends on:
//   - saml-auth.js  → getCurrentUserId()
//   - CGI endpoint  → /cgi-bin/rag_upload

'use strict';

(function () {

    // -----------------------------------------------------------------------
    // Config
    // -----------------------------------------------------------------------
    const UPLOAD_ENDPOINT = 'https://boudi.ca/cgi-bin/rag_upload';
    const MAX_FILE_MB      = 100;

    // -----------------------------------------------------------------------
    // State
    // -----------------------------------------------------------------------
    let currentPath = '';          // relative path inside public/ currently viewed

    // -----------------------------------------------------------------------
    // DOM helpers (always query lazily so we don't break if panel not present)
    // -----------------------------------------------------------------------
    function el(id)   { return document.getElementById(id); }
    function qs(sel)  { return document.querySelector(sel); }

    // -----------------------------------------------------------------------
    // Public API
    // -----------------------------------------------------------------------

    /** Open the Knowledge Base overlay. */
    function openKbOverlay() {
        const overlay = document.getElementById('knowledgeBaseOverlay');
        if (!overlay) return;
        overlay.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
        currentPath = '';
        loadDirectory('');
    }

    /** Close the Knowledge Base overlay. */
    function closeKbOverlay() {
        const overlay = document.getElementById('knowledgeBaseOverlay');
        if (!overlay) return;
        overlay.classList.add('hidden');
        document.body.style.overflow = '';
    }

    /** Legacy alias kept so any external callers still work. */
    function toggleRagPanel() {
        const overlay = document.getElementById('knowledgeBaseOverlay');
        if (!overlay) return;
        if (overlay.classList.contains('hidden')) {
            openKbOverlay();
        } else {
            closeKbOverlay();
        }
    }

    /** Navigate into a sub-directory within the corpus. */
    function navigateTo(rel) {
        currentPath = rel;
        loadDirectory(rel);
    }

    // -----------------------------------------------------------------------
    // API calls
    // -----------------------------------------------------------------------

    function getUserId() {
        // BoudicaAPI.getCurrentUserId() reads from localStorage('boudica_session')
        if (typeof BoudicaAPI !== 'undefined' && typeof BoudicaAPI.getCurrentUserId === 'function') {
            return BoudicaAPI.getCurrentUserId();
        }
        // Fallback: read directly from session storage
        try {
            const sessionData = localStorage.getItem('boudica_session');
            if (sessionData) {
                const session = JSON.parse(sessionData);
                return session.user?.email || session.user?.username || session.user?.id || '';
            }
        } catch (e) {}
        return '';
    }

    function loadDirectory(rel) {
        const userId = getUserId();
        if (!userId || userId === 'anonymous') {
            showStatus('Not authenticated — cannot load corpus.', 'error');
            return;
        }
        setLoading(true);
        const url = UPLOAD_ENDPOINT + '?user_id=' + encodeURIComponent(userId)
                  + '&path=' + encodeURIComponent(rel);
        fetch(url, { credentials: 'same-origin' })
            .then(r => r.json())
            .then(data => {
                setLoading(false);
                if (!data.success) {
                    showStatus(data.error || 'Failed to load files.', 'error');
                } else {
                    renderFileTree(data.entries || [], data.path || '');
                    renderBreadcrumb(data.path || '', data.domain || '');
                }
            })
            .catch(err => {
                setLoading(false);
                showStatus('Network error: ' + err.message, 'error');
            });
    }

    function uploadFiles(files, relPath) {
        const userId = getUserId();
        if (!userId || userId === 'anonymous') {
            showStatus('Not authenticated.', 'error');
            return;
        }

        // Build a FormData with user_id + each file
        // For folder uploads (webkitRelativePath), we derive the relative path from
        // the file's path minus its own filename.
        const form = new FormData();
        form.append('user_id', userId);

        let oversized = 0;
        let added     = 0;
        for (const file of files) {
            if (file.size > MAX_FILE_MB * 1024 * 1024) { oversized++; continue; }

            // If the browser supplied a relative path (folder upload), use it.
            // Otherwise use the subfolder the user typed.
            let fileRel = relPath || '';
            if (file.webkitRelativePath) {
                // webkitRelativePath = "folder/sub/file.txt" — strip the filename part
                const parts = file.webkitRelativePath.split('/');
                parts.pop(); // remove filename
                const parentRel = parts.join('/');
                fileRel = relPath
                    ? (relPath.replace(/\/$/, '') + '/' + parentRel).replace(/^\//, '')
                    : parentRel;
            }

            // Append file with a custom header for the relative path.
            // We cannot set custom headers per-file in FormData, so we embed
            // rel path as a hidden field keyed by index.
            form.append('file', file, file.name);
            form.append('rel_' + added, fileRel);
            added++;
        }

        if (added === 0) {
            if (oversized > 0) {
                showStatus(`${oversized} file(s) skipped — exceeds ${MAX_FILE_MB} MB limit.`, 'warn');
            } else {
                showStatus('No files selected.', 'warn');
            }
            return;
        }

        showStatus(`Uploading ${added} file(s)…`, 'info');
        setLoading(true);

        // We need to pass per-file relative paths alongside each file.
        // The CGI reads multipart parts in order, so we upload files one by
        // one in a sequential loop for simplicity and reliable path association.
        uploadSequential(files, relPath, oversized);
    }

    // -----------------------------------------------------------------------
    // Drag-and-drop: recursive directory traversal via FileSystem API
    // -----------------------------------------------------------------------

    /**
     * Recursively collect {file, relDir} pairs from a FileSystemEntry.
     * relDir is the directory portion to send as rel_path to the CGI.
     */
    function traverseEntry(entry, relDir) {
        if (entry.isFile) {
            return new Promise(resolve => {
                entry.file(
                    file => resolve([{ file, relDir }]),
                    ()   => resolve([])   // unreadable — skip
                );
            });
        }
        if (entry.isDirectory) {
            // Accumulate this directory's name into the relative path
            const childRelDir = relDir
                ? relDir.replace(/\/$/, '') + '/' + entry.name
                : entry.name;
            return new Promise(resolve => {
                const reader = entry.createReader();
                const allEntries = [];
                // Chrome returns at most 100 entries per readEntries call — loop.
                function readBatch() {
                    reader.readEntries(
                        batch => {
                            if (batch.length === 0) {
                                Promise.all(allEntries.map(e => traverseEntry(e, childRelDir)))
                                    .then(arrays => resolve([].concat(...arrays)));
                            } else {
                                allEntries.push(...batch);
                                readBatch();
                            }
                        },
                        () => resolve([])  // unreadable dir — skip
                    );
                }
                readBatch();
            });
        }
        return Promise.resolve([]);
    }

    /**
     * Collect all {file, relDir} pairs from a DataTransferItemList.
     * Falls back to the plain File object if the FileSystem API is unavailable.
     */
    function collectDroppedEntries(items, baseRelPath) {
        const promises = [];
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item.webkitGetAsEntry) {
                const entry = item.webkitGetAsEntry();
                if (entry) {
                    promises.push(traverseEntry(entry, baseRelPath || ''));
                    continue;
                }
            }
            // Fallback: plain file, no structural info
            const file = item.getAsFile && item.getAsFile();
            if (file) promises.push(Promise.resolve([{ file, relDir: baseRelPath || '' }]));
        }
        return Promise.all(promises).then(arrays => [].concat(...arrays));
    }

    /**
     * Upload an array of {file, relDir} pairs sequentially.
     * relDir is sent as rel_path — the CGI creates the subdirectory on the server.
     */
    function uploadFileEntries(fileEntries, oversized) {
        const userId = getUserId();
        if (!userId || userId === 'anonymous') {
            showStatus('Not authenticated.', 'error');
            return;
        }
        const maxBytes = MAX_FILE_MB * 1024 * 1024;
        const valid    = fileEntries.filter(e => e.file.size <= maxBytes);
        const skipped  = (oversized || 0) + (fileEntries.length - valid.length);

        if (valid.length === 0) {
            showStatus(skipped > 0
                ? `${skipped} file(s) skipped — exceeds ${MAX_FILE_MB} MB limit.`
                : 'No files found in drop.', 'warn');
            return;
        }

        let uploaded = 0, errors = 0, idx = 0;
        showStatus(`Uploading ${valid.length} file(s)\u2026`, 'info');
        setLoading(true);

        function next() {
            if (idx >= valid.length) {
                setLoading(false);
                let msg = `Uploaded ${uploaded} file(s).`;
                if (errors  > 0) msg += ` ${errors} error(s).`;
                if (skipped > 0) msg += ` ${skipped} skipped (too large).`;
                showStatus(msg, errors > 0 ? 'warn' : 'success');
                loadDirectory(currentPath);
                return;
            }
            const { file, relDir } = valid[idx++];
            const form = new FormData();
            form.append('user_id', userId);
            if (relDir) form.append('rel_path', relDir);
            form.append('file', file, file.name);

            fetch(UPLOAD_ENDPOINT, { method: 'POST', credentials: 'same-origin', body: form })
                .then(r  => r.json())
                .then(data => {
                    if (data.success && data.saved > 0) uploaded += data.saved;
                    else errors++;
                    next();
                })
                .catch(() => { errors++; next(); });
        }
        next();
    }

    function uploadSequential(files, relPath, oversized) {
        const userId = getUserId();
        const validFiles = Array.from(files).filter(f => f.size <= MAX_FILE_MB * 1024 * 1024);

        let uploaded = 0;
        let errors   = 0;
        let idx      = 0;

        function next() {
            if (idx >= validFiles.length) {
                setLoading(false);
                let msg = `Uploaded ${uploaded} file(s).`;
                if (errors  > 0) msg += ` ${errors} error(s).`;
                if (oversized > 0) msg += ` ${oversized} skipped (too large).`;
                showStatus(msg, errors > 0 ? 'warn' : 'success');
                loadDirectory(currentPath);
                return;
            }
            const file = validFiles[idx++];

            let fileRel = relPath || '';
            if (file.webkitRelativePath) {
                const parts = file.webkitRelativePath.split('/');
                parts.pop();
                const parentRel = parts.join('/');
                fileRel = relPath
                    ? (relPath.replace(/\/$/, '') + '/' + parentRel).replace(/^\//, '')
                    : parentRel;
            }

            const form = new FormData();
            form.append('user_id', userId);
            if (fileRel) form.append('rel_path', fileRel);
            form.append('file', file, file.name);

            // We need the CGI to read rel_path from the fields map, so send it
            // as the first part. The CGI parse_multipart reads all non-file parts
            // into fields[], then processes file parts using fields["rel_path"].
            // (For multi-file in one request, we use sequential requests instead.)

            fetch(UPLOAD_ENDPOINT, {
                method: 'POST',
                credentials: 'same-origin',
                body: form
            })
            .then(r => r.json())
            .then(data => {
                if (data.success && data.saved > 0) uploaded += data.saved;
                else errors++;
                next();
            })
            .catch(() => { errors++; next(); });
        }

        next();
    }

    function deleteFile(relFilePath) {
        const userId = getUserId();
        if (!userId) return;
        if (!confirm(`Delete "${relFilePath}"?`)) return;

        const form = new FormData();
        form.append('user_id',   userId);
        form.append('action',    'delete');
        form.append('file_path', relFilePath);

        setLoading(true);
        fetch(UPLOAD_ENDPOINT, { method: 'POST', credentials: 'same-origin', body: form })
            .then(r => r.json())
            .then(data => {
                setLoading(false);
                if (data.success) {
                    showStatus('Deleted.', 'success');
                    loadDirectory(currentPath);
                } else {
                    showStatus(data.error || 'Delete failed.', 'error');
                }
            })
            .catch(err => {
                setLoading(false);
                showStatus('Network error: ' + err.message, 'error');
            });
    }

    // -----------------------------------------------------------------------
    // Rendering
    // -----------------------------------------------------------------------

    function renderBreadcrumb(path, domain) {
        const bc = el('ragBreadcrumb');
        if (!bc) return;
        bc.innerHTML = '';

        const root = document.createElement('span');
        root.className = 'rag-bc-segment rag-bc-link';
        root.textContent = domain || 'corpus';
        root.title = '/mnt/boudica/corpus/' + (domain || '') + '/public';
        root.addEventListener('click', () => navigateTo(''));
        bc.appendChild(root);

        if (path) {
            const parts = path.split('/');
            let cumPath = '';
            for (const part of parts) {
                if (!part) continue;
                const sep = document.createElement('span');
                sep.className = 'rag-bc-sep';
                sep.textContent = ' / ';
                bc.appendChild(sep);

                cumPath = cumPath ? cumPath + '/' + part : part;
                const seg = document.createElement('span');
                seg.className = 'rag-bc-segment rag-bc-link';
                seg.textContent = part;
                const capPath = cumPath; // closure
                seg.addEventListener('click', () => navigateTo(capPath));
                bc.appendChild(seg);
            }
        }
    }

    // Insert a RAG reference token into the main chat input and close the KB overlay.
    function insertRagRef(filename) {
        const input = document.getElementById('chatInput');
        if (!input) return;
        const token = `Use RAG with details from the file ${filename}`;
        const cur   = input.value.trimEnd();
        input.value = cur ? cur + '\n' + token : token;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        closeKbOverlay();
        input.focus();
    }

    function renderFileTree(entries, path) {
        const tree = el('ragFileTree');
        if (!tree) return;
        tree.innerHTML = '';

        if (entries.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'rag-empty';
            empty.textContent = 'No files yet. Upload some documents to get started.';
            tree.appendChild(empty);
            return;
        }

        // Directories first, then files
        const dirs  = entries.filter(e => e.type === 'dir').sort((a,b) => a.name.localeCompare(b.name));
        const files = entries.filter(e => e.type === 'file').sort((a,b) => a.name.localeCompare(b.name));

        for (const entry of [...dirs, ...files]) {
            const row = document.createElement('div');
            row.className = 'rag-entry' + (entry.type === 'dir' ? ' rag-dir' : ' rag-file');

            const icon = document.createElement('span');
            icon.className = 'rag-entry-icon';
            icon.textContent = entry.type === 'dir' ? '📁' : fileIcon(entry.name);

            const name = document.createElement('span');
            name.className = 'rag-entry-name';
            name.textContent = entry.name;
            if (entry.type === 'dir') {
                const navPath = path ? (path + '/' + entry.name) : entry.name;
                name.classList.add('rag-entry-link');
                name.addEventListener('click', () => navigateTo(navPath));
            }

            const meta = document.createElement('span');
            meta.className = 'rag-entry-meta';
            meta.textContent = entry.type === 'file' ? formatSize(entry.size) : '';

            const relFull = path ? (path + '/' + entry.name) : entry.name;

            // Insert-into-chat button (files only)
            const ins = document.createElement('button');
            ins.className = 'btn btn-icon-sm rag-insert-btn';
            if (entry.type === 'file') {
                ins.title = 'Insert RAG reference into chat prompt';
                ins.innerHTML = '<svg width="12" height="12" viewBox="0 0 20 20" fill="none"><path d="M10 3v14M3 10h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
                ins.addEventListener('click', () => insertRagRef(relFull));
            } else {
                ins.style.visibility = 'hidden';
                ins.disabled = true;
                ins.innerHTML = '<svg width="12" height="12" viewBox="0 0 20 20"></svg>';
            }

            const del = document.createElement('button');
            del.className = 'btn btn-icon-sm rag-delete-btn';
            del.title = entry.type === 'dir' ? 'Cannot delete folders from here' : 'Delete file';
            del.innerHTML = '<svg width="12" height="12" viewBox="0 0 20 20" fill="none"><path d="M6 6l8 8M14 6l-8 8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
            if (entry.type === 'dir') {
                del.disabled = true;
            } else {
                del.addEventListener('click', () => deleteFile(relFull));
            }

            // Make file rows draggable into the chat input
            if (entry.type === 'file') {
                row.draggable = true;
                row.addEventListener('dragstart', (e) => {
                    e.dataTransfer.effectAllowed = 'copy';
                    e.dataTransfer.setData('application/x-boudica-rag', relFull);
                    e.dataTransfer.setData('text/plain',
                        `Use RAG with details from the file ${relFull}`);
                    row.classList.add('rag-dragging');
                    // Defer DOM change — mutating layout inside dragstart cancels the drag in Chromium
                    setTimeout(() => {
                        const dz = document.getElementById('ragChatDropZone');
                        if (dz) dz.classList.add('visible');
                    }, 0);
                });
                row.addEventListener('dragend', () => {
                    row.classList.remove('rag-dragging');
                    const dz = document.getElementById('ragChatDropZone');
                    if (dz) dz.classList.remove('visible', 'active');
                });
            }

            row.append(icon, name, meta, ins, del);
            tree.appendChild(row);
        }
    }

    function fileIcon(name) {
        const ext = name.split('.').pop().toLowerCase();
        const map = {
            pdf: '📄', txt: '📝', md: '📝', csv: '📊', json: '📋',
            xml: '📋', html: '🌐', htm: '🌐', doc: '📘', docx: '📘',
            xls: '📗', xlsx: '📗', ppt: '📙', pptx: '📙',
            jpg: '🖼', jpeg: '🖼', png: '🖼', gif: '🖼', svg: '🖼',
            zip: '🗜', tar: '🗜', gz: '🗜',
            py: '🐍', js: '⚙️', cpp: '⚙️', c: '⚙️', h: '⚙️',
        };
        return map[ext] || '📄';
    }

    function formatSize(bytes) {
        if (bytes < 1024)             return bytes + ' B';
        if (bytes < 1024 * 1024)      return (bytes / 1024).toFixed(1) + ' KB';
        if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
        return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
    }

    // -----------------------------------------------------------------------
    // Status display
    // -----------------------------------------------------------------------

    function showStatus(msg, type) {
        const s = el('ragStatusMsg');
        if (!s) return;
        s.textContent = msg;
        s.className = 'rag-status rag-status-' + (type || 'info');
        s.classList.remove('hidden');
        clearTimeout(s._timer);
        if (type === 'success' || type === 'info') {
            s._timer = setTimeout(() => s.classList.add('hidden'), 5000);
        }
    }

    function setLoading(on) {
        const spinner = el('ragSpinner');
        if (spinner) spinner.classList.toggle('hidden', !on);
    }

    // -----------------------------------------------------------------------
    // Event wiring (called after DOM ready)
    // -----------------------------------------------------------------------

    function init() {
        // Header button opens the overlay
        const kbBtn = el('knowledgeBaseBtn');
        if (kbBtn) kbBtn.addEventListener('click', openKbOverlay);

        // Close button inside overlay
        const closeBtn = el('kbCloseBtn');
        if (closeBtn) closeBtn.addEventListener('click', closeKbOverlay);

        // Backdrop click closes overlay
        const overlay = el('knowledgeBaseOverlay');
        if (overlay) {
            const backdrop = overlay.querySelector('.services-overlay-backdrop');
            if (backdrop) backdrop.addEventListener('click', closeKbOverlay);
        }

        // Escape key closes overlay
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const ov = el('knowledgeBaseOverlay');
                if (ov && !ov.classList.contains('hidden')) closeKbOverlay();
            }
        });

        // Drag-and-drop zone
        const dropZone = el('ragDropZone');
        if (dropZone) {
            dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
            dropZone.addEventListener('dragleave', ()  => dropZone.classList.remove('drag-over'));
            dropZone.addEventListener('drop', e => {
                e.preventDefault();
                dropZone.classList.remove('drag-over');
                const subfolder = (el('ragSubfolder') || {}).value || '';
                const items = e.dataTransfer && e.dataTransfer.items;
                if (items && items.length > 0) {
                    // Use FileSystem API to recursively traverse dropped directories,
                    // preserving the full folder structure as rel_path on the server.
                    collectDroppedEntries(items, subfolder)
                        .then(fileEntries => {
                            if (fileEntries.length > 0) {
                                uploadFileEntries(fileEntries, 0);
                            } else {
                                showStatus('No supported files found in drop.', 'warn');
                            }
                        });
                } else if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                    // Fallback for browsers without DataTransferItemList
                    uploadFiles(e.dataTransfer.files, subfolder);
                }
            });
        }

        // File picker button (single files or multiple)
        const filePicker = el('ragFilePicker');
        if (filePicker) {
            filePicker.addEventListener('change', () => {
                const subfolder = (el('ragSubfolder') || {}).value || '';
                if (filePicker.files.length > 0) uploadFiles(filePicker.files, subfolder);
                filePicker.value = ''; // reset so same file can be re-selected
            });
        }

        // Folder picker button (preserves directory structure)
        const folderPicker = el('ragFolderPicker');
        if (folderPicker) {
            folderPicker.addEventListener('change', () => {
                const subfolder = (el('ragSubfolder') || {}).value || '';
                if (folderPicker.files.length > 0) uploadFiles(folderPicker.files, subfolder);
                folderPicker.value = '';
            });
        }

        // Upload button (triggers file picker)
        const uploadBtn = el('ragUploadBtn');
        if (uploadBtn) {
            uploadBtn.addEventListener('click', () => {
                const fp = el('ragFilePicker');
                if (fp) fp.click();
            });
        }

        // Folder upload button
        const uploadFolderBtn = el('ragUploadFolderBtn');
        if (uploadFolderBtn) {
            uploadFolderBtn.addEventListener('click', () => {
                const fp = el('ragFolderPicker');
                if (fp) fp.click();
            });
        }

        // Refresh button
        const refreshBtn = el('ragRefreshBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => loadDirectory(currentPath));
        }

        // Drop target: accept RAG file drags onto the in-overlay chat drop zone
        const chatDropZone = el('ragChatDropZone');
        if (chatDropZone) {
            chatDropZone.addEventListener('dragover', (e) => {
                if (e.dataTransfer.types.includes('application/x-boudica-rag')) {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'copy';
                    chatDropZone.classList.add('active');
                }
            });
            chatDropZone.addEventListener('dragleave', () => {
                chatDropZone.classList.remove('active');
            });
            chatDropZone.addEventListener('drop', (e) => {
                chatDropZone.classList.remove('active', 'visible');
                const filename = e.dataTransfer.getData('application/x-boudica-rag');
                if (!filename) return;
                e.preventDefault();
                insertRagRef(filename);
            });
        }

        // Fallback: also accept drops on the main chat input (visible when KB overlay is closed)
        const chatInput = document.getElementById('chatInput');
        if (chatInput) {
            chatInput.addEventListener('dragover', (e) => {
                if (e.dataTransfer.types.includes('application/x-boudica-rag')) {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'copy';
                    chatInput.classList.add('rag-drag-over');
                }
            });
            chatInput.addEventListener('dragleave', () => {
                chatInput.classList.remove('rag-drag-over');
            });
            chatInput.addEventListener('drop', (e) => {
                chatInput.classList.remove('rag-drag-over');
                const filename = e.dataTransfer.getData('application/x-boudica-rag');
                if (!filename) return;
                e.preventDefault();
                insertRagRef(filename);
            });
        }
    }

    // Expose public API for app.js
    window.ragUpload = { toggleRagPanel, openKbOverlay, closeKbOverlay, navigateTo, init };

    // Auto-init when DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
