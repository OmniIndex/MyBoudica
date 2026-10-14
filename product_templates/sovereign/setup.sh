#!/usr/bin/env bash
# Sovereign MyBoudica installer: a separate, branded Nextcloud for one
# organisation or country site. See docker-compose.yml for what it has
# compared with ../community (Talk, sharing, Calendar, Mail, dashboards).
#
# Site settings (name, slogan, colour, pictures, account domain) come from a
# site file, e.g. sites/bangladesh/site.env:
#     ./setup.sh sites/bangladesh
#
# Needs boudica_slm's multiuser stack running first (shared Postgres,
# Keycloak and API on the boudica_shared network). Calls in Talk use the TURN
# server of the full MyBoudica (../collabora) when its .env is next to this
# folder. Safe to re-run.
#
# Unattended: BOUDICA_UNATTENDED=1 with every answer below set as an
# environment variable of the same name.

set -euo pipefail

log()  { echo -e "\n\033[1;34m==> $*\033[0m"; }
warn() { echo -e "\033[1;33m[warn] $*\033[0m" >&2; }
die()  { echo -e "\033[1;31m[error] $*\033[0m" >&2; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

SITE_DIR="${1:-}"
[[ -n "$SITE_DIR" && -f "$SITE_DIR/site.env" ]] || die "Usage: ./setup.sh sites/<name> (a folder with site.env)."
SITE_DIR="$(cd "$SITE_DIR" && pwd)"
# shellcheck disable=SC1091
source "$SITE_DIR/site.env"
for v in SITE_NAME SITE_TITLE SITE_SLOGAN SITE_COLOR SITE_ACCOUNT_DOMAIN; do
    [[ -n "${!v:-}" ]] || die "$SITE_DIR/site.env does not set $v."
done
[[ "$SITE_NAME" =~ ^[a-z][a-z0-9]{1,30}$ ]] || die "SITE_NAME must be lowercase letters and digits."

ask() {
    local var="$1" prompt="$2"
    if [[ "${BOUDICA_UNATTENDED:-0}" == 1 ]]; then
        [[ -n "${!var+x}" ]] || die "Unattended install: ${var} is not set."
        return 0
    fi
    if [[ "${3:-}" == secret ]]; then read -rsp "$prompt" "$var"; echo; else read -rp "$prompt" "$var"; fi
}

# --- 1. Prerequisites ---------------------------------------------------------
log "[1/7] Checking prerequisites"
command -v docker >/dev/null 2>&1 || die "Docker not found."
docker compose version >/dev/null 2>&1 || die "docker compose (v2 plugin) not found."
command -v openssl >/dev/null 2>&1 || die "openssl not found."
docker network inspect boudica_shared >/dev/null 2>&1 || die "No boudica_shared network: boudica_slm's multiuser stack must be running first."
docker run --rm --network boudica_shared curlimages/curl:latest -s -m 5 -o /dev/null \
    http://web:80/api/boudica/health 2>/dev/null || die "Can't reach boudica_slm's 'web' service on boudica_shared."

# --- 2. Details ---------------------------------------------------------------
log "[2/7] Deployment details for ${SITE_TITLE}"
ask SITE_MY_DOMAIN "Address of this MyBoudica (e.g. my.${SITE_ACCOUNT_DOMAIN}): "
[[ -n "$SITE_MY_DOMAIN" ]] || die "An address is required."
ask EXTERNAL_PROXY_ANSWER "Does a host-level reverse proxy terminate TLS for ${SITE_MY_DOMAIN}? [y/N]: "
case "${EXTERNAL_PROXY_ANSWER,,}" in y|yes) EXTERNAL_PROXY=true ;; *) EXTERNAL_PROXY=false ;; esac
ask SITE_HTTPS_PORT "HTTPS port browsers use [443]: "
SITE_HTTPS_PORT="${SITE_HTTPS_PORT:-443}"
ask SITE_NEXTCLOUD_LOCAL_PORT "Loopback port for Nextcloud [8102]: "
SITE_NEXTCLOUD_LOCAL_PORT="${SITE_NEXTCLOUD_LOCAL_PORT:-8102}"
ask SITE_COLLABORA_LOCAL_PORT "Loopback port for Collabora [8103]: "
SITE_COLLABORA_LOCAL_PORT="${SITE_COLLABORA_LOCAL_PORT:-8103}"
ask BOUDICA_KEYCLOAK_PUBLIC_URL "Public URL of boudica_slm's Keycloak (its .env KEYCLOAK_URL): "
[[ -n "$BOUDICA_KEYCLOAK_PUBLIC_URL" ]] || die "The Keycloak URL is required for sign-in."
ask BOUDICA_KEYCLOAK_INTERNAL_URL "Keycloak address on the shared network [http://keycloak:8080/kc]: "
BOUDICA_KEYCLOAK_INTERNAL_URL="${BOUDICA_KEYCLOAK_INTERNAL_URL:-http://keycloak:8080/kc}"
ask BOUDICA_SLM_DBA_PASSWORD "boudica_slm's BOUDICA_DBA_PASSWORD: " secret
[[ -n "$BOUDICA_SLM_DBA_PASSWORD" ]] || die "That password is required to create this site's database."
ask BOUDICA_SLM_KEYCLOAK_ADMIN_PASSWORD "boudica_slm's KEYCLOAK_ADMIN_PASSWORD: " secret
[[ -n "$BOUDICA_SLM_KEYCLOAK_ADMIN_PASSWORD" ]] || die "That password is required to register this site's sign-in client."

