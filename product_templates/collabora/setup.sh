#!/usr/bin/env bash
# Boudica-Nextcloud-Collabora integration stack installer.
#
# Builds every image locally by default (right for a sovereign/on-prem
# trial or dev box). A box that shouldn't have build tooling/source on it
# (e.g. ts-1-boudica, matching boudica_slm's own multiuser stack's
# pull-only conversion - see project-myboudica-integration-plan-20260905's
# Phase 6) can answer the pull-only prompt below instead - only the
# `image:` tags in docker-compose.yml are needed then, not the Dockerfiles/
# vendored build contexts (nextcloud/Dockerfile, collabora/Dockerfile,
# signaling/Dockerfile, ../../vendor/nextcloud-spreed-signaling/) at all.
# Safe to re-run either way: regenerates config from the templates each
# time, so config changes just mean re-running this.

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

# Two supported deployment shapes. Self-contained (default): this stack's
# own bundled `nginx` service terminates TLS and answers on the ports above
# directly - right for a sovereign/on-prem trial or any box with nothing
# else already listening on 80/443. External-proxy: a host-level reverse
# proxy already fronts this domain (e.g. ts-1-boudica's Apache, already
# terminating TLS for boudi.ca/boudica.myboudica.com with real Let's
# Encrypt certs) - that proxy gets new ProxyPass/vhost blocks pointing at
# this stack's own loopback-bound ports instead, and this stack's bundled
# nginx never starts at all (see docker-compose.yml's nginx service
# comment). Answering yes here does NOT configure that host proxy itself -
# it only stops this stack from fighting it for ports 80/443 and TLS
# ownership; the proxy-side config is a separate, later step.
read -rp "Does this box already have its own reverse proxy (Apache/nginx) that will \
terminate TLS for ${BOUDICA_DOMAIN}? [y/N]: " EXTERNAL_PROXY_ANSWER
case "${EXTERNAL_PROXY_ANSWER,,}" in
    y|yes) EXTERNAL_PROXY="true" ;;
    *)     EXTERNAL_PROXY="false" ;;
esac

if [[ "$EXTERNAL_PROXY" == "true" ]]; then
    read -rp "Loopback port for Nextcloud [8082]: " BOUDICA_NEXTCLOUD_LOCAL_PORT
    BOUDICA_NEXTCLOUD_LOCAL_PORT="${BOUDICA_NEXTCLOUD_LOCAL_PORT:-8082}"
    read -rp "Loopback port for Collabora [8083]: " BOUDICA_COLLABORA_LOCAL_PORT
    BOUDICA_COLLABORA_LOCAL_PORT="${BOUDICA_COLLABORA_LOCAL_PORT:-8083}"
    read -rp "Loopback port for the Talk signaling server [8084]: " BOUDICA_SIGNALING_LOCAL_PORT
    BOUDICA_SIGNALING_LOCAL_PORT="${BOUDICA_SIGNALING_LOCAL_PORT:-8084}"
    read -rp "Loopback port for Whiteboard [8085]: " BOUDICA_WHITEBOARD_LOCAL_PORT
    BOUDICA_WHITEBOARD_LOCAL_PORT="${BOUDICA_WHITEBOARD_LOCAL_PORT:-8085}"
else
    BOUDICA_NEXTCLOUD_LOCAL_PORT="8082"
    BOUDICA_COLLABORA_LOCAL_PORT="8083"
    BOUDICA_SIGNALING_LOCAL_PORT="8084"
    BOUDICA_WHITEBOARD_LOCAL_PORT="8085"
fi

# Pull-only: this box only needs the `image:` tags in docker-compose.yml -
# no Dockerfiles, no vendored signaling source tree, no build tooling. Right
# for a box that shouldn't have build machinery/source beyond the 4
# bind-mounted Boudica Nextcloud apps (which are source, by design, on any
# box - see docker-compose.yml's own comment on why they're bind-mounted
# rather than baked in). Answering no (the default) preserves the original
# "build everything locally" behavior for a dev/trial box with no pushed
# images to pull.
read -rp "Pull pre-built images from the registry instead of building them on this box? \
[y/N]: " PULL_ONLY_ANSWER
case "${PULL_ONLY_ANSWER,,}" in
    y|yes) PULL_ONLY="true" ;;
    *)     PULL_ONLY="false" ;;
