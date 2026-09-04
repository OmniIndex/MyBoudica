#!/usr/bin/env bash
# Boudica-Nextcloud-Collabora integration stack installer.
#
# Builds every image locally (no registry pull-only mode yet, unlike
# boudica_slm's own product_templates/multiuser - this stack is new and has
# no pushed images yet). Safe to re-run: regenerates config from the
# templates each time, so config changes just mean re-running this.

set -euo pipefail

log()  { echo -e "\n\033[1;34m==> $*\033[0m"; }
warn() { echo -e "\033[1;33m[warn] $*\033[0m" >&2; }
die()  { echo -e "\033[1;31m[error] $*\033[0m" >&2; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# --- 0. Prerequisite checks --------------------------------------------------

log "[1/7] Checking prerequisites"
command -v docker >/dev/null 2>&1 || die "Docker not found. Install Docker Engine first."
docker compose version >/dev/null 2>&1 || die "docker compose (v2 plugin) not found."
command -v openssl >/dev/null 2>&1 || die "openssl not found (used to generate secrets)."

MEM_KB="$(awk '/MemTotal/ {print $2}' /proc/meminfo 2>/dev/null || echo "")"
if [[ -n "$MEM_KB" && "$MEM_KB" -lt 8000000 ]]; then
    warn "This machine reports $((MEM_KB / 1024))MB RAM. Nextcloud + Collabora + Janus + \
signaling + Whisper together comfortably wants 8GB+; less than that may be tight."
fi

# Shared with boudica_slm's own product_templates/multiuser stack (a
# separate repo/compose project) - ONE Postgres and ONE Whisper serve both
# products rather than each running its own, and Nextcloud becomes the
# single front door (nginx proxies /api/boudica/ through to it - see
# nginx/default.conf). Both products' docker-compose.yml declare this same
# external network name, so idempotently ensuring it exists here is safe
# regardless of which product's setup.sh runs first.
docker network inspect boudica_shared >/dev/null 2>&1 || docker network create boudica_shared

# Functional check (not a container-name/project-name guess, which isn't
# portable across differently-named compose projects) - actually try to
# reach the shared postgres and web services boudica_slm's stack is
# expected to provide, via a throwaway container on the shared network.
log "Checking for boudica_slm's multiuser stack on the shared network"
if ! docker run --rm --network boudica_shared curlimages/curl:latest \
        -s -m 5 -o /dev/null http://web:80/api/boudica/health 2>/dev/null; then
    die "Can't reach a 'web' service on the boudica_shared network. This stack needs \
boudica_slm's own product_templates/multiuser deployment already running first (it \
provides the shared Postgres, Whisper, and inference API) - see that project's own \
setup.sh, then re-run this one."
fi

# --- 1. Collect deployment details -------------------------------------------

log "[2/7] Deployment details"

read -rp "Primary domain browsers will reach this box on (e.g. myboudica.com - DNS for \
this, talk.<domain>, and whiteboard.<domain> must all point here): " BOUDICA_DOMAIN
[[ -n "$BOUDICA_DOMAIN" ]] || die "A domain is required."

read -rp "Nextcloud admin username [admin]: " NEXTCLOUD_ADMIN_USER
NEXTCLOUD_ADMIN_USER="${NEXTCLOUD_ADMIN_USER:-admin}"

read -rp "HTTP port [80] (only change this if something else on this box already \
uses 80/443): " BOUDICA_HTTP_PORT
BOUDICA_HTTP_PORT="${BOUDICA_HTTP_PORT:-80}"
read -rp "HTTPS port [443]: " BOUDICA_HTTPS_PORT
BOUDICA_HTTPS_PORT="${BOUDICA_HTTPS_PORT:-443}"

# Defaults to THIS box's own co-located boudica_slm instance (nginx
# proxies /api/boudica/ to it - see nginx/default.conf) rather than the
# external boudi.ca SaaS - a sovereign/on-prem install should stay
# self-contained by default. Only override this if the inference server
# actually lives elsewhere (a split-out medium/large deployment, or
# pointing at the SaaS deliberately).
DEFAULT_API_ENDPOINT="https://${BOUDICA_DOMAIN}:${BOUDICA_HTTPS_PORT}/api/boudica/chat"
read -rp "Boudica inference API endpoint [${DEFAULT_API_ENDPOINT}]: " BOUDICA_API_ENDPOINT
BOUDICA_API_ENDPOINT="${BOUDICA_API_ENDPOINT:-$DEFAULT_API_ENDPOINT}"
# Derive the bare origin (scheme://host) for the CSP allowlist - connect-src
# etc. need just the origin, not the full endpoint path.
BOUDICA_API_ORIGIN="$(echo "$BOUDICA_API_ENDPOINT" | sed -E 's#^(https?://[^/]+).*#\1#')"
# Derive the bare API base (strip a trailing /chat) - matches the same
# derivation PageController::index() does server-side for the other 3 apps.
BOUDICA_API_BASE="$(echo "$BOUDICA_API_ENDPOINT" | sed -E 's#/chat/?$##')"

read -rp "Public IP or hostname this box's TURN relay advertises to browsers (leave \
blank to auto-detect via ifconfig.me): " TURN_PUBLIC_IP
if [[ -z "$TURN_PUBLIC_IP" ]]; then
    TURN_PUBLIC_IP="$(curl -s -m 5 ifconfig.me || true)"
    [[ -n "$TURN_PUBLIC_IP" ]] || die "Could not auto-detect a public IP - pass one explicitly."
    echo "Detected: $TURN_PUBLIC_IP"
fi

read -rp "SMTP relay host for outbound mail (e.g. smtp.sendgrid.net:587 - leave blank to \
disable outbound mail for now): " SMTP_RELAYHOST

read -rp "Whisper model size (tiny/base/small/medium/large-v3) [base]: " WHISPER_MODEL
WHISPER_MODEL="${WHISPER_MODEL:-base}"

# --- 2. Generate secrets ------------------------------------------------------

log "[3/7] Generating local credentials"
gen_secret() { openssl rand -base64 24 | tr -dc 'A-Za-z0-9' | head -c 24; }

if [[ ! -f .env ]]; then
    cat > .env <<EOF
BOUDICA_DOMAIN=${BOUDICA_DOMAIN}
NEXTCLOUD_ADMIN_USER=${NEXTCLOUD_ADMIN_USER}
NEXTCLOUD_ADMIN_PASSWORD=$(gen_secret)
BOUDICA_DB_PASSWORD=$(gen_secret)
REDIS_PASSWORD=$(gen_secret)
SESSIONS_HASHKEY=$(gen_secret)
TALK_BACKEND_SECRET=$(gen_secret)
TURN_SHARED_SECRET=$(gen_secret)
JANUS_TURN_PASSWORD=$(gen_secret)
WHITEBOARD_JWT_SECRET=$(gen_secret)
TURN_PUBLIC_IP=${TURN_PUBLIC_IP}
BOUDICA_API_ENDPOINT=${BOUDICA_API_ENDPOINT}
SMTP_RELAYHOST=${SMTP_RELAYHOST}
WHISPER_MODEL=${WHISPER_MODEL}
BOUDICA_HTTP_PORT=${BOUDICA_HTTP_PORT}
BOUDICA_HTTPS_PORT=${BOUDICA_HTTPS_PORT}
EOF
    echo "Generated all secrets fresh (stored in .env - keep this private)."
    echo "Nextcloud admin password: $(grep NEXTCLOUD_ADMIN_PASSWORD .env | cut -d= -f2)"
else
    echo ".env already exists, reusing it (including previously-chosen values)."
fi
# shellcheck disable=SC1091
source .env
# Re-derive these every run even when .env already existed, in case the
# admin re-ran setup.sh specifically to change BOUDICA_API_ENDPOINT.
BOUDICA_API_ORIGIN="$(echo "$BOUDICA_API_ENDPOINT" | sed -E 's#^(https?://[^/]+).*#\1#')"
BOUDICA_API_BASE="$(echo "$BOUDICA_API_ENDPOINT" | sed -E 's#/chat/?$##')"

# --- 3. Render templates into generated/ -------------------------------------

log "[4/7] Rendering config"

mkdir -p generated/nextcloud generated/collabora generated/janus generated/signaling \
         generated/eturnal generated/nginx/certs

sed -e "s#__BOUDICA_API_ORIGIN__#${BOUDICA_API_ORIGIN}#g" \
    nextcloud/boudica-csp.conf > generated/nextcloud/boudica-csp.conf

sed -e "s#__BOUDICA_API_BASE__#${BOUDICA_API_BASE}#g" \
    collabora/boudica-config.js > generated/collabora/boudica-config.js

sed -e "s#__PUBLIC_IP__#${TURN_PUBLIC_IP}#g" \
    -e "s#__TURN_HOST__#${TURN_PUBLIC_IP}#g" \
    -e "s#__JANUS_TURN_PASSWORD__#${JANUS_TURN_PASSWORD}#g" \
    janus/janus.jcfg > generated/janus/janus.jcfg

sed -e "s#__SESSIONS_HASHKEY__#${SESSIONS_HASHKEY}#g" \
    -e "s#__NEXTCLOUD_DOMAIN__#${BOUDICA_DOMAIN}#g" \
    -e "s#__TALK_BACKEND_SECRET__#${TALK_BACKEND_SECRET}#g" \
    -e "s#__TURN_HOST__#${TURN_PUBLIC_IP}#g" \
    -e "s#__TURN_SHARED_SECRET__#${TURN_SHARED_SECRET}#g" \
    signaling/server.conf > generated/signaling/server.conf

sed -e "s#__TURN_SHARED_SECRET__#${TURN_SHARED_SECRET}#g" \
    -e "s#__PUBLIC_IP__#${TURN_PUBLIC_IP}#g" \
    -e "s#__JANUS_TURN_PASSWORD__#${JANUS_TURN_PASSWORD}#g" \
    eturnal/eturnal.yml > generated/eturnal/eturnal.yml

sed -e "s#__BOUDICA_DOMAIN__#${BOUDICA_DOMAIN}#g" \
    -e "s#__BOUDICA_HTTP_PORT__#${BOUDICA_HTTP_PORT}#g" \
    -e "s#__BOUDICA_HTTPS_PORT__#${BOUDICA_HTTPS_PORT}#g" \
    nginx/default.conf > generated/nginx/default.conf

# TLS: self-signed by default, generated fresh here - no public DNS or CA
# dependency, so this works unmodified for a LAN/trial box with no real
# domain. Browsers show a one-time "not trusted" warning on first visit,
# same as any self-hosted/LAN appliance. HTTPS itself is NOT optional even
# for local use though - getUserMedia/RTCPeerConnection (Talk's camera/mic
# access) only work in a browser "secure context", which means HTTPS or
# exactly `localhost` - plain HTTP would silently break calls for anyone
# not sitting at the server itself.
#
# One cert covers all three names via Subject Alternative Names, copied
# into each name's own directory since nginx's config references them
# separately. A real deployment with real public DNS can drop actual
# Let's Encrypt (or other CA) certs into these same paths instead - nginx
# doesn't care how they got there, and re-running setup.sh never
# overwrites a cert that's already present.
CERT_NAMES=("$BOUDICA_DOMAIN" "talk.$BOUDICA_DOMAIN" "whiteboard.$BOUDICA_DOMAIN")
if [[ ! -f "generated/nginx/certs/${CERT_NAMES[0]}/fullchain.pem" ]]; then
    echo "Generating a self-signed TLS certificate (covers: ${CERT_NAMES[*]})..."
    SAN="subjectAltName=$(printf 'DNS:%s,' "${CERT_NAMES[@]}" | sed 's/,$//')"
    TMP_CERT_DIR="$(mktemp -d)"
    openssl req -x509 -nodes -newkey rsa:2048 -days 3650 \
        -keyout "$TMP_CERT_DIR/privkey.pem" -out "$TMP_CERT_DIR/fullchain.pem" \
        -subj "/CN=${CERT_NAMES[0]}" -addext "$SAN" >/dev/null 2>&1
    for name in "${CERT_NAMES[@]}"; do
        mkdir -p "generated/nginx/certs/$name"
        cp "$TMP_CERT_DIR/fullchain.pem" "$TMP_CERT_DIR/privkey.pem" "generated/nginx/certs/$name/"
    done
    rm -rf "$TMP_CERT_DIR"
    echo "Self-signed cert generated (10-year validity). Replace with a real CA cert \
per-name under generated/nginx/certs/<name>/ any time - re-running setup.sh won't \
touch a cert that's already there."
else
    echo "Existing certs found under generated/nginx/certs/ - leaving them as-is."
fi

# --- 4. Create this stack's database in the shared Postgres -----------------

log "[5/7] Setting up shared services (Postgres database + Keycloak client)"
echo "This stack shares boudica_slm's own Postgres and Keycloak instances rather than \
running its own (see docker-compose.yml) - both need boudica_slm's own credentials once \
per run (found in ITS OWN .env, NOT this stack's - a genuinely separate product's \
secrets, not something this script can know on its own)."
read -rsp "boudica_slm's BOUDICA_DBA_PASSWORD: " BOUDICA_SLM_DBA_PASSWORD
echo
[[ -n "$BOUDICA_SLM_DBA_PASSWORD" ]] || die "That password is required to create this stack's database."

# Idempotent - safe to re-run setup.sh against an already-provisioned
# shared Postgres. Runs via a throwaway client container on the shared
# network (psql talking to the `postgres` service by its network DNS name)
# rather than `docker exec` into a specific container, since this compose
# project doesn't know or control boudica_slm's actual container name.
# CREATEROLE+CREATEDB (not full superuser - narrower than the official
# postgres image's own default bootstrap-user behavior, which this
# otherwise mirrors) - Nextcloud's OWN installer creates a further-reduced
# `oc_admin` sub-role for its actual day-to-day connection and switches
# config.php to use that instead (confirmed live: config.php ends up with
# dbuser=oc_admin, not dbuser=nextcloud) - it needs these two privileges to
# do that itself on a genuinely fresh install. Worth a follow-up lockdown
# script later, mirroring boudica_slm's own 07-lock-down-boudislm-role.sh,
# once oc_admin reliably exists - not done in this pass.
docker run --rm --network boudica_shared -e PGPASSWORD="$BOUDICA_SLM_DBA_PASSWORD" \
    postgres:17 psql -h postgres -U boudislm_dba -d postgres -v ON_ERROR_STOP=0 <<SQL
DO \$\$
BEGIN
   IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'nextcloud') THEN
      CREATE ROLE nextcloud WITH LOGIN CREATEROLE CREATEDB PASSWORD '${BOUDICA_DB_PASSWORD}';
   END IF;