SITE_DB_NAME="nextcloud_${SITE_NAME}"
KC_CLIENT_ID="boudica-nextcloud-${SITE_NAME}"
SITE_PUBLIC_HOST="${SITE_MY_DOMAIN}$([[ "$SITE_HTTPS_PORT" == 443 ]] || echo ":${SITE_HTTPS_PORT}")"
PUBLIC_BASE="https://${SITE_PUBLIC_HOST}"
API_ENDPOINT="${PUBLIC_BASE}/api/boudica/chat"

# --- 3. Secrets and .env --------------------------------------------------------
log "[3/7] Settings"
gen_secret() { openssl rand -base64 24 | tr -dc 'A-Za-z0-9' | head -c 24; }
persist() {
    local key="$1" value="$2"
    if grep -q "^${key}=" .env 2>/dev/null; then sed -i "s#^${key}=.*#${key}=${value}#" .env; else echo "${key}=${value}" >> .env; fi
}
if [[ ! -f .env ]]; then
    umask 077
    cat > .env <<EOF
NEXTCLOUD_ADMIN_USER=admin
NEXTCLOUD_ADMIN_PASSWORD=$(gen_secret)
SITE_DB_PASSWORD=$(gen_secret)
REDIS_PASSWORD=$(gen_secret)
TALK_BOT_SECRET=$(openssl rand -hex 32)
EOF
    umask 022
    echo "Generated this site's own secrets (.env - keep it private)."
else
    echo ".env exists: keeping its secrets."
fi
persist SITE_NAME "$SITE_NAME"
persist SITE_DB_NAME "$SITE_DB_NAME"
persist SITE_MY_DOMAIN "$SITE_MY_DOMAIN"
persist SITE_HTTPS_PORT "$SITE_HTTPS_PORT"
persist SITE_PUBLIC_HOST "$SITE_PUBLIC_HOST"
persist SITE_NEXTCLOUD_LOCAL_PORT "$SITE_NEXTCLOUD_LOCAL_PORT"
persist SITE_COLLABORA_LOCAL_PORT "$SITE_COLLABORA_LOCAL_PORT"
if [[ "$EXTERNAL_PROXY" == true ]]; then persist COMPOSE_PROFILES ""; else persist COMPOSE_PROFILES "bundled-proxy"; fi
chmod 600 .env
# shellcheck disable=SC1091
source .env