esac

# Defaults to THIS box's own co-located boudica_slm instance (nginx
# proxies /api/boudica/ to it - see nginx/default.conf) rather than the
# external boudi.ca SaaS - a sovereign/on-prem install should stay
# self-contained by default. Only override this if the inference server
# actually lives elsewhere (a split-out medium/large deployment, or
# pointing at the SaaS deliberately).
DEFAULT_API_ENDPOINT="https://${BOUDICA_DOMAIN}:${BOUDICA_HTTPS_PORT}/api/boudica/chat"
read -rp "Boudica inference API endpoint [${DEFAULT_API_ENDPOINT}]: " BOUDICA_API_ENDPOINT
BOUDICA_API_ENDPOINT="${BOUDICA_API_ENDPOINT:-$DEFAULT_API_ENDPOINT}"
# Stashed because `source .env` below unconditionally reassigns this same
# variable name from whatever was persisted on a previous run, silently
# discarding the answer just given here - confirmed live 2026-09-05 as the
# actual reason re-running setup.sh to fix a wrong BOUDICA_API_ENDPOINT
# never took effect (this deployment kept shipping the widget/app config
# pointing at the external boudi.ca SaaS regardless of what was typed at
# this prompt, every single re-run).
BOUDICA_API_ENDPOINT_PROMPTED="$BOUDICA_API_ENDPOINT"
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
# occ talk:bot:install requires a 40-128 char secret - longer than the 24-char
# gen_secret() used elsewhere, so it gets its own generator.
gen_bot_secret() { openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | head -c 48; }
# Matches boudislm.api_keys' own bdk_<60 lowercase hex> format
# (is_valid_api_key_format() in slm_cgi_utils.cpp) - not the generic
# gen_secret() shape.
gen_talkbot_key() { echo "bdk_$(openssl rand -hex 30)"; }

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
TALK_BOT_SECRET=$(gen_bot_secret)
BOUDICA_TALKBOT_API_KEY=$(gen_talkbot_key)
TURN_PUBLIC_IP=${TURN_PUBLIC_IP}
BOUDICA_API_ENDPOINT=${BOUDICA_API_ENDPOINT}
SMTP_RELAYHOST=${SMTP_RELAYHOST}
WHISPER_MODEL=${WHISPER_MODEL}
BOUDICA_HTTP_PORT=${BOUDICA_HTTP_PORT}
BOUDICA_HTTPS_PORT=${BOUDICA_HTTPS_PORT}
EXTERNAL_PROXY=${EXTERNAL_PROXY}
BOUDICA_NEXTCLOUD_LOCAL_PORT=${BOUDICA_NEXTCLOUD_LOCAL_PORT}
BOUDICA_COLLABORA_LOCAL_PORT=${BOUDICA_COLLABORA_LOCAL_PORT}
BOUDICA_SIGNALING_LOCAL_PORT=${BOUDICA_SIGNALING_LOCAL_PORT}
BOUDICA_WHITEBOARD_LOCAL_PORT=${BOUDICA_WHITEBOARD_LOCAL_PORT}
PULL_ONLY=${PULL_ONLY}
EOF
    echo "Generated all secrets fresh (stored in .env - keep this private)."
    echo "Nextcloud admin password: $(grep NEXTCLOUD_ADMIN_PASSWORD .env | cut -d= -f2)"
else
    echo ".env already exists, reusing it (including previously-chosen values)."
