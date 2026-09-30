#!/usr/bin/env bash
# Community MyBoudica installer: a second, smaller Nextcloud for a community
# site (boudica_slm's content/community_boudica), safe for under-18s. See
# docker-compose.yml for what it leaves out compared with ../collabora.
#
# What residents get: their own files, documents (Collabora), the AI helper
# (boudicaai) and the coding assistant (boudicacode). What they do NOT get:
# chat or calls between users (Talk is never installed), whiteboard, the
# Boudica dashboard, agents, and sharing of any kind between users.
#
# Needs boudica_slm's multiuser stack running first (shared Postgres,
# Keycloak and API on the boudica_shared network). Can sit beside the full
# MyBoudica (../collabora) on the same box. Safe to re-run.
#
# Unattended: BOUDICA_UNATTENDED=1 with every answer below set as an
# environment variable of the same name.

set -euo pipefail

log()  { echo -e "\n\033[1;34m==> $*\033[0m"; }
warn() { echo -e "\033[1;33m[warn] $*\033[0m" >&2; }
die()  { echo -e "\033[1;31m[error] $*\033[0m" >&2; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

ask() {
    local var="$1" prompt="$2"
    if [[ "${BOUDICA_UNATTENDED:-0}" == 1 ]]; then
        [[ -n "${!var+x}" ]] || die "Unattended install: ${var} is not set."
        return 0
    fi
    if [[ "${3:-}" == secret ]]; then read -rsp "$prompt" "$var"; echo; else read -rp "$prompt" "$var"; fi
}

# --- 1. Prerequisites ---------------------------------------------------------
log "[1/6] Checking prerequisites"
command -v docker >/dev/null 2>&1 || die "Docker not found."
docker compose version >/dev/null 2>&1 || die "docker compose (v2 plugin) not found."
command -v openssl >/dev/null 2>&1 || die "openssl not found."
docker network inspect boudica_shared >/dev/null 2>&1 || die "No boudica_shared network: boudica_slm's multiuser stack must be running first."
docker run --rm --network boudica_shared curlimages/curl:latest -s -m 5 -o /dev/null \
    http://web:80/api/boudica/health 2>/dev/null || die "Can't reach boudica_slm's 'web' service on boudica_shared."

# --- 2. Details ---------------------------------------------------------------
log "[2/6] Deployment details"
ask COMMUNITY_NAME "Short name of the community, lowercase letters only (e.g. eyemouth): "
[[ "$COMMUNITY_NAME" =~ ^[a-z][a-z0-9]{1,30}$ ]] || die "The community name must be lowercase letters and digits."
ask COMMUNITY_MY_DOMAIN "Address of this MyBoudica (e.g. my.eyemouth.example.org): "
[[ -n "$COMMUNITY_MY_DOMAIN" ]] || die "An address is required."
ask COMMUNITY_ACCOUNT_DOMAIN "Account domain of the community's residents (e.g. eyemouth.example.org): "
[[ -n "$COMMUNITY_ACCOUNT_DOMAIN" ]] || die "The residents' account domain is required."
ask EXTERNAL_PROXY_ANSWER "Does a host-level reverse proxy terminate TLS for ${COMMUNITY_MY_DOMAIN}? [y/N]: "
case "${EXTERNAL_PROXY_ANSWER,,}" in y|yes) EXTERNAL_PROXY=true ;; *) EXTERNAL_PROXY=false ;; esac
ask COMMUNITY_HTTPS_PORT "HTTPS port browsers use [443]: "
COMMUNITY_HTTPS_PORT="${COMMUNITY_HTTPS_PORT:-443}"
ask COMMUNITY_NEXTCLOUD_LOCAL_PORT "Loopback port for Nextcloud [8092]: "
COMMUNITY_NEXTCLOUD_LOCAL_PORT="${COMMUNITY_NEXTCLOUD_LOCAL_PORT:-8092}"
ask COMMUNITY_COLLABORA_LOCAL_PORT "Loopback port for Collabora [8093]: "
COMMUNITY_COLLABORA_LOCAL_PORT="${COMMUNITY_COLLABORA_LOCAL_PORT:-8093}"
# Where this site's /api/boudica/ calls go. For a community this should be
# the community service's guarded route (its crisis, personal-detail and
# rule-pack checks), not Boudica's API directly.
ask COMMUNITY_API_UPSTREAM "Upstream for /api/boudica/ (bundled proxy only) [http://community:8095]: "
COMMUNITY_API_UPSTREAM="${COMMUNITY_API_UPSTREAM:-http://community:8095}"
ask BOUDICA_KEYCLOAK_PUBLIC_URL "Public URL of boudica_slm's Keycloak (its .env KEYCLOAK_URL): "
[[ -n "$BOUDICA_KEYCLOAK_PUBLIC_URL" ]] || die "The Keycloak URL is required for sign-in."
ask BOUDICA_KEYCLOAK_INTERNAL_URL "Keycloak address on the shared network [http://keycloak:8080/kc]: "
BOUDICA_KEYCLOAK_INTERNAL_URL="${BOUDICA_KEYCLOAK_INTERNAL_URL:-http://keycloak:8080/kc}"
ask BOUDICA_SLM_DBA_PASSWORD "boudica_slm's BOUDICA_DBA_PASSWORD: " secret
[[ -n "$BOUDICA_SLM_DBA_PASSWORD" ]] || die "That password is required to create this site's database."
ask BOUDICA_SLM_KEYCLOAK_ADMIN_PASSWORD "boudica_slm's KEYCLOAK_ADMIN_PASSWORD: " secret
[[ -n "$BOUDICA_SLM_KEYCLOAK_ADMIN_PASSWORD" ]] || die "That password is required to register this site's sign-in client."