mkdir -p generated/nextcloud generated/collabora generated/nginx/certs generated/theme
sed -e "s#__BOUDICA_API_ORIGIN__#${PUBLIC_BASE}#g" ../collabora/nextcloud/boudica-csp.conf > generated/nextcloud/boudica-csp.conf
sed -e "s#__BOUDICA_API_BASE__#${PUBLIC_BASE}/api/boudica#g" ../collabora/collabora/boudica-config.js > generated/collabora/boudica-config.js
# Theme pictures, mounted read-only into Nextcloud at /opt/site-theme.
for f in logo logoheader background favicon; do
    for ext in svg png jpg ico; do
        [[ -f "$SITE_DIR/theme/$f.$ext" ]] && cp "$SITE_DIR/theme/$f.$ext" generated/theme/
    done
done
if [[ "$EXTERNAL_PROXY" != true ]]; then
    sed -e "s#__DOMAIN__#${SITE_MY_DOMAIN}#g" -e "s#__HTTPS_PORT__#${SITE_HTTPS_PORT}#g" \
        -e "s#__API_UPSTREAM__#http://web:80#g" nginx/default.conf > generated/nginx/default.conf
    if [[ ! -f generated/nginx/certs/fullchain.pem ]]; then
        openssl req -x509 -nodes -newkey rsa:2048 -days 3650 -keyout generated/nginx/certs/privkey.pem \
            -out generated/nginx/certs/fullchain.pem -subj "/CN=${SITE_MY_DOMAIN}" \
            -addext "subjectAltName=DNS:${SITE_MY_DOMAIN}" >/dev/null 2>&1
        echo "Generated a self-signed certificate for ${SITE_MY_DOMAIN}."
    fi
fi

# --- 4. Database and sign-in client ---------------------------------------------
log "[4/7] Database ${SITE_DB_NAME} and Keycloak client ${KC_CLIENT_ID}"
pg() { docker run --rm -i --network boudica_shared -e PGPASSWORD="$BOUDICA_SLM_DBA_PASSWORD" postgres:17 psql -h postgres -U boudislm_dba "$@"; }
pg -d postgres -v ON_ERROR_STOP=1 -q <<SQL
DO \$\$
BEGIN
   IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '${SITE_DB_NAME}') THEN
      CREATE ROLE ${SITE_DB_NAME} WITH LOGIN CREATEROLE CREATEDB PASSWORD '${SITE_DB_PASSWORD}';
   END IF;
END
\$\$;
SQL
pg -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='${SITE_DB_NAME}'" | grep -q 1 || \
    pg -d postgres -q -c "CREATE DATABASE ${SITE_DB_NAME} OWNER ${SITE_DB_NAME};"
pg -d "${SITE_DB_NAME}" -q -c "GRANT ALL ON SCHEMA public TO ${SITE_DB_NAME};"

