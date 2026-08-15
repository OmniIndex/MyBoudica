# Boudica Agents (Nextcloud app)

Lets a Nextcloud user browse shared (admin-created) Boudica agents and
build/edit/delete/run their own private multi-step agent flows —
ported from the uploaded `agents-ui.js` (the agents overlay from the
main Boudica web app), restructured into a standalone Nextcloud app
following the same conventions as `boudicacode`/`boudicadashboard`.

## What's a straight port vs. what changed

**Straight port:** tile rendering (shared + private grids), the step
builder (service picker with the `db:`/custom suffix handling,
depends-on and loop-over step wiring, add/remove step rows), save,
delete. All DOM/logic from `agents-ui.js` for these carried over
essentially unchanged.

**Changed — auth.** The original authenticates via same-origin
session cookies (`credentials: 'same-origin'`, `/agents/list?user_id=...`
with no key at all) — that only works because the original runs on
the same origin as the Boudica backend. Running inside Nextcloud
(`myboudica.com` calling `boudi.ca`) is cross-origin, so this instead
follows the **confirmed** convention from `boudicadashboard`'s
`/dashboard/*_individual` endpoints: `user_id` + `api_key` sent
explicitly with every call (`agentAuth.js` — identical auto-signup
mechanism to `boudicaAuth.js`/`dashboardAuth.js`, sharing the same
`boudica_session` localStorage key across all three apps).

**⚠️ Not yet confirmed against the real backend — check before relying on this:**
- `agents/list` is a `GET` in the original; here `api_key` is sent as
  a query param alongside `user_id` (`agentApi.js`'s `listAgents()`).
  Whether that endpoint actually reads an `api_key` query param at
  all is unverified — the original never sent one, relying entirely
  on the cookie session instead.
- `agents/user/save` / `agents/user/delete` are POSTs with a JSON
  body in the original; `api_key` is just added into that same body,
  which matches the dashboard app's confirmed pattern exactly, but
  hasn't specifically been tested against these two endpoints.
- Given the CORS issues hit getting the dashboard app working
  (`boudica_admin`'s `OPTIONS` handling, then the CORS header
  allow-list), expect to hit similar preflight issues here the first
  time these calls actually run — same debugging approach (check
  `OPTIONS` response status first, then headers) should apply.

**Changed — running an agent.** The original doesn't call a "run"
endpoint at all: `runAgent()` just writes `@agentname text` into the
host page's `#chatInput` and clicks `#sendBtn`, letting that page's
existing chat pipeline (outside `agents-ui.js` entirely) do the actual
work. This app has no host chat page, so `agentApi.js`'s `runAgent()`
instead POSTs directly to `/chat` (ported from `boudicaApi.js`'s
`send()` — same body shape: `prompt`, `session_id`, `user_id`,
`api_key`, etc.) with that same `@agentname text` convention, and the
plain-text response renders in an inline result panel
(`#agentRunResultPanel`) instead of a chat transcript. This assumes
the `/chat` endpoint's `@agentname` parsing works the same way
regardless of caller — should hold if it's the same backend logic the
original relied on, but hasn't been tested from this app specifically.

## Structure

```
boudicaagent/
├── appinfo/{info.xml, routes.php}
├── lib/{AppInfo/Application.php, Controller/PageController.php}
├── templates/main.php       # tile view, builder panel, input dialog, run-result panel
├── css/style.css            # reuses the same :root tokens as boudicadashboard/admin.css
├── img/app.svg
└── js/src/
    ├── core/{agentAuth.js, agentApi.js}
    └── agent/agentManager.js
    └── main.js
```

## Installing for local testing

```
cp -r boudicaagent /path/to/nextcloud/apps/
occ app:enable boudicaagent
```
