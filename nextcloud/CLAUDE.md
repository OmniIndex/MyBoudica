# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

This repo is a collection of **four independent Nextcloud apps**, each
deployed by copying its folder into a Nextcloud installation's `apps/`
directory and running `occ app:enable <app-id>`. There is no shared
build system, root package.json, or root composer.json — every app is
self-contained and versioned independently via its own
`appinfo/info.xml`.

| App | ID | Purpose |
|---|---|---|
| `boudicaai/` | `boudicaai` | The "real" app: Nextcloud Talk bot integration (chat with Boudica inside a Talk call), call recording/transcription, transcript email digests. Vue 3 + Vite frontend, full PHP backend with migrations/background jobs/console commands. |
| `boudicacode/` | `boudicacode` | Standalone three-pane VS Code-style workspace (file tree / Monaco editor / chat) backed by Nextcloud WebDAV. Plain JS, no build step. |
| `boudicadashboard/` | `boudicadashboard` | Shows the logged-in user's own Boudica usage stats (prompt counts, timeline chart via Chart.js, flagged prompts). Plain JS, no build step. |
| `boudicaagent/` | `boudicaagent` | Lets a user browse shared agents and build/run their own private multi-step Boudica agent flows. Plain JS, no build step. |

`boudicacode`, `boudicadashboard`, and `boudicaagent` were all ported
from the same uploaded admin-portal/production-frontend JS
(`agents-ui.js`, `dashboard.js`, `chat-api.js`, `saml-auth.js`) and
deliberately follow shared conventions with each other (see
"Cross-app conventions" below). `boudicaai` predates that porting
effort and is a different, more conventional Nextcloud app skeleton
(generated from Nextcloud's app template) — don't assume patterns
from one family apply to the other without checking.

Each app's own README.md has far more detail (auth assumptions,
confirmed-vs-unconfirmed backend endpoints, known gaps) than is
repeated here — **read the relevant app's README before making
non-trivial changes to it.**

## Commands

### boudicaai (the only app with a build/lint/test pipeline)

```bash
cd boudicaai
npm install               # installs Vue/Vite/TS toolchain
npm run build              # vite build -> production JS/CSS
npm run watch               # vite build --watch, for local dev
npm run lint                 # eslint src
npm run stylelint             # stylelint src/**/*.{vue,scss,css}
./build.sh                     # same as `vite build`, with NODE_OPTIONS cleared

composer install                # PHP deps + composer-bin-plugin tool installs
composer lint                    # php -l over lib/ (excludes vendor)
composer cs:check / cs:fix        # php-cs-fixer (see .php-cs-fixer.dist.php)
composer psalm                     # static analysis (psalm.xml, errorLevel=1)
composer test:unit                  # phpunit tests -c tests/phpunit.xml
composer rector                      # rector.php automated refactors, then cs:fix
composer openapi                      # regenerate openapi.json
```

Run a single PHPUnit test:
```bash
cd boudicaai
vendor/bin/phpunit tests -c tests/phpunit.xml --filter testIndex
```

Node version is pinned via `.nvmrc` (`20`). Target PHP is `8.1`
(`composer.json` `platform.php`, `psalm.xml` `phpVersion`).

### boudicacode / boudicadashboard / boudicaagent

No build step, no test suite, no linter — these are classic
(non-module, non-bundled) scripts loaded individually in dependency
order via `script()`/`style()` calls in each app's
`templates/main.php`. **When adding a new JS file to one of these
apps, you must also add a corresponding `script(...)` line to that
app's `templates/main.php`, in the correct load-order position**
(dependencies before dependents — see e.g. `boudicacode/templates/main.php`
where `eventBus`/`state`/`webdavClient` load before anything that
uses them, and `main.js` always loads last).

Local install/test loop for any of the four apps:
```bash
cp -r <appdir> /path/to/nextcloud/apps/<app-id>
occ app:enable <app-id>
```

## Cross-app conventions (boudicacode / boudicadashboard / boudicaagent)

These three apps share a deliberate architecture, ported from the
same source material, and new code in any of them should match it
rather than reinvent it:

- **No PHP proxy for AI/data calls.** Each app's PHP side is
  deliberately thin — it mounts the page shell (`page#index`) and, at
  most, serves a few vendored/static assets (Monaco's asset server in
  `boudicacode`, none in the others). All actual Boudica API calls
  (chat, agents, dashboard stats) go **directly from the browser** to
  the external Boudica backend (seen as both `https://boudi.ca` and
  `https://myboudica.com` across READMEs/code — check which the
  target deployment actually uses before assuming). This is
  cross-origin from the Nextcloud host, so Apache-level CORS headers
  and Nextcloud's CSP `connect-src` (and `frame-src` for any iframes)
  must allow the Boudica origin — see `boudicacode/README.md`'s INFRA
  section for the exact `Header edit Content-Security-Policy` pattern
  when debugging a silently-failing `fetch()`.