kcurl() { docker run --rm --network boudica_shared curlimages/curl:latest -s "$@"; }
KC_ADMIN_TOKEN="$(kcurl -d grant_type=password -d client_id=admin-cli -d username=admin \
    --data-urlencode "password=${BOUDICA_SLM_KEYCLOAK_ADMIN_PASSWORD}" \
    "${BOUDICA_KEYCLOAK_INTERNAL_URL}/realms/master/protocol/openid-connect/token" \
    | sed -E 's/.*"access_token":"([^"]+)".*/\1/')"
[[ -n "$KC_ADMIN_TOKEN" && "$KC_ADMIN_TOKEN" != *'{'* && "$KC_ADMIN_TOKEN" != *'<'* ]] || \
    die "Could not authenticate to Keycloak's admin API at ${BOUDICA_KEYCLOAK_INTERNAL_URL}."
REDIRECT_URI="${PUBLIC_BASE}/apps/boudicaai/keycloak/callback"
LOGOUT_URI="${PUBLIC_BASE}/logout*"
CLIENT_JSON="{\"clientId\":\"${KC_CLIENT_ID}\",\"name\":\"${SITE_TITLE} login\",\"enabled\":true,\"publicClient\":true,\"protocol\":\"openid-connect\",\"standardFlowEnabled\":true,\"implicitFlowEnabled\":false,\"directAccessGrantsEnabled\":false,\"redirectUris\":[\"${REDIRECT_URI}\"],\"webOrigins\":[\"${PUBLIC_BASE}\"],\"attributes\":{\"pkce.code.challenge.method\":\"S256\",\"post.logout.redirect.uris\":\"${LOGOUT_URI}\"}}"
EXISTING="$(kcurl -H "Authorization: Bearer ${KC_ADMIN_TOKEN}" "${BOUDICA_KEYCLOAK_INTERNAL_URL}/admin/realms/boudica/clients?clientId=${KC_CLIENT_ID}")"
[[ "$EXISTING" != *'<'* ]] || die "Unexpected response listing Keycloak clients."
if [[ "$EXISTING" == "[]" ]]; then
    kcurl -o /dev/null -H "Authorization: Bearer ${KC_ADMIN_TOKEN}" -H "Content-Type: application/json" \
        -X POST "${BOUDICA_KEYCLOAK_INTERNAL_URL}/admin/realms/boudica/clients" -d "$CLIENT_JSON"
    echo "Created Keycloak client ${KC_CLIENT_ID}."
else
    CLIENT_UUID="$(echo "$EXISTING" | sed -E 's/.*"id":"([^"]+)".*/\1/')"
    kcurl -o /dev/null -H "Authorization: Bearer ${KC_ADMIN_TOKEN}" -H "Content-Type: application/json" \
        -X PUT "${BOUDICA_KEYCLOAK_INTERNAL_URL}/admin/realms/boudica/clients/${CLIENT_UUID}" -d "$CLIENT_JSON"
    echo "Keycloak client ${KC_CLIENT_ID} already exists: refreshed."
fi

# --- 5. Start ---------------------------------------------------------------------
log "[5/7] Starting containers"
docker compose up -d sov-redis
docker compose up -d
echo "Waiting for Nextcloud's first-boot install..."
until docker compose exec -u www-data -T sov-nextcloud php occ status 2>/dev/null | grep -q "installed: true"; do sleep 3; done

# --- 6. Apps ------------------------------------------------------------------------
log "[6/7] Apps"
occ() { docker compose exec -u www-data -T sov-nextcloud php occ "$@"; }
docker compose exec -T sov-nextcloud chown www-data:www-data /var/www/html/custom_apps

occ app:enable boudicaai
occ app:enable boudicacode
occ app:enable boudicadashboard
occ config:app:set boudicaai api_endpoint --value="${API_ENDPOINT}"
occ config:app:set boudicaai keycloak_url --value="${BOUDICA_KEYCLOAK_PUBLIC_URL}"
occ config:app:set boudicaai keycloak_internal_url --value="${BOUDICA_KEYCLOAK_INTERNAL_URL}"
occ config:app:set boudicaai keycloak_realm --value="boudica"
occ config:app:set boudicaai keycloak_client_id --value="${KC_CLIENT_ID}"
# Only the site's own accounts may sign in here.
occ config:app:set boudicaai login_allowed_domains --value="${SITE_ACCOUNT_DOMAIN}"

# From the app store (needs internet once; the store is switched off after):
# documents (Collabora connector), Talk, Calendar, Mail.
for app in richdocuments spreed calendar mail; do
    occ app:install "$app" >/dev/null 2>&1 || occ app:enable "$app" >/dev/null 2>&1 || warn "Could not install $app."
done
occ app:enable dashboard >/dev/null 2>&1 || true
for app in firstrunwizard recommendations survey_client updatenotification support nextcloud_announcements app_api; do
    occ app:disable "$app" >/dev/null 2>&1 || true
done
occ config:system:set appstoreenabled --value=false --type=boolean
occ config:system:set simpleSignUpLink.shown --value=false --type=boolean
occ config:system:set lost_password_link --value=disabled
# Mail: users add their own accounts; nobody may point it at a server inside
# this network.
occ config:app:set mail allow_new_mail_accounts --value=yes
occ config:system:set app.mail.verify-tls-peer --value=true --type=boolean

occ config:app:set richdocuments wopi_url --value="${PUBLIC_BASE}"
# The bundled proxy's certificate is self-signed, which Nextcloud would
# refuse when it fetches Collabora's discovery document. A host proxy has a
# real certificate, so verification stays on there.
if [[ "$EXTERNAL_PROXY" != true ]]; then
    occ config:app:set richdocuments disable_certificate_verification --value=yes
fi
occ richdocuments:activate-config || true

# Talk: calls through the full MyBoudica's TURN server when it is on this box
# (no separate signaling server: Talk's own, for small groups), and the
# @boudica bot in conversations.
FULL_ENV=../collabora/.env
TURN_PUBLIC_IP="${TURN_PUBLIC_IP:-$(grep -s '^TURN_PUBLIC_IP=' "$FULL_ENV" | cut -d= -f2-)}"
TURN_SHARED_SECRET="${TURN_SHARED_SECRET:-$(grep -s '^TURN_SHARED_SECRET=' "$FULL_ENV" | cut -d= -f2-)}"
if [[ -n "$TURN_PUBLIC_IP" && -n "$TURN_SHARED_SECRET" ]]; then
    if ! occ talk:turn:list 2>/dev/null | grep -q "$TURN_PUBLIC_IP"; then
        occ talk:stun:add "${TURN_PUBLIC_IP}:3478" || true
        occ talk:turn:add turn,turns "${TURN_PUBLIC_IP}" udp,tcp --secret="${TURN_SHARED_SECRET}" || true
    fi
else
    warn "No TURN server found (../collabora/.env): Talk calls may not connect across networks."
fi
occ talk:bot:install "Boudica" "${TALK_BOT_SECRET}" "nextcloudapp://boudicaai" \
    "Boudica AI assistant - mention @boudica in any conversation" --feature=event || true

# --- 7. Theme -------------------------------------------------------------------------
log "[7/7] Theme"
occ theming:config name "${SITE_TITLE}"
occ theming:config slogan "${SITE_SLOGAN}"
occ theming:config primary_color "${SITE_COLOR}"
occ theming:config background_color "${SITE_BACKGROUND_COLOR:-$SITE_COLOR}"
[[ -n "${SITE_URL:-}" ]] && occ theming:config url "${SITE_URL}"
[[ -n "${SITE_IMPRINT_URL:-}" ]] && occ theming:config imprintUrl "${SITE_IMPRINT_URL}"
[[ -n "${SITE_PRIVACY_URL:-}" ]] && occ theming:config privacyUrl "${SITE_PRIVACY_URL}"
for f in logo logoheader background favicon; do
    for ext in svg png jpg ico; do
        if [[ -f "generated/theme/$f.$ext" ]]; then
            occ theming:config "$f" "/opt/site-theme/$f.$ext" || warn "Theme picture $f not set."
            break
        fi
    done
done
occ config:system:set defaultapp --value="${SITE_DEFAULT_APP:-dashboard}"

echo
echo "${SITE_TITLE} is up: ${PUBLIC_BASE}"
echo "Enabled apps: $(occ app:list --enabled 2>/dev/null | grep -E 'boudica|spreed|calendar|mail|richdocuments|dashboard' | sed -E 's/^ *- ([a-z_]+):.*/\1/' | tr '\n' ' ')"
if [[ "$EXTERNAL_PROXY" == true ]]; then
    echo "Point the host's reverse proxy for ${SITE_MY_DOMAIN} at:"
    echo "  /                 -> http://127.0.0.1:${SITE_NEXTCLOUD_LOCAL_PORT}/"
    echo "  /cool/, /browser, /hosting/discovery, /hosting/capabilities -> http://127.0.0.1:${SITE_COLLABORA_LOCAL_PORT}"
    echo "  /api/boudica/     -> boudica_slm's web service (/api/boudica/)"
    echo "  /boudica-static/  -> boudica_slm's web service"
fi