COMMUNITY_DB_NAME="nextcloud_${COMMUNITY_NAME}"
KC_CLIENT_ID="boudica-nextcloud-${COMMUNITY_NAME}"
COMMUNITY_PUBLIC_HOST="${COMMUNITY_MY_DOMAIN}$([[ "$COMMUNITY_HTTPS_PORT" == 443 ]] || echo ":${COMMUNITY_HTTPS_PORT}")"
PUBLIC_BASE="https://${COMMUNITY_PUBLIC_HOST}"
API_ENDPOINT="${PUBLIC_BASE}/api/boudica/chat"

# --- 3. Secrets and .env --------------------------------------------------------
log "[3/6] Settings"
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
COMMUNITY_DB_PASSWORD=$(gen_secret)
REDIS_PASSWORD=$(gen_secret)
EOF
    umask 022
    echo "Generated this site's own secrets (.env - keep it private)."
else
    echo ".env exists: keeping its secrets."
fi
persist COMMUNITY_NAME "$COMMUNITY_NAME"
persist COMMUNITY_DB_NAME "$COMMUNITY_DB_NAME"
persist COMMUNITY_MY_DOMAIN "$COMMUNITY_MY_DOMAIN"
persist COMMUNITY_HTTPS_PORT "$COMMUNITY_HTTPS_PORT"
persist COMMUNITY_PUBLIC_HOST "$COMMUNITY_PUBLIC_HOST"
persist COMMUNITY_NEXTCLOUD_LOCAL_PORT "$COMMUNITY_NEXTCLOUD_LOCAL_PORT"
persist COMMUNITY_COLLABORA_LOCAL_PORT "$COMMUNITY_COLLABORA_LOCAL_PORT"
if [[ "$EXTERNAL_PROXY" == true ]]; then persist COMPOSE_PROFILES ""; else persist COMPOSE_PROFILES "bundled-proxy"; fi
chmod 600 .env
# shellcheck disable=SC1091
source .env

