/**
 * fileSearch.js
 *
 * Project-wide "find in files" — recursively walks the current project
 * via WebDavClient.list() (which is only ever one directory deep — see
 * its own docblock) and greps each file's content for a plain-text
 * query. Same "one list() + N readFile() calls, fine at the scale of a
 * single project" tradeoff projectSwitcher.js already accepts for
 * project enumeration — would need a server-side index to stay cheap at
 * a much larger scale, but that's well past what this app targets
 * (small scripting projects, not huge repos).
 *
 * Reads run sequentially, not via Promise.all — deliberately, so a
 * project with many files doesn't fire a burst of concurrent WebDAV
 * requests all at once.
 *
 * Classic script, depends only on WebDavClient — load after it, before
 * fileTree.js (which owns the search UI).
 */
(function (global) {
    'use strict';

    const BoudicaCode = global.BoudicaCode || (global.BoudicaCode = {});

    // Skipped outright — either not text (searching binary content as
    // text is pointless and slow) or generated noise (AI-edit backups
    // shouldn't clutter search results; the file tree already exposes
    // them separately via "Restore previous version…").
    const SKIP_DIR_NAMES = new Set(['.boudica_backups']);
    const BINARY_EXTENSIONS = new Set([
        'png', 'jpg', 'jpeg', 'gif', 'bmp', 'ico', 'webp', 'svg',
        'zip', 'tar', 'gz', '7z', 'rar',
        'pdf', 'woff', 'woff2', 'ttf', 'eot',
        'class', 'jar', 'o', 'so', 'dll', 'exe', 'pyc',
    ]);

    function isLikelyBinary(name) {
        const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
        return BINARY_EXTENSIONS.has(ext);
    }

    /** Recursively collects project-relative paths of every non-binary file under `dir`. */
    async function collectFiles(davClient, dir, out) {
        let entries;
        try {
            entries = await davClient.list(dir);
        } catch (err) {
            return; // unreadable subtree — skip it, don't fail the whole search
        }
        for (const entry of entries) {
            if (SKIP_DIR_NAMES.has(entry.name)) continue;
            const fullPath = dir ? `${dir}/${entry.name}` : entry.name;
            if (entry.isDirectory) {
                await collectFiles(davClient, fullPath, out);
            } else if (!isLikelyBinary(entry.name)) {
                out.push(fullPath);
            }
        }
    }

    /**
     * @param {WebDavClient} davClient - rooted at the project to search (callers must ensure a real project is open — searching from the raw Nextcloud home would crawl the person's entire storage)
     * @param {string} query - plain substring, case-insensitive
     * @param {object} [opts]
     * @param {number} [opts.maxMatches] - stop once this many matches are found, across all files
     * @param {number} [opts.maxMatchesPerFile] - cap per file so one huge generated file doesn't dominate the results
     * @returns {Promise<{matches: Array<{path: string, lineNumber: number, lineText: string}>, filesSearched: number, truncated: boolean}>}
     */
    async function searchProject(davClient, query, opts = {}) {
        const maxMatches = opts.maxMatches ?? 200;
        const maxMatchesPerFile = opts.maxMatchesPerFile ?? 20;
        const needle = query.toLowerCase();

        const paths = [];
        await collectFiles(davClient, '', paths);

        const matches = [];
        let filesSearched = 0;

        for (const path of paths) {
            if (matches.length >= maxMatches) break;
            let content;
            try {
                content = await davClient.readFile(path);
            } catch (err) {
                continue; // unreadable — skip, don't fail the whole search
            }
            filesSearched++;
            const lines = content.split('\n');
            let foundInFile = 0;
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].toLowerCase().includes(needle)) {
                    matches.push({ path, lineNumber: i + 1, lineText: lines[i].trim().slice(0, 200) });
                    foundInFile++;
                    if (foundInFile >= maxMatchesPerFile || matches.length >= maxMatches) break;
                }
            }
        }

        return { matches, filesSearched, truncated: matches.length >= maxMatches };
    }

    BoudicaCode.FileSearch = { searchProject };
})(window);
