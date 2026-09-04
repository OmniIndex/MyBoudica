# Boudica-Nextcloud-Collabora integration

Nextcloud + Collabora Online + Talk (calls/recording/transcription) with
Boudica AI wired into all three surfaces: Files (`boudicaai`'s Collabora
widget + the Talk bot), Talk itself (call recording → transcript → email
digest), and the app's own UI (`boudicaai`, plus `boudicaagent`/`boudicacode`/
`boudicadashboard`). Previously this ran hand-built across 6 servers (see
`RUNBOOK.md`) - this is that same stack, containerized.

**Nextcloud is the single front door for the whole system.** This stack
shares its Postgres and Whisper with `boudica_slm`'s own
`product_templates/multiuser` product (a separate repo) rather than running
its own - see "Requires boudica_slm running first" below - and nginx
proxies `/api/boudica/` straight through to it on the same domain, so the
four Boudica apps' default inference endpoint is local by default, not the
external `boudi.ca` SaaS.

## Requirements

- Docker Engine + the `docker compose` v2 plugin + `openssl`.
- **`boudica_slm`'s own `product_templates/multiuser` stack already running
  on this same box** (or reachable on the same Docker host) - it provides
  the shared Postgres, Whisper, and the inference API itself. `setup.sh`
  checks for this and refuses to continue if it can't reach it.
- 8GB+ RAM recommended for this stack's own pieces (Nextcloud + Collabora +
  Janus + signaling) on top of whatever `boudica_slm` itself needs.
- DNS: three A-records pointed at this box - your main domain,
  `talk.<domain>`, and `whiteboard.<domain>`.

## Install

```
./setup.sh
```