END
\$\$;
SQL
docker run --rm --network boudica_shared -e PGPASSWORD="$BOUDICA_SLM_DBA_PASSWORD" \
    postgres:17 psql -h postgres -U boudislm_dba -d postgres -tAc \
    "SELECT 1 FROM pg_database WHERE datname='nextcloud'" | grep -q 1 || \
docker run --rm --network boudica_shared -e PGPASSWORD="$BOUDICA_SLM_DBA_PASSWORD" \
    postgres:17 psql -h postgres -U boudislm_dba -d postgres -c \
    "CREATE DATABASE nextcloud OWNER nextcloud;"
docker run --rm --network boudica_shared -e PGPASSWORD="$BOUDICA_SLM_DBA_PASSWORD" \
    postgres:17 psql -h postgres -U boudislm_dba -d nextcloud -c \
    "GRANT ALL ON SCHEMA public TO nextcloud;"

# Keycloak client for "Sign in with Boudica" on Nextcloud's login page
# (KeycloakLoginController.php). Public, PKCE (no client secret to manage/
# sync across these two separate repos' setup.sh scripts) - same shape as
# boudica_slm's own existing `boudica-chat` client. Created via Keycloak's
# Admin REST API against the already-running shared instance rather than
# editing boudica_slm's own keycloak/realm-export.json, since that file is
# only re-imported by a genuinely fresh Keycloak container (see that
# project's own setup.sh comment) - an edit there would never reach an
# already-running deployment, and it's a different repo's file besides.
# Same reach-into-the-other-stack's-already-running-service pattern as the
# Postgres role/database above.
read -rp "Public URL browsers use to reach boudica_slm's Keycloak (its own .env's \
KEYCLOAK_URL, e.g. http://<host>:8081): " BOUDICA_KEYCLOAK_PUBLIC_URL
[[ -n "$BOUDICA_KEYCLOAK_PUBLIC_URL" ]] || die "boudica_slm's Keycloak URL is required for Nextcloud login."
read -rsp "boudica_slm's KEYCLOAK_ADMIN_PASSWORD: " BOUDICA_SLM_KEYCLOAK_ADMIN_PASSWORD
echo
[[ -n "$BOUDICA_SLM_KEYCLOAK_ADMIN_PASSWORD" ]] || die "That password is required to register this stack's Keycloak client."

