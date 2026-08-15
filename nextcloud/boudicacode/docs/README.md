# docs/

Files here are served at `/apps/boudicacode/docs/<filename>` via
`DocsController.php` — see that file's docblock for why a dedicated
route exists instead of a plain static URL (short version: Nextcloud's
`.htaccess` only serves a fixed extension allowlist directly off disk,
and `.md` isn't in it).

The editor's Home tab (`editorPanel.js`) fetches `USER-GUIDE.md` from
here by default and renders it via `markdownFormatter.js`. Replace
that file with real content, or update `HOME_DOC_PATH` in
`editorPanel.js` to point at a different filename.

**Deploy note:** the standard deploy process for this app is a full
`rm -rf` + replace of the whole `custom_apps/boudicacode` folder —
that wipes this directory too. Back up any real docs you've added here
before redeploying, and copy them back in afterward (or add them into
your local working copy before zipping/uploading, so they're part of
the same deploy).
