/**
 * projectCreator.js
 *
 * Scaffolds a new project onto Nextcloud storage via WebDAV. Extracted
 * out of chatPanel.js's "/new" command so the same logic backs both
 * the chat command and newProjectDialog.js's UI — one code path, two
 * entry points. Classic script, depends on ProjectScaffolder (for the
 * file plan) and WebDavClient (to write it) — load after both.
 */
(function (global) {
    'use strict';

    const BoudicaCode = global.BoudicaCode || (global.BoudicaCode = {});
    const { WebDavClient, ProjectScaffolder } = BoudicaCode;

    function dirname(path) {
        const idx = path.lastIndexOf('/');
        return idx === -1 ? '' : path.slice(0, idx);
    }

    function sanitizeName(name) {
        return (name || '').replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
    }

    /** WebDAV's MKCOL can only create one level at a time and needs the parent to already exist. */
    async function ensureRemoteDir(client, relativeDirPath) {
        const segments = relativeDirPath.split('/').filter(Boolean);
        let current = '';
        for (const segment of segments) {
            current = current ? `${current}/${segment}` : segment;
            try {
                await client.makeDirectory(current);
            } catch (err) {
                // Already exists (405) — expected and fine; anything else
                // surfaces naturally when the subsequent write fails.
            }
        }
    }

    /**
     * @param {string} parentDir - path relative to the user's Nextcloud
     *   home where the project folder should be created ('' = top level).
     * @param {string} name - desired project name (sanitized before use).
     * @param {string} stack - one of ProjectScaffolder.SUPPORTED_STACKS.
     * @returns {Promise<{projectRoot: string, fileCount: number}>}
     * @throws {Error} on invalid input, an existing name collision, or a write failure.
     */
    async function createProject(parentDir, name, stack) {
        if (!ProjectScaffolder.SUPPORTED_STACKS.includes(stack)) {
            throw new Error(`Unknown stack "${stack}". Choose one of: ${ProjectScaffolder.SUPPORTED_STACKS.join(', ')}`);
        }

        const safeName = sanitizeName(name);
        if (!safeName) {
            throw new Error(`"${name}" doesn't produce a usable folder name — try letters/numbers/dashes.`);
        }

        const client = new WebDavClient(parentDir || '');

        let listing;
        try {
            listing = await client.list('');
        } catch (err) {
            throw new Error(`Could not reach storage: ${err.message}`);
        }
        if (listing.some((entry) => entry.name === safeName)) {
            throw new Error(`"${safeName}" already exists in that location.`);
        }

        const plan = ProjectScaffolder.scaffold(safeName, stack);

        await client.makeDirectory(safeName);
        for (const dir of plan.dirs) {
            await ensureRemoteDir(client, `${safeName}/${dir}`);
        }
        let fileCount = 0;
        for (const [relPath, content] of Object.entries(plan.files)) {
            const fullPath = `${safeName}/${relPath}`;
            await ensureRemoteDir(client, dirname(fullPath));
            await client.writeFile(fullPath, content);
            fileCount++;
        }

        const projectRoot = parentDir ? `${parentDir.replace(/\/+$/, '')}/${safeName}` : safeName;
        return { projectRoot, fileCount };
    }

    BoudicaCode.ProjectCreator = { createProject, sanitizeName };
})(window);