fi
# shellcheck disable=SC1091
source .env
# The prompt's answer always wins over whatever source .env just loaded -
# see BOUDICA_API_ENDPOINT_PROMPTED's own comment above for why this is
# needed at all. Also persists back into .env itself (not just the
# in-memory shell var) so a value corrected here doesn't drift back to the
# stale one on the *next* re-run too.
BOUDICA_API_ENDPOINT="$BOUDICA_API_ENDPOINT_PROMPTED"
if grep -q '^BOUDICA_API_ENDPOINT=' .env; then
    sed -i "s#^BOUDICA_API_ENDPOINT=.*#BOUDICA_API_ENDPOINT=${BOUDICA_API_ENDPOINT}#" .env
else
    echo "BOUDICA_API_ENDPOINT=${BOUDICA_API_ENDPOINT}" >> .env
fi
BOUDICA_API_ORIGIN="$(echo "$BOUDICA_API_ENDPOINT" | sed -E 's#^(https?://[^/]+).*#\1#')"
BOUDICA_API_BASE="$(echo "$BOUDICA_API_ENDPOINT" | sed -E 's#/chat/?$##')"

# Same "prompt wins over a stale .env" pattern as BOUDICA_API_ENDPOINT above -
# EXTERNAL_PROXY controls which reverse-proxy mode this run uses (see the
# prompt above and docker-compose.yml's nginx service comment), so a re-run
# meant to actually switch modes must not silently keep the old value.
persist_env_var() {
    local key="$1" value="$2"
    if grep -q "^${key}=" .env; then
        sed -i "s#^${key}=.*#${key}=${value}#" .env
    else
        echo "${key}=${value}" >> .env
    fi
}
persist_env_var EXTERNAL_PROXY "$EXTERNAL_PROXY"
persist_env_var PULL_ONLY "$PULL_ONLY"
persist_env_var BOUDICA_NEXTCLOUD_LOCAL_PORT "$BOUDICA_NEXTCLOUD_LOCAL_PORT"
persist_env_var BOUDICA_COLLABORA_LOCAL_PORT "$BOUDICA_COLLABORA_LOCAL_PORT"
persist_env_var BOUDICA_SIGNALING_LOCAL_PORT "$BOUDICA_SIGNALING_LOCAL_PORT"
persist_env_var BOUDICA_WHITEBOARD_LOCAL_PORT "$BOUDICA_WHITEBOARD_LOCAL_PORT"

# Compose reads both of these straight out of .env on its own, for every
# subsequent plain `docker compose <cmd>` run in this directory - no -f/
# --profile flags to remember afterward. Self-contained (default): activates
# the bundled-proxy profile so nginx starts; external-proxy: leaves the
# profile unset (nginx excluded) and layers the extra_hosts override on top.
if [[ "$EXTERNAL_PROXY" == "true" ]]; then
    persist_env_var COMPOSE_PROFILES ""
    persist_env_var COMPOSE_FILE "docker-compose.yml:docker-compose.external-proxy.yml"
else
    persist_env_var COMPOSE_PROFILES "bundled-proxy"
    persist_env_var COMPOSE_FILE "docker-compose.yml"
fi
# shellcheck disable=SC1091
source .env

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

# [backend] uses allowall=true, not a domain allowlist - see the comment
# in signaling/server.conf itself for why (the "allowed" key that used to
# be rendered here isn't real for the deployed signaling server binary,
# and silently registered zero trusted backends - every real Nextcloud
# request got rejected with "Authentication check failed" regardless of a
# correct HMAC secret). Confirmed live 2026-09-08, superseding an earlier
# incomplete 2026-09-05 fix that only addressed a missing port on that
# line. No __NEXTCLOUD_DOMAIN__ substitution needed here anymore.
sed -e "s#__SESSIONS_HASHKEY__#${SESSIONS_HASHKEY}#g" \
    -e "s#__TALK_BACKEND_SECRET__#${TALK_BACKEND_SECRET}#g" \
    -e "s#__TURN_HOST__#${TURN_PUBLIC_IP}#g" \
    -e "s#__TURN_SHARED_SECRET__#${TURN_SHARED_SECRET}#g" \
    signaling/server.conf > generated/signaling/server.conf

