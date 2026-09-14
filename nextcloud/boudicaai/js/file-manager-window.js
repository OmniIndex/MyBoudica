// file-manager-window.js — non-modal floating window chrome for the
// Knowledge Base file manager.
//
// This file only handles the WINDOW (open/close, drag by titlebar, resize
// from the corner handle) - the actual file-listing/upload/rename/delete
// logic lives entirely inside file_manager.html/file-manager.js, loaded
// here via an <iframe>. Deliberately not a modal: no backdrop, no
// aria-modal, no scroll lock - the chat interface behind it stays fully
// usable while this is open, same as a real desktop file-manager window
// sitting alongside other windows.

'use strict';

(function () {
    function el(id) { return document.getElementById(id); }

    function init() {
        const win = el('fileManagerWindow');
        const btn = el('fileManagerBtn');
        const titlebar = el('fmFloatingTitlebar');
        const closeBtn = el('fmFloatingCloseBtn');
        const frame = el('fmFloatingFrame');
        const resizeHandle = el('fmFloatingResizeHandle');
        if (!win || !btn || !titlebar || !closeBtn || !frame || !resizeHandle) return;

        let frameLoaded = false;

        function open() {
            if (!frameLoaded) {
                // Ported from the standalone product, where this file (and
                // file_manager.html/file-manager.js) all live at the same
                // web root as this script. Inside Nextcloud, file_manager.html
                // is NOT copied into this app - it's served, unmodified, by
                // boudica_slm's own "web" service and reached through the
                // /boudica-static/ nginx proxy (see product_templates/collabora/
                // nginx/default.conf) added specifically for this floating
                // window's iframe and its own /cgi-bin/rag_upload calls.
                frame.src = '/boudica-static/file_manager.html';
                frameLoaded = true;
            }
            win.classList.remove('hidden');
            // Bring to front relative to anything else floating.
            win.style.zIndex = String(Date.now() % 100000 + 500);
        }

        function close() {
            win.classList.add('hidden');
        }

        function toggle() {
            if (win.classList.contains('hidden')) open(); else close();
        }

        btn.addEventListener('click', toggle);
        closeBtn.addEventListener('click', close);

        // ---- Drag by titlebar ----
        (function setupDrag() {
            let dragging = false;
            let startX = 0, startY = 0, startLeft = 0, startTop = 0;

            titlebar.addEventListener('mousedown', (e) => {
                if (e.target.closest('#fmFloatingCloseBtn')) return;
                dragging = true;
                win.classList.add('fm-dragging');
                const rect = win.getBoundingClientRect();
                // Switch from the initial centered transform-based position
                // to explicit left/top so dragging math stays simple.
                win.style.left = rect.left + 'px';
                win.style.top = rect.top + 'px';
                win.style.transform = 'none';
                startX = e.clientX;
                startY = e.clientY;
                startLeft = rect.left;
                startTop = rect.top;
                e.preventDefault();
            });

            document.addEventListener('mousemove', (e) => {
                if (!dragging) return;
                const dx = e.clientX - startX;
                const dy = e.clientY - startY;
                let newLeft = startLeft + dx;
                let newTop = startTop + dy;
                // Keep at least a sliver of the titlebar on-screen so it's
                // always recoverable.
                const margin = 40;
                newLeft = Math.max(margin - win.offsetWidth, Math.min(newLeft, window.innerWidth - margin));
                newTop = Math.max(0, Math.min(newTop, window.innerHeight - margin));
                win.style.left = newLeft + 'px';
                win.style.top = newTop + 'px';
            });

            document.addEventListener('mouseup', () => {
                if (!dragging) return;
                dragging = false;
                win.classList.remove('fm-dragging');
            });
        })();

        // ---- Resize from corner handle ----
        (function setupResize() {
            let resizing = false;
            let startX = 0, startY = 0, startWidth = 0, startHeight = 0;

            resizeHandle.addEventListener('mousedown', (e) => {
                resizing = true;
                win.classList.add('fm-resizing');
                const rect = win.getBoundingClientRect();
                startX = e.clientX;
                startY = e.clientY;
                startWidth = rect.width;
                startHeight = rect.height;
                e.preventDefault();
                e.stopPropagation();
            });

            document.addEventListener('mousemove', (e) => {
                if (!resizing) return;
                const newWidth = Math.max(420, startWidth + (e.clientX - startX));
                const newHeight = Math.max(320, startHeight + (e.clientY - startY));
                win.style.width = newWidth + 'px';
                win.style.height = newHeight + 'px';
            });

            document.addEventListener('mouseup', () => {
                if (!resizing) return;
                resizing = false;
                win.classList.remove('fm-resizing');
            });
        })();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
