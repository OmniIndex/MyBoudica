# Boudica Code — skeleton

A standalone Nextcloud app: three-pane VS Code-style workspace
(file tree / Monaco editor / chat), backed by WebDAV for file storage.
Separate from the BoudicaAI Talk integration — its own app icon, own
full-page route, plain JS (no Vue).

## Structure

```
boudica-code/
├── appinfo/
│   ├── info.xml          # app metadata, nav entry
│   └── routes.php        # single route: page#index
├── lib/
│   └── Controller/
│       └── PageController.php   # renders the app shell template
├── templates/
│   └── main.php          # mount point + script/style tags
├── css/
│   └── style.css         # three-pane grid layout
└── js/
    └── src/
        ├── main.js               # entry point, wires panels together
        ├── core/
        │   ├── eventBus.js       # pub/sub so panels stay in sync
        │   ├── state.js          # current project/file/dirty state
        │   └── webdavClient.js   # list/read/write/delete via Nextcloud WebDAV
        ├── editor/
        │   └── editorPanel.js    # Monaco wrapper (center pane)
        ├── files/
        │   └── fileTree.js       # file/project tree (left pane)
        └── chat/
            └── chatPanel.js      # chat + slash commands (right pane)
```

## Not yet done / decisions needed

1. ~~**Monaco loading strategy**~~ — resolved. Monaco's prebuilt AMD
   bundle (`monaco-editor`'s `min/vs` output) is vendored directly into
   `js/vendor/monaco/vs/`. `loader.js` itself loads via the normal
   `script()` helper (that path is shallow enough for Nextcloud's
   built-in app-asset serving). Everything Monaco fetches *after*
   that — `editor/editor.main.js`, worker scripts, per-language chunk
   files — goes several directories deeper, which Nextcloud's built-in
   serving appears not to support (returns its own 404 page rather
   than the file, even though the file exists on disk with correct
   permissions). So those requests are routed instead through a
   dedicated controller (`MonacoAssetsController` + the
   `/vendor-assets/{path}` route) that just reads the file off disk
   and streams it back with the right Content-Type. `editorPanel.js`
   points Monaco's `require.config({ paths: { vs: ... } })` at that
   route. No CDN dependency, works offline. Total added size: ~24MB
   (`min/vs` includes every language grammar Monaco ships with — not
   trimmed down, since the loader resolves language files dynamically
   and trimming risks breaking that).

2. **Build pipeline** — nothing here is bundled yet. You'll want a
   simple webpack or esbuild config that outputs a single
   `js/boudica-code-main.js` (referenced by `script('boudicacode', 'boudica-code-main')`
   in `templates/main.php`), since browsers won't resolve the ES module
   imports across files without either bundling or `type="module"` +
   correct relative paths.

3. ~~**Backend command/chat endpoints**~~ — resolved, and it turned out
   there's no PHP backend involved at all: `boudicaApi.js` (ported from
   the real production frontend's `chat-api.js`) calls Boudica directly
   from the browser, same as the existing Boudica Torc app does. See
   "AI agent: project creation & editing" below.

4. **Project switcher** — still no dedicated picker UI, but `/new`
   (see below) now creates a project and switches into it via
   `AppState.setProjectRoot()`, so the single-project-root design at
   least has one way in. A real picker (list existing top-level
   folders, let the person choose) is still open.

5. **Auth for backend calls** — assumed same-origin + Nextcloud's
   `requesttoken` for now. Confirm this matches how BoudicaAI's
   backend actually authenticates requests.

6. **Home tab iframe CSP** — the editor's Home tab embeds an iframe
   pointing at `HOME_URL` in `editorPanel.js` (currently a placeholder:
   `https://boudi.ca` — confirm the real help/update page and update
   the constant). Nextcloud's default CSP has `frame-src 'self'`,
   which blocks this regardless of any `default-src`/`script-src`/
   `connect-src` allowances already added at the Apache level. Add:
   ```
   Header edit Content-Security-Policy "frame-src 'self'" "frame-src 'self' https://boudi.ca"
   ```
   to the vhost alongside the existing `Header edit` rules, then
   reload Apache.

## UI

- **Left panel (files)** collapsible via the `⟨`/`⟩` toggle (first
  toolbar button) — state persists across reloads. The breadcrumb's
  leading `/` is highlighted so it's obvious it's the "back to project
  root" control, not just a separator.
- **Right panel (chat)** resizable by dragging the handle on its left
  edge (240–640px, persisted, double-click to reset). The prompt box
  is a multiline textarea — Enter sends, Shift+Enter for a newline.
- **"+ New Project"** button in the editor toolbar opens a modal
  (name, stack, and a destination folder picked via Nextcloud's native
  `OC.dialogs.filepicker` — falls back to the top level of storage if
  that API isn't available). Same underlying scaffolding code as the
  `/new` chat command — see `js/src/project/projectCreator.js`, shared
  by both `chatPanel.js` and `js/src/project/newProjectDialog.js`.
- **File tree right-click menu**: Cut, Copy, Paste, Download, Delete.
  Paste onto a folder places the item inside it; paste on empty space
  or a file places it in the current directory (cut is one-shot, like
  a desktop file manager — copy isn't). Cut/copy/paste needed two new
  `WebDavClient` methods, `copy()`/`move()` (WebDAV `COPY`/`MOVE`,
  added in `js/src/core/webdavClient.js`), since only list/read/write/
  mkdir/delete existed before. Download works per-item now too: files
  download directly via WebDAV; folders reuse the existing zip
  endpoint (`ProjectDownloadController`), scoped to that subfolder.

## UX/styling pass (0.2.0)

Went through the whole app for interaction polish — hover, focus, click,
and text-selection states — not a visual redesign, just making the
existing UI feel finished:

- **Keyboard focus** — every interactive element (buttons, file tree
  items, tabs, form fields) now gets a visible focus ring via
  `:focus-visible` (mouse clicks don't show it, only keyboard/assistive
  tech). File tree items and editor tabs are now genuinely tab-
  navigable and Enter/Space-activatable, not click-only.
- **Active-file highlight** in the file tree — the file currently open
  in the editor is now visually marked there too (a "you are here"
  cue every desktop IDE has, which this didn't). Stays in sync via
  `FILE_OPENED`/`TAB_ACTIVATED`/`FILE_CLOSED` without a full tree reload.
- **Tone-coded chat messages** — every bot message is now
  success/error/warning/neutral (a left accent stripe + tinted dark
  background, not a jarring pastel), so scanning the log for "did that
  work" doesn't require reading every line. Threaded through
  `_appendMessage`/`_setMessage`'s new `tone` parameter at every call
  site rather than guessed from message text (guessing via string
  matching would silently break the moment wording changes).
- **Tab dirty indicator** is now a real colored dot element instead of
  a "●" character appended to the label text (couldn't be styled or
  separated from the label before).
- **Empty states** — an empty folder in the tree, and the chat log
  before the first message, both now say something instead of showing
  nothing (the chat one is pure CSS, `:empty::before`, no JS needed).
- **Status bar** turns red on `EVENTS.ERROR` instead of staying the
  same blue regardless of state.
- **Modal** gets a brief fade/scale-in instead of appearing instantly,
  and Escape now closes it (previously only click-outside did).
- **Themed text selection**, a themed dark scrollbar on the editor tab
  strip (a default light OS scrollbar there looked out of place against
  the dark theme), and short (~120ms) transitions on hover/press across
  buttons, tabs, and list items instead of instant color snaps.
- Everything animated (`bc-pulse`, tab-strip scroll, modal entrance,
  message entrance) respects `prefers-reduced-motion` — reduces to a
  static state instead of an animation.

## MVP gap-fill (0.3.0): backups, project switcher, multi-file C++

Three changes, prioritized after an explicit MVP gap review:

**Backups (was flagged as a genuine oversight, not a nice-to-have).**
The original Python CLI kept a `file_backups` table (`session_manager.py`)
so a bad AI edit was always recoverable — that safety net got dropped
when this app was built and never replaced, until now. `chatPanel.js`'s
`_backupFile()` saves whatever's currently on disk to
`.boudica_backups/<path>.<timestamp>` immediately before every AI edit
overwrite (not on `/create` — nothing to back up when the file didn't
exist yet). Recover with `/restore <path> [N]` (N=1 = most recent,
default) or the file tree's new "Restore previous version…" right-click
item. Backups are plain files sitting in a normal (visible, dotfile)
folder — no separate storage system, no expiry logic; browsable and
deletable like anything else if that folder grows.

**Project switcher.** There wasn't one — "browse the file tree back out
to the top level" was standing in for it, which isn't discoverable. New
`js/src/project/projectSwitcher.js` renders a bar above the whole
workspace showing the current project, with a dropdown of every other
project in the account. Finds projects by listing the top level of
storage and checking each folder for `.boudica_project.json` (one
`list()` + N `readFile()` calls — fine at the scale of "one person's
projects," would need a cheaper index if that stops being true).
Refreshes automatically when `/new` creates a project.

**Multi-file creation — C++ header/implementation pairs only.** Scoped
deliberately narrow: when a `.cpp`/`.cc`/`.cxx` file is requested for a
`cpp`-stack project, `chatPanel.js`'s `_createCppPair()` asks Boudica
for the header first (`PromptBuilder.buildHeaderPrompt()` — declarations
only, proper header guards), then generates the implementation with
that header's exact text included as required context
(`buildCreatePrompt()`'s new optional `headerContext` param), so the
`.cpp` actually implements what the `.h` declared rather than the two
independently guessing. Mirrors the two-step flow the Python CLI used.
Not a general multi-file system — Python/JS/TS/Java don't split
declaration from implementation the same way, so this isn't wired up
for them; if a real need for cross-file generation in those stacks
shows up, `_createCppPair()` is the pattern to generalize from, not a
one-off to route around.

## Local dev

Drop this folder into your Nextcloud `apps/` directory as `boudicacode`,
enable it from the Nextcloud admin apps page, then visit it from the
app launcher. Until the build pipeline (#2) exists, `js/src/main.js`
and friends won't load as-is — add bundling before testing in-browser.

## Compile/syntax check

The editor's "▶ Check" button (next to the tabs) sends the current
buffer's content to `CompileController::check()`, which writes it to a
private temp dir and runs the relevant toolchain already installed on
this container (confirmed: `build-essential` — gcc/g++; also wired for
Python via `py_compile` and Java via `javac`, both of which fail
gracefully with a clear message if not installed). Every run goes
through `timeout` and PHP's array-form `proc_open` (no shell
interpolation, so file content can't inject commands). This is a
**syntax/type check only** — `-fsyntax-only` for C/C++, `py_compile`
for Python — nothing is ever linked or executed. Results show up as a
message in the chat panel. Extending to more languages just means
adding an entry to the `$map` in `resolveCommand()`.

Deliberately **not** a "Build and run" feature — full execution was
ruled out as not worth it for a remote-hosted editor (see conversation
history). If that changes later, treat it as a substantially bigger
feature: needs actual sandboxing (resource limits beyond a timeout,
network isolation, filesystem isolation) since it'd mean running
arbitrary user code rather than just parsing it.

## AI agent: project creation & editing

Two source lineages feed this:

- **What** to ask Boudica, and how to turn its replies into files —
  ported from the separate Python CLI coding agent (`project_manager.py`'s
  `scaffold_*()`, `boudica_integration.py`'s prompt-framing,
  `git_integration.py`'s gitignore/README templates) into
  `js/src/project/projectScaffolder.js` and `js/src/chat/promptBuilder.js`.
- **How** to actually talk to Boudica — ported from the real production
  frontend's `chat-api.js` (CGI mode) into `js/src/chat/boudicaApi.js`.
  This superseded an earlier draft of this app that used a PHP proxy
  modeled on the Python CLI's `boudica_mod.py`; `chat-api.js` revealed
  the real integration calls Boudica **directly from the browser** —
  `POST {apiBase}/chat` with `api_key` in the JSON body, not an
  `Authorization` header — so that's what this app does too now. See
  `boudicaApi.js`'s docblock for the full rationale and what was
  deliberately left out (file uploads, pdf/pptx/docx/xlsx/epub/dashboard
  generation, shared chats, user messaging — none of it applies to a
  code editor).
- **Where the API key comes from** — ported from `saml-auth.js` into
  `js/src/chat/boudicaAuth.js`. See AUTH below.

**Build/debug/git-init were intentionally left out** — this app
already has its own compile-check, and explicitly has no build/run/debug
workflow (see above).

Slash-commands (typed in the chat panel), all handled by `chatPanel.js`:

- `/new <name> <stack>` — scaffold a new project (`cpp`, `python`,
  `nodejs`, `typescript`, `java`, `bash`, `batch`) at the top level of
  the user's Nextcloud storage (via WebDAV — a fresh `WebDavClient`
  rooted at `''`, independent of whatever project is currently open),
  and switch the workspace into it.
- `/create <path> <description>` — ask Boudica to generate a new file
  from a plain-language description, write it, and open it.
- `/edit <description>` — ask Boudica to rewrite the file currently
  open in the editor. The result is written to disk **and** pushed
  live into the open Monaco tab (`FILE_EXTERNALLY_UPDATED` event) —
  no manual reload needed. Requests containing embedded code snippets
  (e.g. `'change "std::cout << x" to ...'`) are rejected with a
  message asking for a plain-language description instead, same as
  the Python CLI's `validate_edit_request()`.
- `/status` — quick project summary.
- `/boudica-key <key>` — see AUTH below.
- Free text (no leading `/`): if a file is open, it's treated as an
  edit request against it. If not, it's a planning/discussion question
  about the project (`chat_planning()`'s prompt, ported as-is),
  streamed live into the chat log.

**Simplification vs. the Python CLI:** edits ask Boudica for the full
updated file rather than a unified diff. The original CLI parsed and
applied diffs (a ~250-line hand-rolled engine) to keep terminal review
short; here the result is auto-applied straight into the live editor,
so a full-file response is more robust — no diff-apply failure mode —
at the cost of a few more tokens per edit. If token cost becomes a
real concern, `buildEditPrompt()` in `promptBuilder.js` is the place
to switch back to a diff-based prompt.

**Free-text routing.** A message typed with no file open goes one of
two ways: `CREATE_INTENT_RE` in `chatPanel.js` checks for an imperative
verb ("create/build/make/write/generate/implement/add/develop..."); if
it matches, the request goes through the same code-generation path as
`/create` (with an explicit path if one's named in the message, else
the stack's default entry file — see `DEFAULT_ENTRY_FILE`, and if that
already exists as a freshly-scaffolded stub, this becomes an edit that
fills it in instead of a create). Otherwise it's a genuine question,
routed to planning chat. Earlier versions of this app routed ALL
file-less free text to planning chat regardless of phrasing — so "create
an app that does X" got Boudica's advice about how to build X instead
of the code itself. `buildCreatePrompt()`/`buildEditPrompt()` also now
explicitly tell Boudica not to attempt the task's real-world actions
itself (fetch URLs, call tools, etc.) — it's only ever writing source
code, never executing it; the earlier prompts didn't make this explicit
enough and Boudica's backend, which has genuine agentic/tool-use
capability, would sometimes try to actually perform the request instead
of writing code that would perform it when run.

**Project persistence.** `AppState.setProjectRoot()` now also writes
`bc_last_project_root` to localStorage, and `main.js`'s boot() reads it
back as a fallback when the server-rendered `data-project-root`
attribute is empty (which — see `PageController` — it currently always
is; nothing sets `$_['projectRoot']` yet). Without this, a plain page
reload silently dropped the workspace back to the raw root of the
user's Nextcloud storage with no project selected, and `/create`/`/edit`/
free-text-create would run against that instead of any project — the
symptom was 404s in the console for `.boudica_project.json` and the
target file with no project folder anywhere in the request path, and no
visible error, since a 404 on an existence check is an expected result,
not a failure. Two things now guard against this even if a persisted
project ever goes stale (renamed/deleted) or `main.js` doesn't get to
run first: `chatPanel.js`'s `_requireProject()` refuses `/create`,
`/edit`, and free-text create-intent with a clear message when
`AppState.getProjectRoot()` is empty, and `/create`/`/edit` now show a
"Working on it…"-style message immediately rather than staying silent
until the whole round-trip finishes, so a slow response doesn't look
like nothing happened.

**Stack detection had a silent bad-default bug.** `_detectStack()` had
exactly one real source of truth (`.boudica_project.json`) and one weak
fallback (the target path's extension, `null` for file-less free text).
Every call site then did `... || 'python'` — so a `.boudica_project.json`
404 (project predates the scaffolder writing one, or was made outside
this app) plus a message with no explicit filename meant a C++ project
would silently generate a Python file with zero indication a guess had
been made. `_detectStack()` now has a third fallback,
`_detectStackFromProjectFiles()`, which checks the project root for
marker files (`CMakeLists.txt`→cpp, `pom.xml`→java, `tsconfig.json`
→typescript, `package.json`→nodejs, `requirements.txt`/`setup.py`
→python) before giving up — and when even that fails, `_resolveStack()`
now posts an explicit "(Couldn't tell this project's stack... assuming
Python)" message instead of guessing silently, so a wrong guess is
visible and correctable instead of discovered after the fact in a
generated file.

**AUTH** — auto-signup. `js/src/chat/boudicaAuth.js` (ported from
`saml-auth.js`) runs on chat panel init: if there's no `boudica_session`
in localStorage yet, it POSTs the current Nextcloud user's identity to
`/api/boudica/beta/signup`, gets back an API key, and stores it —
exactly like the existing BoudicaAI Talk integration already does, and
using the *same* localStorage key, so if the person has ever used that
app in this Nextcloud instance, Boudica Code picks up the same session
immediately with no signup call at all. `/boudica-key <key>` is still
available as a manual override (e.g. if auto-signup is down, or you
want to use a different key than your Nextcloud identity would get).

**INFRA — this needs a real CSP change, confirmed in testing.** The
auto-signup POST and every Boudica call are cross-origin requests from
the Nextcloud origin to `https://boudi.ca`. An earlier version of this
doc assumed that, since the existing BoudicaAI integration already
makes similar calls from this Nextcloud instance, CORS/CSP would
already be in place — that assumption turned out wrong (or at least
this Nextcloud's CSP doesn't cover it): in testing, `/create`/`/edit`/
chat all silently failed with no response, and the console showed a
CSP **frame-src** violation for `https://boudi.ca` (from the editor's
Home tab iframe, a separate, older issue — see `HOME_URL` below) which
was the tell that this Nextcloud's CSP is locked to `'self'` by
default. `connect-src` — the directive that actually governs `fetch()`
— needs `https://boudi.ca` added explicitly, same pattern as the
existing `worker-src` rule:
```apache
Header edit Content-Security-Policy "connect-src 'self'" "connect-src 'self' https://boudi.ca"
```
(adjust the existing-value string in the first argument to match
whatever this Nextcloud's `connect-src` currently is, if it's not
plain `'self'`.) A CSP-blocked `fetch()` throws the exact same generic
`TypeError: Failed to fetch` as a real network outage, so
`boudicaApi.js`'s `wrapEndpointFetch()` (and `boudicaAuth.js`'s signup
call) now catch that specific error and point at `connect-src` in the
message shown in chat, instead of leaving it as an unexplained
silence.

**`HOME_URL` frame-src note (separate, cosmetic issue):** the editor's
Home tab still embeds the placeholder `https://boudi.ca` in an
`<iframe>` (flagged as unresolved in the original handoff doc) — CSP's
`frame-src` is a completely different directive from `connect-src`
(one governs iframes, the other fetch/XHR), so fixing `connect-src`
above won't fix that iframe. Either point `HOME_URL` in
`editorPanel.js` at a real destination on this Nextcloud's own domain,
or add a matching `frame-src` rule if `https://boudi.ca` genuinely
belongs there.