sed -e "s#__TURN_SHARED_SECRET__#${TURN_SHARED_SECRET}#g" \
    -e "s#__PUBLIC_IP__#${TURN_PUBLIC_IP}#g" \
    -e "s#__JANUS_TURN_PASSWORD__#${JANUS_TURN_PASSWORD}#g" \
    eturnal/eturnal.yml > generated/eturnal/eturnal.yml

if [[ "$EXTERNAL_PROXY" == "true" ]]; then
    echo "External-proxy mode: skipping this stack's own nginx config/TLS cert generation \
entirely - a host-level reverse proxy already terminates TLS for ${BOUDICA_DOMAIN} and \
will be given its own ProxyPass/vhost blocks pointing at this stack's loopback ports \
(Nextcloud :${BOUDICA_NEXTCLOUD_LOCAL_PORT}, Collabora :${BOUDICA_COLLABORA_LOCAL_PORT}, \
signaling :${BOUDICA_SIGNALING_LOCAL_PORT}, Whiteboard :${BOUDICA_WHITEBOARD_LOCAL_PORT}) \
as a separate step - see project-myboudica-integration-plan-20260905's later phases."
else
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
# Wildcarded, not an exact match - intercept-logout.js's post_logout_redirect_uri
# is Nextcloud's own real "Log out" link (carries a per-session CSRF
# requesttoken query param that changes every page load), not a fixed
# URL, so Keycloak's allowlist has to match the whole /logout* range
# rather than one exact string.
NEXTCLOUD_LOGOUT_REDIRECT_URI="https://${BOUDICA_DOMAIN}:${BOUDICA_HTTPS_PORT}/logout*"