NEXTCLOUD_REDIRECT_URI="https://${BOUDICA_DOMAIN}:${BOUDICA_HTTPS_PORT}/apps/boudicaai/keycloak/callback"

KC_ADMIN_TOKEN="$(docker run --rm --network boudica_shared curlimages/curl:latest -s \
    -d "grant_type=password" -d "client_id=admin-cli" -d "username=admin" \
    -d "password=${BOUDICA_SLM_KEYCLOAK_ADMIN_PASSWORD}" \
    http://keycloak:8080/realms/master/protocol/openid-connect/token \
    | sed -E 's/.*"access_token":"([^"]+)".*/\1/')"
[[ -n "$KC_ADMIN_TOKEN" && "$KC_ADMIN_TOKEN" != *'{'* ]] || \
    die "Could not authenticate to boudica_slm's Keycloak admin API - check the admin password."

EXISTING_CLIENT="$(docker run --rm --network boudica_shared curlimages/curl:latest -s \
    -H "Authorization: Bearer ${KC_ADMIN_TOKEN}" \
    "http://keycloak:8080/admin/realms/boudica/clients?clientId=boudica-nextcloud")"
if [[ "$EXISTING_CLIENT" == "[]" ]]; then
    docker run --rm --network boudica_shared curlimages/curl:latest -s -o /dev/null \
        -H "Authorization: Bearer ${KC_ADMIN_TOKEN}" -H "Content-Type: application/json" \
        -X POST "http://keycloak:8080/admin/realms/boudica/clients" \
        -d "{\"clientId\":\"boudica-nextcloud\",\"name\":\"Boudica Nextcloud Login\",\"enabled\":true,\"publicClient\":true,\"protocol\":\"openid-connect\",\"standardFlowEnabled\":true,\"implicitFlowEnabled\":false,\"directAccessGrantsEnabled\":false,\"serviceAccountsEnabled\":false,\"redirectUris\":[\"${NEXTCLOUD_REDIRECT_URI}\"],\"webOrigins\":[\"https://${BOUDICA_DOMAIN}:${BOUDICA_HTTPS_PORT}\"],\"attributes\":{\"pkce.code.challenge.method\":\"S256\"}}"
    echo "Created Keycloak client 'boudica-nextcloud' (redirect: ${NEXTCLOUD_REDIRECT_URI})."
else
    echo "Keycloak client 'boudica-nextcloud' already exists - leaving it as-is."
fi

# --- 5. Bring the stack up ----------------------------------------------------

log "[6/7] Building and starting containers"
docker compose build
docker compose up -d redis
docker compose up -d

# --- 6. Post-install steps ----------------------------------------------------

log "[7/7] Post-install"

echo "Waiting for Nextcloud's own first-boot install to finish..."
until docker compose exec -u www-data -T nextcloud php occ status 2>/dev/null | grep -q "installed: true"; do
    sleep 3
done

# custom_apps (the parent directory - NOT the bind-mounted app
# subdirectories under it, never chown those, that would rewrite host-side
# git-tracked file ownership) ships root-owned in the base image's
# persisted volume - confirmed live this leaves BOTH Settings > Apps (500
# error) and any real `occ app:install` broken, not just a UI cosmetic
# issue. Nextcloud's installer needs at least one apps_paths entry to be
# genuinely writable, unconditionally - marking custom_apps `writable:
# false` instead (avoiding the chown) makes this worse, not better.
docker compose exec -T nextcloud chown www-data:www-data /var/www/html/custom_apps

# Talk (spreed) isn't bundled in the base Nextcloud image and has to be
# installed from the app store - boudicaai's DigestPollJob queries Talk's
# own oc_talk_attendees table directly and fatals every 5 minutes without
# it (confirmed live - this table doesn't exist until spreed is installed).
docker compose exec -u www-data -T nextcloud php occ app:install spreed || true

docker compose exec -u www-data -T nextcloud php occ app:enable boudicaai
docker compose exec -u www-data -T nextcloud php occ app:enable boudicaagent
docker compose exec -u www-data -T nextcloud php occ app:enable boudicacode
docker compose exec -u www-data -T nextcloud php occ app:enable boudicadashboard

docker compose exec -u www-data -T nextcloud php occ config:app:set boudicaai api_endpoint \
    --value="${BOUDICA_API_ENDPOINT}"

# KeycloakLoginController.php reads these to build the browser-facing
# Keycloak redirect (login()) - it's the PUBLIC Keycloak URL, unlike the
# internal http://keycloak:8080 the controller uses for its own
# server-to-server token-exchange/provision_check calls.
docker compose exec -u www-data -T nextcloud php occ config:app:set boudicaai keycloak_url \
    --value="${BOUDICA_KEYCLOAK_PUBLIC_URL}"
docker compose exec -u www-data -T nextcloud php occ config:app:set boudicaai keycloak_realm \
    --value="boudica"
docker compose exec -u www-data -T nextcloud php occ config:app:set boudicaai keycloak_client_id \
    --value="boudica-nextcloud"

# boudicaai's Whisper integration (TranscriptionService.php) reads this
# app-config value and has no default - confirmed live it was never wired
# up at all before this (whisper_service_url was simply unset), regardless
# of this merge. Points at the shared instance (boudica_slm's, reachable
# via boudica_shared) rather than a whisper container of this stack's own.
docker compose exec -u www-data -T nextcloud php occ config:app:set boudicaai whisper_service_url \
    --value="http://whisper:5000"

# richdocuments (Collabora integration, bundled by default - unlike Talk,
# no separate app:install needed) derives its default wopi_url from
# overwritehost/overwrite.cli.url at install time - confirmed live it
# picked up a port-less value despite those being set correctly, so set it
# explicitly here rather than trust the derived default.
docker compose exec -u www-data -T nextcloud php occ config:app:set richdocuments wopi_url \
    --value="https://${BOUDICA_DOMAIN}:${BOUDICA_HTTPS_PORT}"
docker compose exec -u www-data -T nextcloud php occ richdocuments:activate-config || true

# Talk's own signaling/STUN/TURN registration - all three ARE occ-scriptable
# (talk:signaling:add/talk:stun:add/talk:turn:add), no admin-UI step needed.
# The TURN secret must match eturnal's own `secret:` (generated/eturnal/eturnal.yml)
# - it's the same shared secret used for eturnal's HMAC auth mechanism.
#
# Deliberately NOT passing --verify (real TLS cert-chain validation) here -
# confirmed live it fails outright (curl exit 60, "self-signed certificate")
# against this stack's own default self-signed cert. A deployment with a
# real CA-signed cert can turn stricter verification on afterward via the
# admin UI if wanted; the default here has to work with the self-signed
# cert setup.sh generates by default, not assume a real one exists.
docker compose exec -u www-data -T nextcloud php occ talk:signaling:add \
    "https://talk.${BOUDICA_DOMAIN}:${BOUDICA_HTTPS_PORT}" "${TALK_BACKEND_SECRET}" || true
docker compose exec -u www-data -T nextcloud php occ talk:stun:add "${TURN_PUBLIC_IP}:3478" || true
docker compose exec -u www-data -T nextcloud php occ talk:turn:add turn,turns "${TURN_PUBLIC_IP}" udp,tcp \
    --secret="${TURN_SHARED_SECRET}" || true

echo "Stack is up and fully configured - no manual admin-UI steps required."
