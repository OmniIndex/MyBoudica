# Boudica Code

An AI pair-programming workspace built into Nextcloud: a file tree, a
Monaco code editor (the same editor VS Code uses), and a chat panel
where Boudica writes and edits your code — all in one browser tab,
working directly on your Nextcloud files.

---

## What's New (0.5.0)

- **Real builds, not just syntax checks.** The `▶ Check` button now
  does an actual compile/build for more stacks — see *Checking and
  building your code* below.
- **A visible Save button.** Saving used to be Ctrl/Cmd+S only — the
  editor toolbar now has a `💾 Save` button too, which turns amber with
  a `*` whenever the open file has unsaved changes.
- **Your work is protected.** Closing a tab or switching projects with
  unsaved changes open now asks first instead of silently discarding
  them.
- **See what an edit actually changed.** Boudica's edit messages now
  include a compact diff (`+N -M` lines) right in the chat log, instead
  of only being recoverable by pulling up a backup.
- **Stop a request mid-flight.** A `Stop` button appears next to Send
  while Boudica's working, so you're not stuck waiting one out.
- **Retry without retyping.** A failed request gets an inline `Retry`
  button in the same chat message.
- **Rename files and folders.** Right-click → Rename in the file tree.
  Renaming a folder that has open files inside it keeps their tabs open
  at the new path.
- **Find in files.** A new 🔍 button in the file tree searches every
  file in the current project for a piece of text — click a result to
  jump straight to that line.
- **Manage projects, not just switch between them.** Hover a project in
  the project-bar dropdown for Rename/Delete.

---

## What it is

Boudica Code combines three things you'd normally juggle separately:

- **A file browser** — the same folders and files sitting in your
  Nextcloud storage, not a separate copy.
- **A code editor** — Monaco, with syntax highlighting for the stacks
  Boudica Code scaffolds (C++, Python, Node.js, TypeScript, Java,
  Bash, Windows Batch) and anything else Monaco recognizes by file
  extension.
- **An AI chat panel** — ask Boudica to create a project, generate a
  file, or edit whatever's currently open, in plain language.
- **A compile/build check** — the `▶ Check` button verifies your code
  (a real build for some stacks, a syntax check for others — see
  *Checking and building your code* below). It never runs anything;
  to actually run or test your code, download the project and do that
  in your own environment for now.

---

## How to use it

### The layout

- **Top bar** — the project switcher. Click it to see every project in
  your account, jump between them, or return to **🏠 Home (no
  project)** — your Nextcloud storage's true top level.
- **Left panel** — the file tree for whichever project is currently
  open. Collapsible via the `⟨` toggle if you want the editor wider.
- **Center panel** — the editor. Tabs across the top, a `+ New
  Project` / `💾 Save` / `▶ Check` toolbar underneath, and this Home
  tab itself, which you're reading right now.
- **Right panel** — chat with Boudica. Resizable by dragging its left
  edge.

### Talking to Boudica

Two ways to ask for something. **Just describe it in plain language**
— with a file open, your message is treated as an edit request against
that file; with no file open, an imperative message like *"build a
REST API that..."* is treated as a request to create something, while
a genuine question like *"what's a good approach for..."* gets a
discussion answer instead.

Or use a **slash command** when you want to be explicit:

- `/new <name> <stack>` — scaffold a brand-new project (`cpp`,
  `python`, `nodejs`, `typescript`, `java`, `bash`, `batch`) and switch
  into it. Example: `/new inventory-api python`
- `/create <path> <description>` — generate a new file at an exact
  path. Example: `/create src/parser.cpp a CSV line parser`
- `/edit <description>` — rewrite the file currently open in the
  editor.
- `/restore <path> [N]` — undo an AI edit. `N` picks how far back
  (1 = most recent, the default).
- `/status` — a quick summary of the current project.
- `/boudica-key <key>` — manually set your Boudica API key for this
  browser. Rarely needed — Boudica Code tries to connect
  automatically using your Nextcloud identity first.
- `/help` — lists all of this again, in the chat panel itself.

Every AI request shows a live "On it — ..." style message while it's
working, and finishes as a color-coded result: green for success, red
for a real failure, amber for something worth double-checking (like a
guessed project stack). Errors anywhere in the app — not just chat —
now surface here too, so a failed action is never silent.

While a request is working, a `Stop` button appears next to Send if
you want to cancel it — cancelling shows up as a plain "Cancelled.",
not an error. If a request genuinely fails, its message gets an inline
`Retry` button instead of making you retype the whole thing.

### Editing safely

Every time Boudica edits a file that already exists, the *previous*
version is backed up automatically first — you don't have to ask.
`/restore <path>` (or right-click the file → **Restore previous
version…**) brings it back if the edit went the wrong way. Nothing is
ever silently, permanently overwritten.

The success message for an edit also shows a compact diff — how many
lines were added/removed, and up to 40 of the actual changed lines —
so you can see what changed without having to go dig up the backup
first.

Boudica Code also won't let unsaved work disappear quietly: closing a
tab, or switching projects, with unsaved changes open asks for
confirmation first instead of just discarding them.

### Checking and building your code