mkdir -p generated/nextcloud generated/collabora generated/nginx/certs
sed -e "s#__BOUDICA_API_ORIGIN__#${PUBLIC_BASE}#g" ../collabora/nextcloud/boudica-csp.conf > generated/nextcloud/boudica-csp.conf
sed -e "s#__BOUDICA_API_BASE__#${PUBLIC_BASE}/api/boudica#g" ../collabora/collabora/boudica-config.js > generated/collabora/boudica-config.js
if [[ "$EXTERNAL_PROXY" != true ]]; then
    sed -e "s#__DOMAIN__#${COMMUNITY_MY_DOMAIN}#g" -e "s#__HTTPS_PORT__#${COMMUNITY_HTTPS_PORT}#g" \
        -e "s#__API_UPSTREAM__#${COMMUNITY_API_UPSTREAM}#g" nginx/default.conf > generated/nginx/default.conf
    if [[ ! -f generated/nginx/certs/fullchain.pem ]]; then
        openssl req -x509 -nodes -newkey rsa:2048 -days 3650 -keyout generated/nginx/certs/privkey.pem \
            -out generated/nginx/certs/fullchain.pem -subj "/CN=${COMMUNITY_MY_DOMAIN}" \
            -addext "subjectAltName=DNS:${COMMUNITY_MY_DOMAIN}" >/dev/null 2>&1
        echo "Generated a self-signed certificate for ${COMMUNITY_MY_DOMAIN}."
    fi
fi

# --- 4. Database and sign-in client ---------------------------------------------
log "[4/6] Database ${COMMUNITY_DB_NAME} and Keycloak client ${KC_CLIENT_ID}"
pg() { docker run --rm -i --network boudica_shared -e PGPASSWORD="$BOUDICA_SLM_DBA_PASSWORD" postgres:17 psql -h postgres -U boudislm_dba "$@"; }
pg -d postgres -v ON_ERROR_STOP=1 -q <<SQL
DO \$\$
BEGIN
   IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '${COMMUNITY_DB_NAME}') THEN
      CREATE ROLE ${COMMUNITY_DB_NAME} WITH LOGIN CREATEROLE CREATEDB PASSWORD '${COMMUNITY_DB_PASSWORD}';
   END IF;
END
\$\$;
SQL
pg -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='${COMMUNITY_DB_NAME}'" | grep -q 1 || \
    pg -d postgres -q -c "CREATE DATABASE ${COMMUNITY_DB_NAME} OWNER ${COMMUNITY_DB_NAME};"
pg -d "${COMMUNITY_DB_NAME}" -q -c "GRANT ALL ON SCHEMA public TO ${COMMUNITY_DB_NAME};"