- **Auth: shared auto-signup, not Nextcloud credentials.** Every app
  has its own `*Auth.js` (`boudicaAuth.js`, `dashboardAuth.js`,
  `agentAuth.js`) that, on first load, POSTs the current Nextcloud
  user's identity to `/api/boudica/beta/signup` to get a Boudica API
  key, then caches `{ user_id, api_key, ... }` under the **same**
  `boudica_session` localStorage key across all three apps — so a
  user who's already used one of these apps in a given browser is
  auto-authenticated in the others with no extra signup call. Every
  subsequent API call sends `user_id` + `api_key` explicitly (in the
  JSON body for POSTs, as query params for the few GETs) — never an
  `Authorization` header.
- **Shared global namespace, IIFE modules.** Every JS file is a
  classic `(function (global) { ... })(window)` IIFE that reads its
  dependencies off and attaches its own exports to a shared
  `window.BoudicaCode` namespace object (yes, `boudicadashboard` and
  `boudicaagent` also use the literal name `BoudicaCode` for this
  namespace — kept as-is from the port for cross-app compatibility
  described in `boudicadashboard/README.md`'s "Tight integration"
  section). `main.js` boots the app on `DOMContentLoaded` and must be
  the last script loaded.
- **CSS tokens.** `style.css` in each app reuses the same `:root`
  custom-property tokens as `boudicadashboard/admin.css` for visual
  consistency — check existing tokens before inventing new ones.
- **Confirmed vs. assumed backend behavior.** Several endpoints in
  these apps (e.g. `boudicadashboard`'s `*_individual` stats
  endpoints, `boudicaagent`'s `agents/list`) are marked in their
  READMEs as unconfirmed against the real backend — they follow a
  naming/shape convention by inference, not verification. Treat these
  call sites as more likely to need adjustment than code marked
  "confirmed."

## boudicaai architecture notes

- **Talk bot integration.** `lib/Listener/TalkBotInvokeListener.php`
  handles `OCA\Talk\Events\BotInvokeEvent` (registered in
  `lib/AppInfo/Application.php`) — this is how Boudica responds inside
  a Nextcloud Talk conversation. `lib/Service/BoudicaService.php` is
  the actual backend client: builds a prompt (with a per-session
  rolling history capped at 6 messages, cached via `ICacheFactory`
  distributed cache, 6h TTL), POSTs it to the configured
  `api_endpoint` with `api_key`/`user_id` read from Nextcloud
  `IConfig` app values (set via the admin settings UI,
  `lib/Settings/AdminSettings.php`), and returns the response text.
  `lib/Listener/CallRecordingListener.php` hooks
  `CallStartedEvent`/`CallEndedEvent` for recording-driven
  transcription (`lib/Service/TranscriptionService.php`,
  `MjrAudioExtractor.php`, `JanusRecordingMonitor.php`) feeding into
  `TranscriptCleanupService.php` and `TranscriptEmailService.php` (the
  "Talk Digest" nav entry / `DigestPollJob` background job /
  `DigestController`).
- **There are multiple numbered/suffixed backup copies of some
  listener files** (`TalkBotInvokeListener_072726.php`,
  `TalkBotInvokeListener_0727_b.php`, `CallRecordingListener_orig.php`)
  sitting alongside the live ones. Only `TalkBotInvokeListener.php`
  and `CallRecordingListener.php` (no suffix) are wired up in
  `Application.php`'s `register()` — treat the suffixed files as
  historical snapshots, not live code, and don't edit them expecting
  effect.
- **Migrations are numbered sequentially** in
  `lib/Migration/Version0000NN...php` — add new schema changes as the
  next number, following the existing `VersionNNNNNNDateYYYYMMDDHHMMSS`
  naming.
- Frontend (`src/`) is a standard Vue 3 + `<script setup lang="ts">` +
  CSS-modules app (`App.vue` shell with sidebar nav switching between
  `ChatView`/`DocumentsView`/`EmailsView`/`CalendarView`/`SettingsView`),
  built by `@nextcloud/vite-config`'s `createAppConfig`. Per
  `UI_SETUP.md`, several of these views are UI-only scaffolding with
  `// TODO: Send to backend API` markers — not wired to
  `ApiController.php` yet. Verify a view is actually backed before
  assuming it does what it visually implies.
