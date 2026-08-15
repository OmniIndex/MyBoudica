/**
 * webdavClient.js
 *
 * Thin wrapper around Nextcloud's WebDAV endpoint so the file tree and
 * editor can list/read/write/delete files without depending on any
 * Nextcloud JS SDK. Classic script — see eventBus.js for load-order
 * rationale. No dependency on bus/state, so it can load any time
 * before editorPanel.js / fileTree.js.
 *
 * All paths passed to these methods are relative to the project root,
 * e.g. "src/main.py", not the full WebDAV URL.
 *
 * TODO: swap PROJECT_ROOT for a real per-project value once the
 * project switcher exists (see fileTree.js).
 */
(function (global) {
    'use strict';

    const BoudicaCode = global.BoudicaCode || (global.BoudicaCode = {});

    function getCurrentUser() {
        return (global.OC && OC.getCurrentUser && OC.getCurrentUser().uid) || 'unknown-user';
    }

    function davBase() {
        return `/remote.php/dav/files/${encodeURIComponent(getCurrentUser())}`;
    }

    function joinPath(root, relativePath) {
        return [root.replace(/\/+$/, ''), relativePath.replace(/^\/+/, '')]
            .filter(Boolean)
            .join('/');
    }

    function davUrl(fullPath) {
        return `${davBase()}/${fullPath.replace(/^\/+/, '')}`;
    }

    /** WebDAV's Destination header (COPY/MOVE) requires an absolute URI, unlike every other request here which can stay origin-relative. */
    function absoluteDavUrl(fullPath) {
        return `${global.location.origin}${davUrl(fullPath)}`;
    }

    function requestToken() {
        return (global.OC && OC.requestToken) || '';
    }

    function parseDavListing(xmlText) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(xmlText, 'application/xml');
        const responses = Array.from(doc.getElementsByTagNameNS('DAV:', 'response'));

        // Depth:1 PROPFIND always returns the requested directory itself as
        // the first <d:response>, followed by its children.
        return responses
            .slice(1)
            .map((responseEl) => {
                const href = decodeURIComponent(
                    responseEl.getElementsByTagNameNS('DAV:', 'href')[0]?.textContent || ''
                );
                const isDirectory =
                    responseEl.getElementsByTagNameNS('DAV:', 'resourcetype')[0]
                        ?.getElementsByTagNameNS('DAV:', 'collection').length > 0;
                const name = href.replace(/\/$/, '').split('/').pop();
                return { name, href, isDirectory };
            })
            .filter((entry) => entry.name && entry.name.length > 0);
    }

    class WebDavClient {
        constructor(projectRoot) {
            this.projectRoot = projectRoot;
        }

        setProjectRoot(projectRoot) {
            this.projectRoot = projectRoot;
        }

        async list(relativeDir = '') {
            const fullPath = joinPath(this.projectRoot, relativeDir);
            const res = await fetch(davUrl(fullPath), {
                method: 'PROPFIND',
                headers: {
                    Depth: '1',
                    requesttoken: requestToken(),
                    'Content-Type': 'application/xml',
                },
                body: `<?xml version="1.0"?>
                    <d:propfind xmlns:d="DAV:">
                        <d:prop>
                            <d:resourcetype/>
                            <d:getcontentlength/>
                            <d:getlastmodified/>
                        </d:prop>
                    </d:propfind>`,
            });

            if (!res.ok) {
                throw new Error(`WebDAV list failed (${res.status}) for ${fullPath}`);
            }

            const xmlText = await res.text();
            return parseDavListing(xmlText);
        }

        async readFile(relativePath) {
            const fullPath = joinPath(this.projectRoot, relativePath);
            const res = await fetch(davUrl(fullPath), {
                method: 'GET',
                headers: { requesttoken: requestToken() },
            });
            if (!res.ok) {
                throw new Error(`WebDAV read failed (${res.status}) for ${fullPath}`);
            }
            return res.text();
        }

        /** Lighter than readFile() for a plain "does this exist" check — no body downloaded. A 404 here is an expected, non-error result, not a failure. */
        async exists(relativePath) {
            const fullPath = joinPath(this.projectRoot, relativePath);
            const res = await fetch(davUrl(fullPath), {
                method: 'HEAD',
                headers: { requesttoken: requestToken() },
            });
            return res.ok;
        }

        async writeFile(relativePath, content) {
            const fullPath = joinPath(this.projectRoot, relativePath);
            const res = await fetch(davUrl(fullPath), {
                method: 'PUT',
                headers: {
                    requesttoken: requestToken(),
                    'Content-Type': 'text/plain',
                },
                body: content,
            });
            if (!res.ok) {
                throw new Error(`WebDAV write failed (${res.status}) for ${fullPath}`);
            }
            return true;
        }

        async makeDirectory(relativePath) {
            const fullPath = joinPath(this.projectRoot, relativePath);
            const res = await fetch(davUrl(fullPath), {
                method: 'MKCOL',
                headers: { requesttoken: requestToken() },
            });
            if (!res.ok) {
                throw new Error(`WebDAV mkdir failed (${res.status}) for ${fullPath}`);
            }
            return true;
        }

        async delete(relativePath) {
            const fullPath = joinPath(this.projectRoot, relativePath);
            const res = await fetch(davUrl(fullPath), {
                method: 'DELETE',
                headers: { requesttoken: requestToken() },
            });
            if (!res.ok) {
                throw new Error(`WebDAV delete failed (${res.status}) for ${fullPath}`);
            }
            return true;
        }

        /** Absolute WebDAV URL for a path relative to this client's project root — for direct downloads/links. */
        fileUrl(relativePath) {
            return davUrl(joinPath(this.projectRoot, relativePath));
        }

        /**
         * WebDAV COPY. destRelativePath is relative to this client's own
         * project root (not the source's — same root for both in every
         * call site this app makes, i.e. copy/move within one project).
         */
        async copy(srcRelativePath, destRelativePath, overwrite = false) {
            const srcFull = joinPath(this.projectRoot, srcRelativePath);
            const destFull = joinPath(this.projectRoot, destRelativePath);
            const res = await fetch(davUrl(srcFull), {
                method: 'COPY',
                headers: {
                    requesttoken: requestToken(),
                    Destination: absoluteDavUrl(destFull),
                    Overwrite: overwrite ? 'T' : 'F',
                },
            });
            if (!res.ok) {
                if (res.status === 412) {
                    throw new Error(`"${destRelativePath}" already exists`);
                }
                throw new Error(`WebDAV copy failed (${res.status}) for ${srcFull}`);
            }
            return true;
        }

        /** WebDAV MOVE — same semantics as copy(), but removes the source. */
        async move(srcRelativePath, destRelativePath, overwrite = false) {
            const srcFull = joinPath(this.projectRoot, srcRelativePath);
            const destFull = joinPath(this.projectRoot, destRelativePath);
            const res = await fetch(davUrl(srcFull), {
                method: 'MOVE',
                headers: {
                    requesttoken: requestToken(),
                    Destination: absoluteDavUrl(destFull),
                    Overwrite: overwrite ? 'T' : 'F',
                },
            });
            if (!res.ok) {
                if (res.status === 412) {
                    throw new Error(`"${destRelativePath}" already exists`);
                }
                throw new Error(`WebDAV move failed (${res.status}) for ${srcFull}`);
            }
            return true;
        }
    }

    BoudicaCode.WebDavClient = WebDavClient;
})(window);