kcurl() { docker run --rm --network boudica_shared curlimages/curl:latest -s "$@"; }
KC_ADMIN_TOKEN="$(kcurl -d grant_type=password -d client_id=admin-cli -d username=admin \
    --data-urlencode "password=${BOUDICA_SLM_KEYCLOAK_ADMIN_PASSWORD}" \
    "${BOUDICA_KEYCLOAK_INTERNAL_URL}/realms/master/protocol/openid-connect/token" \
    | sed -E 's/.*"access_token":"([^"]+)".*/\1/')"
[[ -n "$KC_ADMIN_TOKEN" && "$KC_ADMIN_TOKEN" != *'{'* && "$KC_ADMIN_TOKEN" != *'<'* ]] || \
    die "Could not authenticate to Keycloak's admin API at ${BOUDICA_KEYCLOAK_INTERNAL_URL}."
REDIRECT_URI="${PUBLIC_BASE}/apps/boudicaai/keycloak/callback"
LOGOUT_URI="${PUBLIC_BASE}/logout*"
CLIENT_JSON="{\"clientId\":\"${KC_CLIENT_ID}\",\"name\":\"Community MyBoudica login (${COMMUNITY_NAME})\",\"enabled\":true,\"publicClient\":true,\"protocol\":\"openid-connect\",\"standardFlowEnabled\":true,\"implicitFlowEnabled\":false,\"directAccessGrantsEnabled\":false,\"redirectUris\":[\"${REDIRECT_URI}\"],\"webOrigins\":[\"${PUBLIC_BASE}\"],\"attributes\":{\"pkce.code.challenge.method\":\"S256\",\"post.logout.redirect.uris\":\"${LOGOUT_URI}\"}}"
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
log "[5/6] Starting containers"
docker compose up -d community-redis
docker compose up -d
echo "Waiting for Nextcloud's first-boot install..."
until docker compose exec -u www-data -T community-nextcloud php occ status 2>/dev/null | grep -q "installed: true"; do sleep 3; done

# --- 6. Configure Nextcloud --------------------------------------------------------
log "[6/6] Configuring Nextcloud"
occ() { docker compose exec -u www-data -T community-nextcloud php occ "$@"; }
docker compose exec -T community-nextcloud chown www-data:www-data /var/www/html/custom_apps

occ app:enable boudicaai
occ app:enable boudicacode
occ config:app:set boudicaai api_endpoint --value="${API_ENDPOINT}"
occ config:app:set boudicaai keycloak_url --value="${BOUDICA_KEYCLOAK_PUBLIC_URL}"
occ config:app:set boudicaai keycloak_internal_url --value="${BOUDICA_KEYCLOAK_INTERNAL_URL}"
occ config:app:set boudicaai keycloak_realm --value="boudica"
occ config:app:set boudicaai keycloak_client_id --value="${KC_CLIENT_ID}"
# Only the community's own accounts may sign in here.
occ config:app:set boudicaai login_allowed_domains --value="${COMMUNITY_ACCOUNT_DOMAIN}"

# Documents: the Collabora connector comes from the app store, so it has to
# be installed before the app store is switched off below.
occ app:install richdocuments >/dev/null 2>&1 || occ app:enable richdocuments || true

# No contact between users. Talk is never installed; these switch off the
# other ways one Nextcloud user can reach or see another: sharing (files,
# links, mail, other servers), comments, user search, status and profiles.
for app in spreed files_sharing sharebymail federatedfilesharing federation comments user_status \
           contactsinteraction circles weather_status dashboard firstrunwizard recommendations \
           survey_client updatenotification support nextcloud_announcements app_api; do
    occ app:disable "$app" >/dev/null 2>&1 || true
done
occ config:app:set core shareapi_enabled --value=no
occ config:app:set core shareapi_allow_links --value=no
occ config:app:set core shareapi_allow_share_dialog_user_enumeration --value=no
occ config:app:set files_sharing outgoing_server2server_share_enabled --value=no
occ config:app:set files_sharing incoming_server2server_share_enabled --value=no
occ config:system:set profile.enabled --value=false --type=boolean
occ config:system:set defaultapp --value=files
occ config:system:set appstoreenabled --value=false --type=boolean
occ config:system:set simpleSignUpLink.shown --value=false --type=boolean
occ config:system:set lost_password_link --value=disabled

occ config:app:set richdocuments wopi_url --value="${PUBLIC_BASE}"
# The bundled proxy's certificate is self-signed, which Nextcloud would
# refuse when it fetches Collabora's discovery document. A host proxy has a
# real certificate, so verification stays on there.
if [[ "$EXTERNAL_PROXY" != true ]]; then
    occ config:app:set richdocuments disable_certificate_verification --value=yes
fi
occ richdocuments:activate-config || true

occ theming:config name "My Boudica"
occ theming:config slogan "Your own private space"
occ theming:config primary_color "#D3A54A"
occ theming:config background_color "#f1ede4"
docker compose exec -u www-data -T community-nextcloud php /opt/boudica-theming/apply-theming.php || true

echo
echo "Community MyBoudica is up: ${PUBLIC_BASE}"
echo "Enabled Boudica apps: $(occ app:list --enabled 2>/dev/null | grep -E 'boudica' | tr -d ' -' | tr '\n' ' ')"
if [[ "$EXTERNAL_PROXY" == true ]]; then
    echo "Point the host's reverse proxy for ${COMMUNITY_MY_DOMAIN} at:"
    echo "  /                 -> http://127.0.0.1:${COMMUNITY_NEXTCLOUD_LOCAL_PORT}/"
    echo "  /cool/, /browser, /hosting/discovery, /hosting/capabilities -> http://127.0.0.1:${COMMUNITY_COLLABORA_LOCAL_PORT}"
    echo "  /api/boudica/     -> the community service's guarded route"
    echo "  /boudica-static/  -> boudica_slm's web service"
fi