The `▶ Check` button (next to the tabs) sends whatever file is open to
be checked. What actually happens depends on the file type:

- **Python, C/C++, Java, TypeScript** — a real compile/build (bytecode
  for Python and Java, an object file for C/C++, transpiled JS for
  TypeScript). Catches more than a plain syntax check would.
- **JavaScript, Bash** — a syntax check.
- **C/C++ headers (`.h`/`.hpp`)** — a syntax/type check (a header on
  its own isn't something that gets built the way a `.cpp` file does).
- **Windows Batch (`.bat`/`.cmd`)** — not supported yet.

None of this ever runs your code — it only parses or compiles it.
Actually running or testing your program isn't supported in-browser
yet; download the project and do that in your own environment for now
(see *Known issues* below).

### C++ header/implementation pairs

Ask for a new `.cpp` file in a C++ project (e.g. *"build a
BankAccount class with deposit and withdraw"*) and Boudica Code
generates the header first, then writes the implementation to match
it exactly — the same two-file pattern you'd write by hand, done in
one request. This is specific to C++ for now; other stacks generate a
single file per request.

---

## Project management

### Creating a project

Either:

- The **`+ New Project`** button in the editor toolbar — opens a
  dialog for the name, stack, and (via Nextcloud's own folder picker)
  where it should live, or
- `/new <name> <stack>` in chat — always creates at the top level of
  your storage.

Either way, the new project is scaffolded with a sensible starting
structure for its stack (a `CMakeLists.txt` for C++, `package.json`
for Node/TypeScript, etc.), a `.gitignore`, a `README.md`, and a small
`.boudica_project.json` marker file Boudica Code uses to remember the
project's name and stack later.

### Switching, renaming, and deleting projects

Click the project name at the very top of the screen. The dropdown
lists every project Boudica Code recognizes in your account (anything
with that `.boudica_project.json` marker), plus **🏠 Home (no
project)** to step back out to your Nextcloud storage's real top
level — useful if you want to browse or manage files outside any
particular project.

Hover a project in that dropdown for two more actions: a pencil icon to
**rename** it, and a trash icon to **delete** it, along with
everything inside — this can't be undone, so it asks for confirmation
first. Switching to a different project with unsaved changes open
asks too, since the tabs you have open get cleared; renaming the
project you're currently in doesn't have that problem — your open
tabs stay exactly where they were.

### Managing files

Right-click anything in the file tree for **Rename, Cut, Copy, Paste,
Download, Delete**, and — on files — **Restore previous version…**.
Paste behaves like a desktop file manager: drop it on a folder and it
goes inside; drop it on empty space and it lands in the current
directory. Renaming or moving a file that's currently open in the
editor keeps its tab open at the new path — nothing gets orphaned.
The toolbar above the tree also has quick buttons for new
files/folders, refreshing, and zipping the whole project for download.

### Finding things

The 🔍 button in the file tree's toolbar opens a search box that greps
every file in the current project for a piece of text (case-
insensitive). Results show the file, line number, and a snippet of
that line — click one to open the file with the cursor already on
that line. It needs a project open: searching from **🏠 Home** would
mean scanning your entire Nextcloud storage rather than one project,
so that's blocked.

### Recovering from a bad edit

Covered above under *Editing safely* — worth repeating here since it's
squarely a project-management concern: `/restore <path> [N]` or the
file tree's right-click menu, any time an AI edit isn't what you
wanted.

---

## Known issues

Some of these are deliberate scope decisions, not bugs — noted where
that's the case.

- **No "Run" or "Test" button.** *Deliberate, for now.* The `▶ Check`
  button verifies your code compiles/parses (and for some stacks does
  a real build) — it never executes it. Actually running or testing
  code means executing arbitrary code safely, which needs a properly
  sandboxed environment; that's planned as its own dedicated piece of
  infrastructure rather than something added to the check button.
- **No git integration.** *Deliberate, for now.* Projects scaffold
  with a `.gitignore`, but there's no `init`/`commit`/`push` from
  within the app.
- **Multi-file generation is C++-only.** Header/implementation pairs
  work for C++; every other stack generates one file per request.
- **One active project at a time.** There's no split view across two
  projects simultaneously — switching projects replaces what the file
  tree and editor are pointed at.
- **Find in files reads every file in the project, one at a time.**
  Fine for a small scripting project; a very large one will take
  longer to search. Binary-looking files (images, archives, etc.) are
  skipped automatically.
- **External content in the editor (like this page, if it's ever
  pointed at an outside site) depends on that site's own CORS
  settings.** Content bundled inside Boudica Code itself, like this
  guide, doesn't have this limitation.
- **Auto-connecting to Boudica depends on your Nextcloud identity
  matching an existing Boudica account**, or successfully signing up
  for a new one automatically on first use. If that fails, `/boudica-key`
  is the manual fallback.
- **Very large accounts may make project-switching slightly slower** —
  the switcher checks each top-level folder in your storage for a
  Boudica Code project marker, which scales with how much you keep at
  the top level of your account.

If something here doesn't match what you're actually seeing, that's
worth reporting — this guide describes the app as built, not as
planned.
