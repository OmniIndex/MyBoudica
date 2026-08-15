#!/usr/bin/env bash
#
# post-restore-check.sh
#
# Read-only verification script for eu1 after a snapshot restore or fresh
# rebuild. Makes NO changes to any system, local or remote — only reports
# status and flags what needs manual attention, per RUNBOOK.md section 3.
#
# Run as root on eu1 itself.

set -uo pipefail

STATE_FILE="/root/.eu1-last-known-state"
PASS="\033[32m[OK]\033[0m"
WARN="\033[33m[CHECK]\033[0m"
FAIL="\033[31m[FAIL]\033[0m"

echo "=============================================="
echo " Boudica / eu1 post-restore verification"
echo " $(date)"
echo "=============================================="
echo

# ---------------------------------------------------------------------------
# 1. IP addresses — the single most disruptive thing that can change
# ---------------------------------------------------------------------------
echo "--- Network identity ---"

CURRENT_PUBLIC_IP=$(curl -s --max-time 5 ifconfig.me || echo "UNKNOWN")
CURRENT_PRIVATE_IP=$(ip -4 addr show enp1s0 2>/dev/null | grep -oP '(?<=inet\s)\d+(\.\d+){3}' | head -1)
[ -z "$CURRENT_PRIVATE_IP" ] && CURRENT_PRIVATE_IP="UNKNOWN"

echo "Current public IP:  $CURRENT_PUBLIC_IP"
echo "Current private IP: $CURRENT_PRIVATE_IP"

if [ -f "$STATE_FILE" ]; then
    LAST_PUBLIC_IP=$(grep "^public_ip=" "$STATE_FILE" | cut -d= -f2)
    LAST_PRIVATE_IP=$(grep "^private_ip=" "$STATE_FILE" | cut -d= -f2)

    if [ "$CURRENT_PUBLIC_IP" != "$LAST_PUBLIC_IP" ]; then
        echo -e "$FAIL Public IP CHANGED: $LAST_PUBLIC_IP -> $CURRENT_PUBLIC_IP"
        echo "         -> Update DNS records (myboudica.com etc, at your DNS provider)"
        echo "         -> Update Janus's [nat] public_ip in janus.jcfg (RUNBOOK.md 4.2)"
        echo "         -> Check whether any other server's firewall allowlists the old IP"
    else
        echo -e "$PASS Public IP unchanged"
    fi

    if [ "$CURRENT_PRIVATE_IP" != "$LAST_PRIVATE_IP" ]; then
        echo -e "$FAIL Private IP CHANGED: $LAST_PRIVATE_IP -> $CURRENT_PRIVATE_IP"
        echo "         -> Update pg_hba.conf + firewall on eu.pgbv.myboudica.com (192.168.1.6)"
        echo "         -> Update nginx proxy's upstream (myboudica.com, 192.168.1.3)"
        echo "         -> Rebuild DOCKER-USER firewall rules if source restrictions reference this IP"
    else
        echo -e "$PASS Private IP unchanged"
    fi
else
    echo -e "$WARN No previous state recorded — this looks like the first run."
    echo "         Run with --save-state after confirming everything is correct,"
    echo "         to establish a baseline for future comparisons."
fi
echo

# ---------------------------------------------------------------------------
# 2. Docker container internal IPs
# ---------------------------------------------------------------------------
echo "--- Docker container internal IPs ---"