You'll be asked for: your domain, Nextcloud admin username, ports, the
Boudica inference API endpoint (defaults to the co-located `boudica_slm`
instance - see above), this box's public IP (for TURN), an optional SMTP
relay, and a Whisper model preference (informational only now - the actual
model size is whatever `boudica_slm`'s own shared Whisper was built with).
You'll also be asked for **`boudica_slm`'s own `BOUDICA_DBA_PASSWORD`**
(found in its `.env`, not this stack's) - needed once, to create this
stack's `nextcloud` database/role in the shared Postgres instance - and
**`boudica_slm`'s own `KEYCLOAK_ADMIN_PASSWORD`** plus its public
`KEYCLOAK_URL`, needed to register this stack's own Keycloak client for
"Sign in with Boudica" (see below). Both are genuinely separate product's
secrets; the script can't derive them on its own, so these are deliberate
prompts, not an oversight.

This:

1. Ensures the `boudica_shared` Docker network exists (joins whichever
   product created it first) and confirms `boudica_slm`'s stack is
   actually reachable on it.
2. Generates all secrets fresh (`.env`) - DB/Redis passwords, Talk/TURN/
   Janus shared secrets, Nextcloud admin password.
3. Renders every service's config from its template into `generated/`
   (`__PLACEHOLDER__` substitution, same convention as
   `boudica_slm/product_templates/multiuser`), including a self-signed TLS
   certificate covering all three domain names (no public CA/DNS
   dependency - works on a LAN/trial box with no real domain; a real
   deployment can drop actual CA-signed certs into the same paths instead).
4. Creates this stack's `nextcloud` database/role in the shared Postgres,
   and a `boudica-nextcloud` OIDC client in the shared Keycloak realm for
   "Sign in with Boudica" (both idempotent - safe to re-run).
5. Builds every image locally (no pushed registry images for this stack
   yet) and starts everything.
6. Runs one-time post-install `occ` steps: enables all four Boudica apps,
   installs Nextcloud's own Talk app (not bundled by default), points
   `boudicaai` at the shared Whisper, the Boudica API endpoint, and the
   shared Keycloak, fixes richdocuments' Collabora URL, and registers
   Talk's signaling/STUN/TURN servers - no admin-UI-only steps remain,
   everything is scripted.

## Self-service registration ("Sign in with Boudica")

Nextcloud's own login page gets a second option, "Sign in with Boudica",
alongside the normal local-account form the setup.sh-created admin user
keeps using. It routes through the **exact same** Keycloak
self-registration + domain/seat provisioning already live for the
standalone chat interface (`boudislm.provision_user()`,
`/cgi-bin/provision_check`) - no separate gating logic, no code changes to
that C++/SQL side. Implemented in `boudicaai`'s `KeycloakLoginController`/
`KeycloakProvisioningService` (`nextcloud/boudicaai/lib/`).

Three outcomes, verified live end-to-end:

- **Email domain has purchased Boudica access, with a free seat**
  (`boudislm.valid_domains` has a matching, non-full row): a real Nextcloud
  account is created (or reused) and the person is logged straight in as
  part of that domain - a `valid_users` row is inserted and the domain's
  seat count increments.
- **Email domain has purchased access, but all seats are taken**
  (`seat_limit_reached`): a clear "All seats for your organisation are
  taken..." page is shown, no Nextcloud account is created, no login
  happens.
- **Email domain has no purchased access at all** (`domain_not_found`):
  the person is still logged into Nextcloud (not turned away) - but via
  the existing anonymous `/beta/signup` endpoint instead, which mints a
  separate, rate-limited API key with no domain-seat accounting involved.

All three apps' Boudica credential (`boudicaagent`/`boudicacode`/
`boudicadashboard`) is provisioned automatically as part of either
successful path - no manual "paste your API key" step, the existing
`localStorage['boudica_session']` mechanism those apps' own `*Auth.js`
files already use is pre-seeded server-side from the account's
`boudicaai`/`boudica_api_key` preference.

Safe to re-run for config changes (e.g. changing the inference endpoint) -
regenerates `generated/` each time and re-applies the post-install `occ`
steps.

## Sovereign/on-prem vs. pointing at the SaaS

All four Boudica apps, the Collabora widget, and Nextcloud's CSP all share
**one** admin-configured endpoint (`boudicaai`'s `api_endpoint` setting) -
change it once (Settings → Administration → Boudica AI, or
`occ config:app:set boudicaai api_endpoint --value=...`) and every surface
follows, no per-app configuration and no code changes. Defaults to the
co-located `boudica_slm` instance via the same-domain `/api/boudica/` path;
point it at the external `boudi.ca` SaaS or a split-out deployment instead
if that's what a given install actually needs.

## Single box vs. split across servers

- **Postgres/Whisper**: already shared with `boudica_slm` rather than
  bundled - splitting either onto its own box is a `boudica_slm`-side
  change (this stack just needs `boudica_shared` to still resolve them).
- **TURN (`eturnal`)**: the piece most likely to need its own box first
  under real call volume (needs a wide open UDP relay port range) - run it
  separately, point `janus`'s and `signaling`'s configs at its real
  address instead of the bundled container's.
- **Collabora/Janus**: the two most CPU/RAM-heavy pieces in *this* stack
  under real load - split onto their own box the same way.

## What's genuinely custom here vs. stock

Only the Nextcloud and Collabora images have real custom layers (see their
`Dockerfile` comments for exactly why - both exist specifically to fix a
documented "worked, then vanished after a restart" class of bug from the
native deployment: ffmpeg/`janus-pp-rec`/the CSP header rule, and the
Collabora widget injection, respectively). Everything else is either an
official upstream image (Redis, eturnal, Whiteboard, nginx) or a
vendored-but-unmodified build (Janus) / vendored-with-one-sed-insertion build
(the signaling server - see `vendor/nextcloud-spreed-signaling/VENDOR_PIN.md`).

## Known gaps

- `boudicaai`'s legacy JS/CSS (extracted from the live server into
  `nextcloud/boudicaai/js`+`css` - see that app's own history) has no
  buildable source anywhere - treat it as a checked-in binary-ish artifact
  until someone recovers/rewrites the real source.
- TLS: self-signed by default (see Install above); real CA cert acquisition
  is a manual step (drop `fullchain.pem`/`privkey.pem` into
  `generated/nginx/certs/<name>/` per name) - no Certbot/ACME automation.
- No backup mechanism for the shared Postgres volume - `boudica_slm`'s own
  Postgres had none either before this merge (see that project's own docs).
- The `nextcloud` Postgres role is granted `CREATEROLE`+`CREATEDB` (needed
  for Nextcloud's own installer to create its `oc_admin` sub-role on a
  fresh install) but never locked back down afterward - `boudica_slm`'s own
  `boudislm` role gets exactly this treatment via a dedicated lockdown
  script; this stack doesn't have an equivalent yet.
- Keycloak-provisioned Nextcloud accounts get a real local password (an
  HMAC of the uid under a per-install secret, `boudicaai`'s own
  `sso_secret` app config, generated on first use) - it's never seen or
  typed by the person (they always log in via the Keycloak button, which
  calls `\OC\User\Session::login()` + `createSessionToken()` directly), but
  it does mean `occ user:resetpassword` or Nextcloud's own "forgot
  password" flow would work against these accounts too if someone tried -
  harmless in practice (nothing depends on that not being possible) but
  worth knowing it's not truly passwordless at the storage layer.