# boudica_slm's Keycloak container always sets KC_HTTP_RELATIVE_PATH=/kc
# (see that project's product_templates/multiuser/docker-compose.yml and
# its boudica-le-ssl.conf's own hardcoded /kc ProxyPass) - every internal,
# container-to-container call below needs that same /kc prefix or it 404s.
# Confirmed live 2026-09-06: without it, every call below silently got a
# 404 HTML error page back instead of real JSON, which then got used AS a
# bearer token / client UUID by the following calls - the garbage token
# itself didn't fail (curl doesn't error on a 404 body), but the resulting
# malformed URL to a LATER call (a literal "<html>...</html>" string
# embedded in a URL path) crashed curl outright with "URL malformed" (exit
# 3), taking the whole script down via set -e with no diagnostic message
# printed anywhere before that point - very hard to debug blind. Also
# hardened the validation below to actually catch this class of failure
# with a clear error instead of silently propagating garbage forward.
KC_ADMIN_TOKEN="$(docker run --rm --network boudica_shared curlimages/curl:latest -s \
    -d "grant_type=password" -d "client_id=admin-cli" -d "username=admin" \
    -d "password=${BOUDICA_SLM_KEYCLOAK_ADMIN_PASSWORD}" \
    http://keycloak:8080/kc/realms/master/protocol/openid-connect/token \
    | sed -E 's/.*"access_token":"([^"]+)".*/\1/')"
[[ -n "$KC_ADMIN_TOKEN" && "$KC_ADMIN_TOKEN" != *'{'* && "$KC_ADMIN_TOKEN" != *'<'* ]] || \
    die "Could not authenticate to boudica_slm's Keycloak admin API - check the admin \
password and that its Keycloak is actually reachable as 'keycloak' on boudica_shared \
(got back: ${KC_ADMIN_TOKEN})."

EXISTING_CLIENT="$(docker run --rm --network boudica_shared curlimages/curl:latest -s \
    -H "Authorization: Bearer ${KC_ADMIN_TOKEN}" \
    "http://keycloak:8080/kc/admin/realms/boudica/clients?clientId=boudica-nextcloud")"
[[ "$EXISTING_CLIENT" != *'<'* ]] || \
    die "Unexpected (non-JSON) response listing Keycloak clients: ${EXISTING_CLIENT}"
if [[ "$EXISTING_CLIENT" == "[]" ]]; then
    docker run --rm --network boudica_shared curlimages/curl:latest -s -o /dev/null \
        -H "Authorization: Bearer ${KC_ADMIN_TOKEN}" -H "Content-Type: application/json" \
        -X POST "http://keycloak:8080/kc/admin/realms/boudica/clients" \
        -d "{\"clientId\":\"boudica-nextcloud\",\"name\":\"Boudica Nextcloud Login\",\"enabled\":true,\"publicClient\":true,\"protocol\":\"openid-connect\",\"standardFlowEnabled\":true,\"implicitFlowEnabled\":false,\"directAccessGrantsEnabled\":false,\"serviceAccountsEnabled\":false,\"redirectUris\":[\"${NEXTCLOUD_REDIRECT_URI}\"],\"webOrigins\":[\"https://${BOUDICA_DOMAIN}:${BOUDICA_HTTPS_PORT}\"],\"attributes\":{\"pkce.code.challenge.method\":\"S256\",\"post.logout.redirect.uris\":\"${NEXTCLOUD_LOGOUT_REDIRECT_URI}\"}}"
    echo "Created Keycloak client 'boudica-nextcloud' (redirect: ${NEXTCLOUD_REDIRECT_URI})."
else
    # Self-healing re-run for an install created before
    # post.logout.redirect.uris existed in this script (2026-09-04) -
    # PUTs it onto the already-existing client rather than skipping
    # entirely, so re-running setup.sh after an update actually picks up
    # new client attributes like this one.
    CLIENT_UUID="$(echo "$EXISTING_CLIENT" | sed -E 's/.*"id":"([^"]+)".*/\1/')"
    docker run --rm --network boudica_shared curlimages/curl:latest -s -o /dev/null \
        -H "Authorization: Bearer ${KC_ADMIN_TOKEN}" -H "Content-Type: application/json" \
        -X PUT "http://keycloak:8080/kc/admin/realms/boudica/clients/${CLIENT_UUID}" \
        -d "{\"attributes\":{\"pkce.code.challenge.method\":\"S256\",\"post.logout.redirect.uris\":\"${NEXTCLOUD_LOGOUT_REDIRECT_URI}\"}}"
    echo "Keycloak client 'boudica-nextcloud' already exists - refreshed its logout-redirect attribute."
fi

# --- 5. Bring the stack up ----------------------------------------------------

if [[ "$PULL_ONLY" == "true" ]]; then
    log "[6/7] Pulling images and starting containers"
    # Non-fatal on failure: this registry has a documented history of
    # intermittent outages (see boudica-registry-push-failure-20260903 in
    # memory) - if the required images are already present locally (e.g.
    # pulled in advance via a bridge/workaround registry while the primary
    # one was down), Compose's default pull policy for `up` only re-pulls
    # what's actually missing, so a failed *explicit* pull here doesn't
    # necessarily mean the install can't proceed. `docker compose up -d`
    # below will fail clearly and specifically if an image is genuinely
    # unavailable either way.
    docker compose pull || warn "docker compose pull failed - continuing in case the \
required images are already cached locally; 'docker compose up -d' below will fail \
clearly if any are genuinely missing."
else
    log "[6/7] Building and starting containers"
    docker compose build
fi
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

# BoudicaService.php (used by TalkBotInvokeListener for every @boudica Talk
# mention) reads api_key/user_id as APP-WIDE config (getAppValue, not
# per-user) - a dedicated service-account credential the bot acts as,
# separate from any individual Nextcloud user's own key. Nothing ever
# provisioned this before, so every @boudica reply failed with a generic
# "Sorry, I couldn't generate a response right now." (confirmed live
# 2026-09-05) while the real cause (empty api_key/user_id reaching the
# backend's own auth check) only showed up in the Nextcloud log. Mints a
# real boudislm.api_keys row for a dedicated talkbot@boudica.local identity,
# same pattern as the existing verify-bot/distill-bot service accounts -
# idempotent via ON CONFLICT, and the key itself is stable across re-runs
# since BOUDICA_TALKBOT_API_KEY only gets generated once into .env.
docker run --rm --network boudica_shared -e PGPASSWORD="$BOUDICA_SLM_DBA_PASSWORD" \
    postgres:17 psql -h postgres -U boudislm_dba -d boudislm -v ON_ERROR_STOP=0 -c \
    "INSERT INTO boudislm.api_keys (api_key, key_name, user_id, is_active) VALUES ('${BOUDICA_TALKBOT_API_KEY}', 'MyBoudica Talk bot service account', 'talkbot@boudica.local', true) ON CONFLICT (api_key) DO NOTHING;"
docker compose exec -u www-data -T nextcloud php occ config:app:set boudicaai api_key \
    --value="${BOUDICA_TALKBOT_API_KEY}"
docker compose exec -u www-data -T nextcloud php occ config:app:set boudicaai user_id \
    --value="talkbot@boudica.local"

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

# Default "My Boudica" branding (logo/header/background/favicon + name/
# slogan/URLs/colors) - pulled from the live eu1.myboudica.com install so a
# fresh deployment looks the same out of the box instead of stock
# Nextcloud branding until someone redoes it by hand. Text values go
# through occ (theming:config has no image support); the 4 images are
# applied by apply-theming.php, baked into the image at build time (see
# nextcloud/Dockerfile) - calls the same ImageManager::updateImage()
# ThemingController::uploadImage() itself uses, so no HTTP/admin-session
# login is needed to drive the real upload endpoint. Safe to re-run:
# occ theming:config just overwrites, and updateImage() deletes the old
# image before writing the new one.
docker compose exec -u www-data -T nextcloud php occ theming:config name "My Boudica"
docker compose exec -u www-data -T nextcloud php occ theming:config slogan "Own Your Own Intelligence"
docker compose exec -u www-data -T nextcloud php occ theming:config url "https://omniindex.io"
docker compose exec -u www-data -T nextcloud php occ theming:config imprintUrl "https://www.omniindex.io/legal/"
docker compose exec -u www-data -T nextcloud php occ theming:config privacyUrl "https://www.omniindex.io/legal/"
docker compose exec -u www-data -T nextcloud php occ theming:config primary_color "#D3A54A"
docker compose exec -u www-data -T nextcloud php occ theming:config background_color "#f1ede4"
docker compose exec -u www-data -T nextcloud php /opt/boudica-theming/apply-theming.php

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

# Registers boudicaai's TalkBotInvokeListener (lib/Listener/TalkBotInvokeListener.php,
# already wired to BotInvokeEvent in Application.php) as an actual Talk bot -
# without this, "No bots are installed on this server" shows in Talk's admin
# settings and every @boudica mention is silently dropped (Talk never
# dispatches BotInvokeEvent for a bot it doesn't know exists). Confirmed live
# 2026-09-05. --feature=event (not webhook/response/reaction - occ rejects
# combining those with event, they're mutually exclusive): the listener
# consumes posted messages via the local BotInvokeEvent and replies via
# $event->addAnswer() regardless, so Talk never actually calls `url` over
# HTTP - it's only required as a stable, non-empty identifier.
# nextcloudapp://<app-id> is the established Nextcloud convention for this
# in-process/event-only bot shape (matches what first-party app-provided
# bots use), not a real endpoint. Re-running with the same name/secret/url
# is idempotent - Talk derives the bot's id from a hash of secret+url, so
# this updates the existing row rather than creating a duplicate.
docker compose exec -u www-data -T nextcloud php occ talk:bot:install \
    "Boudica" "${TALK_BOT_SECRET}" "nextcloudapp://boudicaai" \
    "Boudica AI assistant - mention @boudica in any conversation" \
    --feature=event || true

echo "Stack is up and fully configured - no manual admin-UI steps required."