NC_IP=$(docker inspect nextcloud --format '{{.NetworkSettings.IPAddress}}' 2>/dev/null)
WB_IP=$(docker inspect nextcloud-whiteboard-server --format '{{.NetworkSettings.IPAddress}}' 2>/dev/null)
WH_IP=$(docker inspect nextcloud-whisper --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' 2>/dev/null)

echo "nextcloud:                  ${NC_IP:-NOT RUNNING}"
echo "nextcloud-whiteboard-server: ${WB_IP:-NOT RUNNING}"
echo "nextcloud-whisper:           ${WH_IP:-NOT RUNNING}"

if [ -f "$STATE_FILE" ]; then
    LAST_NC_IP=$(grep "^nextcloud_ip=" "$STATE_FILE" | cut -d= -f2)
    if [ -n "$NC_IP" ] && [ "$NC_IP" != "$LAST_NC_IP" ]; then
        echo -e "$FAIL nextcloud container IP changed ($LAST_NC_IP -> $NC_IP)"
        echo "         -> DOCKER-USER firewall rules need rebuilding (RUNBOOK.md 4.9)"
    fi
fi
echo

# ---------------------------------------------------------------------------
# 3. Critical services
# ---------------------------------------------------------------------------
echo "--- Critical services ---"

check_service() {
    local name=$1
    if systemctl is-active --quiet "$name" 2>/dev/null; then
        echo -e "$PASS $name: active"
    else
        echo -e "$FAIL $name: NOT active"
    fi
}

check_service docker
check_service janus
check_service nextcloud-spreed-signaling
check_service postfix
check_service apache2
check_service cron

echo

# ---------------------------------------------------------------------------
# 4. Docker containers
# ---------------------------------------------------------------------------
echo "--- Docker containers ---"

for c in nextcloud nextcloud-whisper nextcloud-whiteboard-server; do
    STATUS=$(docker inspect --format '{{.State.Status}}' "$c" 2>/dev/null)
    if [ "$STATUS" = "running" ]; then
        echo -e "$PASS $c: running"
    else
        echo -e "$FAIL $c: ${STATUS:-not found}"
    fi
done
echo

# ---------------------------------------------------------------------------
# 5. Container-internal tools that live on the writable layer
#    (lost on container recreate, NOT lost on a full disk snapshot restore —
#    see RUNBOOK.md section 6)
# ---------------------------------------------------------------------------
echo "--- Container-internal tools (fragile across container recreates) ---"

if docker exec nextcloud which ffmpeg >/dev/null 2>&1; then
    echo -e "$PASS ffmpeg present in nextcloud container"
else
    echo -e "$FAIL ffmpeg MISSING — apt-get install -y ffmpeg (RUNBOOK.md 4.5)"
fi

if docker exec nextcloud which janus-pp-rec >/dev/null 2>&1; then
    echo -e "$PASS janus-pp-rec present in nextcloud container"
else
    echo -e "$FAIL janus-pp-rec MISSING — rebuild from source (RUNBOOK.md 4.5)"
fi

if docker exec nextcloud grep -q "boudi.ca" /etc/apache2/sites-available/000-default.conf 2>/dev/null; then
    echo -e "$PASS CSP boudi.ca allowance present"
else
    echo -e "$WARN CSP boudi.ca allowance not found — re-apply if RAG corpus testing is needed (RUNBOOK.md 4.11)"
fi
echo

# ---------------------------------------------------------------------------
# 6. Firewall state
# ---------------------------------------------------------------------------
echo "--- Firewall (DOCKER-USER chain) ---"
if iptables -L DOCKER-USER -n 2>/dev/null | grep -q DROP; then
    echo -e "$PASS DOCKER-USER chain has DROP rules configured"
    echo "         (verify these match current container IPs above — see section 2)"
else
    echo -e "$FAIL DOCKER-USER chain has no DROP rules — Nextcloud/Whisper/Whiteboard"
    echo "         may be directly internet-reachable, bypassing the nginx proxy entirely."
    echo "         -> Rebuild per RUNBOOK.md 4.9"
fi
echo

# ---------------------------------------------------------------------------
# 7. Recordings bind mount
# ---------------------------------------------------------------------------
echo "--- Janus recordings bind mount ---"
HOST_COUNT=$(ls /opt/janus/share/janus/recordings/ 2>/dev/null | wc -l)
CONTAINER_COUNT=$(docker exec nextcloud ls /mnt/janus-recordings/ 2>/dev/null | wc -l)

if [ "$HOST_COUNT" = "$CONTAINER_COUNT" ] && [ "$HOST_COUNT" -ge 0 ]; then
    echo -e "$PASS Bind mount consistent ($HOST_COUNT files visible on both sides)"
else
    echo -e "$FAIL Bind mount MISMATCH: host sees $HOST_COUNT files, container sees $CONTAINER_COUNT"
    echo "         This is the orphaned-mount bug (RUNBOOK.md) — usually fixed by:"
    echo "         docker restart nextcloud"
fi
echo

# ---------------------------------------------------------------------------
# 8. Cron job
# ---------------------------------------------------------------------------
echo "--- Cron ---"
if crontab -l 2>/dev/null | grep -q "janus-transcribe"; then
    echo -e "$PASS janus-transcribe cron entry present"
else
    echo -e "$FAIL janus-transcribe cron entry MISSING — re-add per RUNBOOK.md 4.8"
fi
echo

# ---------------------------------------------------------------------------
# 9. External connectivity spot-checks (read-only)
# ---------------------------------------------------------------------------
echo "--- External connectivity (read-only checks) ---"

check_port() {
    local host=$1 port=$2 label=$3
    if timeout 5 bash -c "echo > /dev/tcp/$host/$port" 2>/dev/null; then
        echo -e "$PASS $label ($host:$port) reachable"
    else
        echo -e "$WARN $label ($host:$port) NOT reachable — check if expected"
    fi
}

check_port 192.168.1.6 5432 "Postgres (eu.pgbv)"
check_port 74.220.25.68 3478 "TURN server"
check_port 34.61.69.111 22 "boudi.ca SSH (for RAG corpus mount)"
echo

echo "=============================================="
echo " Done. Review any [FAIL] or [CHECK] lines above."
echo " This script made no changes — all fixes are manual, per RUNBOOK.md."
echo "=============================================="

# ---------------------------------------------------------------------------
# Optional: save current state as the new baseline for future comparisons
# ---------------------------------------------------------------------------
if [ "${1:-}" = "--save-state" ]; then
    {
        echo "public_ip=$CURRENT_PUBLIC_IP"
        echo "private_ip=$CURRENT_PRIVATE_IP"
        echo "nextcloud_ip=$NC_IP"
        echo "saved_at=$(date -Iseconds)"
    } > "$STATE_FILE"
    echo
    echo "State saved to $STATE_FILE as new baseline."
fi
