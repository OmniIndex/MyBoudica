# Boudica Dashboard (Nextcloud app)

A Nextcloud app that shows the logged-in user's own Boudica usage:
total prompts, prompts today, average response time, a 30-day usage
timeline chart, their most-asked prompts, and any of their prompts
that were flagged as a security risk.

Ported from the uploaded admin-portal `dashboard.js` / `dashboard.css`,
restructured to Nextcloud's classic-script app-loading convention
(same pattern as the existing `boudicacode` app: `script()`/`style()`
calls in `templates/main.php`, everything hung off a shared
`window.BoudicaCode` namespace).

## Scope: single user, not cross-user admin data

Unlike the original admin portal (which showed all users on a
domain), this app shows **only the current Nextcloud user's own
data**. That's enforced **server-side**, by the `/dashboard/*_individual`
endpoints on `https://boudi.ca`'s main API app (`boudica_cgi`) — each
one takes `{ user_id, api_key }` in a JSON POST body and scopes its
response to that identity. This app does not do any of that scoping
itself; it just resolves and sends the current Nextcloud user's
Boudica credentials with every call.

Note: these dashboard endpoints live on the **main API app**
(`/api/boudica`, same `boudica_cgi` binary `boudicacode` already
calls), not the separate admin CGI (`/cgi-bin/boudica_admin`) — that
was tried first and hit CORS/preflight issues specific to that
binary's auth flow, so the endpoints were moved to the main API app
instead.

Because of the single-user scope, two things from the original were
dropped as not applicable:
- The **Total Users** stat card
- The **Top Users** bar chart (and its `/dashboard/user_usage` call)

`Utils` (a bare global the original `dashboard.js` assumed existed)
wasn't in what was provided, so this includes a minimal
implementation:
- `js/src/core/dashboardUtils.js` — `formatNumber`, `formatDate`,
  a `showToast` that uses Nextcloud's own `OC.Notification` when
  available.
- `js/src/core/dashboardAuth.js` — ported directly from `boudicacode`'s
  `boudicaAuth.js` (identical signup-via-NC-identity flow, same
  `https://boudi.ca/api/boudica/beta/signup` endpoint). Reuses the
  same `boudica_session` localStorage key as `boudicacode`, so if
  that app is also installed, both share one signed-up session rather
  than signing up twice.
- `js/src/core/dashboardApi.js` — implements `API.post(path, extraBody?)`
  against `https://boudi.ca/api/boudica`, POSTing
  `{ user_id, api_key, ...extraBody }` as JSON (no Authorization
  header — this API takes credentials in the body, not as a Bearer
  token) and returning the parsed JSON response.

**Confirmed vs. assumed endpoint names:** only
`/dashboard/overall_usage_individual` has been confirmed against the
real backend. The other three —
`/dashboard/most_prompted_individual`,
`/dashboard/security_risks_individual`,
`/dashboard/usage_timeline_individual` — follow that same `_individual`
suffix convention by assumption (`dashboardManager.js` calls them via
`API.post`). Confirm these against the actual backend before relying
on this in production; `usage_timeline_individual` in particular now
sends `days: 30` in the POST body rather than as a `?days=30` query
param, since the whole API moved from GET+query-string to POST+JSON-body.

**CORS:** `/api/boudica` (the alias these calls hit) is inside the
Apache `<Directory /usr/lib/cgi-bin>` block that already sets
`Access-Control-Allow-Origin: *`, `Access-Control-Allow-Methods:
POST, GET, OPTIONS, DELETE`, and `Access-Control-Allow-Headers:
Content-Type, Authorization` — `Content-Type: application/json` (sent
by every call here) is already covered, and no `Authorization` header
is sent anymore, so no CORS config changes should be needed for this
endpoint specifically.

## Integrating with the `myboudica` app

The `myboudica` app's own source wasn't provided, so this ships as a
**standalone Nextcloud app** with its own nav entry
(`boudicadashboard.page.index`), rather than being wired directly into
`myboudica`'s startup. Two ways to connect them once you share that
app's structure:

1. **Loose integration (works today):** have `myboudica`'s UI link to
   this app's route (`/apps/boudicadashboard/`) — no code sharing
   needed.
2. **Tight integration:** if `myboudica` also uses a shared
   `window.BoudicaCode` namespace and loads scripts the same way, its
   startup code could call
   `BoudicaCode.dashboardManager = new BoudicaCode.DashboardManager(); BoudicaCode.dashboardManager.loadDashboard();`
   directly into a container it owns, instead of (or alongside) this
   app's own page. That needs `myboudica`'s `templates/main.php` (or
   equivalent) to load this app's `vendor/chart.umd.min.js`,
   `dashboardUtils.js`, `dashboardAuth.js`, `dashboardApi.js`, and
   `dashboardManager.js` in that order, and a container with the same
   element IDs this template uses
   (`totalPrompts`, `promptsToday`, `avgResponseTime`,
   `usageTimelineChart`, `mostPromptedList`, `securityRisksList`,
   `refreshDashboard`). Send over `myboudica`'s source and I can wire
   this in directly rather than leaving it as a separate app.

## Structure

```
boudicadashboard/
├── appinfo/
│   ├── info.xml          # app metadata, nav entry
│   └── routes.php        # single page#index route
├── lib/
│   ├── AppInfo/Application.php
│   └── Controller/PageController.php
├── templates/main.php    # shell + script()/style() load order
├── css/style.css         # dashboard.css + needed :root vars + new chrome
├── img/app.svg
└── js/
    ├── vendor/chart.umd.min.js   # Chart.js 4.5.1, vendored
    └── src/
        ├── core/
        │   ├── dashboardUtils.js
        │   ├── dashboardAuth.js
        │   └── dashboardApi.js
        ├── dashboard/dashboardManager.js
        └── main.js
```

## Installing for local testing

```
cp -r boudicadashboard /path/to/nextcloud/apps/
occ app:enable boudicadashboard
```
