# Boudica Infrastructure Runbook

Last updated: 2026-08-08
Purpose: recovery reference if `eu1` (or any dependent server) needs to be rebuilt, restored from snapshot, or recreated from scratch.

---

## 1. Architecture Overview

The stack spans **five separate servers**, on **two cloud providers**. This matters: a snapshot of any *one* server does not capture the others, and several configs on each server hardcode the IPs of the others.

| Server | Provider | Role | Private IP | Public IP |
|---|---|---|---|---|
| `eu1.myboudica.com` | Civo | Nextcloud, Collabora, boudicaai app, Janus, signaling server, Whisper, Whiteboard, Postfix | `192.168.1.2` | `74.220.27.198` |
| `myboudica.com` (nginx proxy) | Civo | Public-facing reverse proxy, TLS termination | `192.168.1.3` | `74.220.25.162` |
| `eu.pgbv.myboudica.com` | Civo | Postgres (Nextcloud's database) | `192.168.1.6` | `74.220.30.14` |
| `turn` (eturnal) | GCP | Dedicated TURN/STUN server for Janus | — | `74.220.25.68` *(GCP-assigned, not a Civo IP despite similar format)* |
| `boudi.ca` | GCP | Keycloak, RAG/LoRA inference server | — | `34.61.69.111` |

**Why TURN ended up on GCP, not Civo:** Civo's internal network has a hairpin-NAT bug affecting any two Civo VMs talking to each other in the same region/fabric — TURN allocation permissions were silently rejected (`eturnal` logs: `Rejecting permission creation request: Forbidden ... client 192.168.1.1`, a private gateway address substituted for the real source). Moving TURN to GCP entirely sidesteps this. If TURN is ever moved back to Civo, expect this exact bug to resurface.

---

## 2. Snapshot & Restore Procedure (Civo)

Civo VM snapshots are CLI-only (no web console option) and may be **permission-gated** — if creation fails outright, contact Civo support to enable it for the account.

```bash
# List instances, get the ID for eu1
civo instance ls

# Create a snapshot
civo instance snapshot create <eu1-instance-id> --name eu1-baseline-$(date +%Y%m%d)

# Check status
civo resource-snapshot list

# Restore into a NEW instance (does not overwrite the original)
civo resource-snapshot restore <snapshot-id> --hostname eu1-restored --region <region>
```

**What a snapshot captures:** the entire disk, including Docker's storage layer — meaning the Nextcloud container's *writable layer* (ffmpeg, `janus-pp-rec`, the Apache CSP edit — everything installed live inside the running container today) is captured too, not just the persisted named volumes. This is different from a `docker restart`/container-recreate, which only preserves what's on the `nextcloud_data` volume and loses everything else.

**What a snapshot does NOT capture:**
- The public IP (a new instance gets a new IP)
- Anything on the other four servers
- SendGrid's sender verification (lives in SendGrid's own account, not on any disk)
- DNS records (live at your DNS provider, not on `eu1`)

---

## 3. Post-Restore Checklist

Run through this every time `eu1` is restored from snapshot or rebuilt fresh, **in this order**:

### 3.1 Confirm what actually changed
```bash
curl -s ifconfig.me   # new public IP?
ip addr show enp1s0   # new private IP?
```

### 3.2 If the public IP changed, update every place that references the old one:

| What | Where | How |
|---|---|---|
| DNS A-records | Your DNS provider (not on any server) | Point `myboudica.com`, `talk.myboudica.com`, `whiteboard.myboudica.com` at the new IP — **but note**: the nginx proxy (`myboudica.com`, `192.168.1.3`) is the actual public-facing box; `eu1`'s own public IP is not directly in DNS at all unless something points at it directly. Check current DNS before assuming this needs a change. |
| Janus's `nat_1_1_mapping`/`public_ip` | `/opt/janus/etc/janus/janus.jcfg` on `eu1` itself, `[nat]` block | Update `public_ip = ["<new-ip>"]` |
| Signaling server backend URL | `/etc/nextcloud-spreed-signaling/server.conf`, `[backend]` section | Should reference `myboudica.com` (the domain), not a raw IP — verify, shouldn't need a change |
| Postgres `pg_hba.conf` allowlist | `eu.pgbv.myboudica.com`, `/etc/postgresql/*/main/pg_hba.conf` | Only needs updating if `eu1`'s **private** IP changed (unlikely on same private network) |
| Postgres firewall (`iptables`) | `eu.pgbv.myboudica.com` | Same — only if private IP changed |
| nginx proxy's upstream | `myboudica.com`, `/etc/nginx/sites-available/default`, `upstream backend { server 192.168.1.2:80; }` | Only if `eu1`'s private IP changed |

### 3.3 If the *private* IP changed (less likely, but check)
Every `DOCKER-USER` iptables rule on `eu1` itself, and every firewall rule on the other four servers that allowlists `192.168.1.2` specifically, needs updating. This is the more disruptive scenario — private IPs on the same Civo network *usually* stay stable across a restore into the same region/network, but don't assume it.

### 3.4 Verify Docker container internal IPs are unchanged
```bash
docker inspect nextcloud --format '{{.NetworkSettings.IPAddress}}'
docker inspect nextcloud-whisper --format '{{json .NetworkSettings.Networks}}'
docker inspect nextcloud-whiteboard-server --format '{{.NetworkSettings.IPAddress}}'
```
Compare against the `DOCKER-USER` iptables rules (`sudo iptables -L DOCKER-USER -n -v --line-numbers`) — if the containers came back with *different* internal IPs than before (possible if they start in a different order after a restore), the firewall rules need rebuilding to match. See §4.9 below for the exact commands.

### 3.5 Run the verification script
```bash
bash post-restore-check.sh
```
See §5 — this automates most of the above checks and reports clearly what needs attention, without touching anything itself.

### 3.6 Confirm cron is running
```bash
systemctl status cron
crontab -l
```
Should show the `boudicaai:janus-transcribe` entry (see §4.8). Cron services have been observed not auto-starting after a fresh boot in this environment before — verify, don't assume.

### 3.7 Full end-to-end test
Place one real test call, confirm recording → transcription → email all complete. Don't consider the restore done until this passes.

---

## 4. Full Rebuild Reference (if starting from nothing)

Condensed reference for every fix applied during the original build session. Use this if there's no snapshot at all and `eu1` needs to be built up from a bare OS image.

### 4.1 Signaling server (`nextcloud-spreed-signaling`)
Config at `/etc/nextcloud-spreed-signaling/server.conf`. Common mistakes to avoid (these exact typos broke it originally):
- Section is `[sessions]`, not `[session]`
- `skipverify`, not `verify`
- `servers`, not `apis` (in `[turn]`)
- `secret`, not `apisecret`
- `urls`, not `url` (in `[backend]`)

Working reference config:
```ini
[http]
listen = 0.0.0.0:8081

[sessions]
hashkey = <random hex string>

[backend]
allowed = myboudica.com
secret = <shared secret, must match Nextcloud Talk's admin settings>
skipverify = false

[turn]
servers = turn:<turn-server-ip>:3478?transport=udp,turn:<turn-server-ip>:3478?transport=tcp
apikey = signaling
secret = <TURN shared secret, must match eturnal's `secret:` value>

[mcu]
type = janus
url = ws://127.0.0.1:8188

[rooms]
```
Restart: `systemctl restart nextcloud-spreed-signaling`

### 4.2 Janus (native, not Docker)
Built from source (`meetecho/janus-gateway` on GitHub — repo structure changed at some point, look under `src/`, not the old flat layout).

**Recording patch** — in `janus.go`'s `createPublisherRoom()`, add to `create_msg`:
```go
"record":  true,
"rec_dir": "/opt/janus/share/janus/recordings",
```

**`[nat]` config** — critical: `janus.jcfg` uses **libconfig brace syntax** (`nat: { ... }`), NOT `[nat]` bracket/INI syntax. Using bracket syntax gets silently ignored with no error.
```
nat: {
	nat_1_1_mapping = true
	public_ip = ["<eu1's public IP>"]
	stun_server = "<turn server IP>"
	stun_port = 3478
	turn_server = "<turn server IP>"
	turn_port = 3478
	turn_type = "udp"
	turn_user = "janus"
	turn_pwd = "<matches eturnal's credentials: entry>"
	full_trickle = true
}
```
`full_trickle = true` matters — without it, Janus's own slow STUN/TURN gathering can exceed ICE timeouts.

RTP port range: `rtp_port_range = "20000-25000"` (under `[general]`/`general: {}` in janus.jcfg) — must be open on **every** firewall layer between browsers and Janus (Civo default firewall was fine; GCP/other providers default-deny and need an explicit rule).

### 4.3 TURN server (eturnal, on GCP — not Civo, see §1)
Install: `wget https://eturnal.net/download/linux/package/eturnal_<version>-1_amd64.deb && dpkg -i ...`

Config at `/etc/eturnal.yml`:
```yaml
eturnal:
  secret: "<shared secret, matches signaling server's [turn] secret>"
  relay_ipv4_addr: "<this server's real public IP>"
  listen:
    - ip: "0.0.0.0"
      port: 3478
      transport: udp
    - ip: "0.0.0.0"
      port: 3478
      transport: tcp
  relay_min_port: 49152
  relay_max_port: 65535
  credentials:
    janus: "<static password, matches Janus's turn_pwd>"
  modules:
    mod_log_stun: {}
```
Note: `relay_min_port`/`relay_max_port` are flat keys directly under `eturnal:` — NOT nested under a `relay: {}` block (that key doesn't exist and will crash the service).

GCP firewall needs an explicit rule (default-deny unlike Civo):
```bash
gcloud compute firewall-rules create allow-turn-stun \
  --network=default --direction=INGRESS --action=ALLOW \
  --rules=udp:3478,tcp:3478,udp:49152-65535 --source-ranges=0.0.0.0/0
```

### 4.4 boudicaai Nextcloud app — key files
All under `/var/www/html/custom_apps/boudicaai/` inside the `nextcloud` container. This directory IS on the persisted `nextcloud_data` volume, survives container recreates.

- **`lib/AppInfo/Application.php`** — registers `CallStartedEvent`/`CallEndedEvent` listeners. Must NOT call `registerCommand()` on `IRegistrationContext` (that method doesn't exist — commands register via `info.xml`, not here). This exact bug caused total app failure for a full day before being caught.
- **`lib/Listener/CallRecordingListener.php`** — pure bookkeeping on call start/end (creates/updates `boudicaai_call_transcripts` row), plus participant capture via `OCA\Talk\Service\ParticipantService::getParticipantsForRoom()`. Does NOT try to start/stop recording — Janus records unconditionally already (§4.2). Do not type-hint the `$room` parameter — the exact class name was never verified and a wrong guess caused a fatal, uncaught `TypeError` that broke "start call" entirely for all users.
- **`lib/Service/JanusRecordingMonitor.php`** — scans `/mnt/janus-recordings` (bind-mounted from the host's `/opt/janus/share/janus/recordings`) for new `.mjr` files. Processed-file tracking lives at `/var/www/html/data/boudicaai/janus_processed_recordings.txt` — must be under `/var/www/html/data/`, NOT `/tmp` (not persisted, wiped on container restart).
- **`lib/Service/MjrAudioExtractor.php`** — converts `.mjr` → `.opus` (via `janus-pp-rec`) → `.wav` (via `ffmpeg`, resampled to **16kHz mono** — the raw 48kHz stereo default causes Whisper tensor-shape errors). Only processes `-audio-N.mjr` files, skips `-video-`/`-data-`.
- **`lib/Command/JanusTranscriptionCommand.php`** — the `occ boudicaai:janus-transcribe` cron job. Matches `.mjr` files to `boudicaai_call_transcripts` rows by the microsecond timestamp embedded in the filename, matching **only `pending`-status rows** (not `recording` — matching in-progress calls causes a race condition, since Janus writes files incrementally throughout the call, not just at the end).
- **`lib/Service/TranscriptEmailService.php`** — sends the actual email. `fromAddress` must be a real, SendGrid-verified sender (`boudica@myboudica.com` in this deployment) — a placeholder `.local` address will bounce. Uses `setPlainBody()`/`setHtmlBody()` (single-arg methods) — NOT `setBody()` (doesn't exist as public API) and NOT calling `setTo()` inside a loop (it replaces the recipient list each call, not appends).

### 4.5 `janus-pp-rec` (built from source, not packaged)
Not available via `apt` on Debian Trixie at time of writing. Build inside the `nextcloud` container:
```bash
apt-get install -y build-essential pkg-config git \
  libavformat-dev libavcodec-dev libavutil-dev libogg-dev \
  libjansson-dev libcurl4-openssl-dev libmicrohttpd-dev libnice-dev \
  libssl-dev libsrtp2-dev libsofia-sip-ua-dev libglib2.0-dev \
  libopus-dev gengetopt libtool automake autoconf cmake libconfig-dev
cd /tmp && git clone --depth 1 https://github.com/meetecho/janus-gateway.git
cd janus-gateway
./autogen.sh
./configure --enable-post-processing --disable-websockets --disable-mqtt --disable-nanomsg --disable-rabbitmq --disable-turn-rest-api
make
cp src/janus-pp-rec /usr/local/bin/
```
`ffmpeg` also needs installing separately: `apt-get install -y ffmpeg`. **Both are lost on container recreate** (not on the persisted volume) — see §6 for the permanent fix (custom Dockerfile).

### 4.6 Postfix (mail relay)
Common failure: `inet_interfaces` pinned to a specific Docker bridge IP that doesn't exist yet at boot time (Postfix starts before Docker's network is up):
```
inet_interfaces = all
mynetworks = 127.0.0.0/8, 172.17.0.0/16
```
Ordering fix so this doesn't recur:
```bash
mkdir -p /etc/systemd/system/postfix.service.d
cat > /etc/systemd/system/postfix.service.d/override.conf <<'EOF'
[Unit]
After=docker.service
Requires=docker.service
EOF
systemctl daemon-reload
```
SendGrid as the actual outbound relay requires the `From` address to be a verified Single Sender or on an authenticated domain in SendGrid's dashboard — this is external to the server entirely, won't be captured by any snapshot.

### 4.7 Nextcloud's own mail config
```bash
occ config:system:get mail_smtphost   # should be 172.17.0.1 (Postfix via Docker bridge gateway) or similar
occ config:system:get mail_from_address
occ config:system:get mail_domain
```

### 4.8 Cron
```bash
apt install -y cron
systemctl enable --now cron
crontab -e
```
Add:
```
*/2 * * * * /usr/bin/flock -n /tmp/boudica-transcribe.lock docker exec -u www-data nextcloud php occ boudicaai:janus-transcribe >> /var/log/boudica-transcribe.log 2>&1
```

### 4.9 Firewall — `eu1`
Docker-published ports (Nextcloud/Whisper/Whiteboard) need `DOCKER-USER` chain rules matching the **container's internal IP and port** (not the published host port — DNAT rewrites this before `DOCKER-USER` ever sees the packet):
```bash
docker inspect nextcloud --format '{{.NetworkSettings.IPAddress}}'          # e.g. 172.17.0.3, internal port 80
docker inspect nextcloud-whisper --format '{{json .NetworkSettings.Networks}}'  # own bridge network, e.g. 172.18.0.2:5000
docker inspect nextcloud-whiteboard-server --format '{{.NetworkSettings.IPAddress}}'  # e.g. 172.17.0.2:3002

iptables -F DOCKER-USER
# repeat per service, using -A (append) not -I (insert) — -I in a loop reorders rules incorrectly
iptables -A DOCKER-USER -d <container-ip> -p tcp --dport <internal-port> -s 192.168.1.3 -j ACCEPT
iptables -A DOCKER-USER -d <container-ip> -p tcp --dport <internal-port> -s 127.0.0.1 -j ACCEPT
iptables -A DOCKER-USER -d <container-ip> -p tcp --dport <internal-port> -j DROP
# ... repeat for each service ...
iptables -A DOCKER-USER -j RETURN
```
Host-level Apache/Collabora/signaling — restrict to the nginx proxy's IP only:
```bash
for port in 80 443 9980 8081; do
  iptables -A INPUT -p tcp --dport $port -s 192.168.1.3 -j ACCEPT
  iptables -A INPUT -p tcp --dport $port -s 127.0.0.1 -j ACCEPT
  iptables -A INPUT -p tcp --dport $port -j DROP
done
```
Postfix (25) — restrict to localhost + Docker bridge only (never the public internet):
```bash
iptables -A INPUT -p tcp --dport 25 -s 172.17.0.0/16 -j ACCEPT
iptables -A INPUT -p tcp --dport 25 -s 127.0.0.1 -j ACCEPT
iptables -A INPUT -p tcp --dport 25 -j DROP
```
Save: `apt install -y iptables-persistent && netfilter-persistent save`

### 4.10 Firewall — other servers
- **Postgres** (`eu.pgbv`): `pg_hba.conf` restrict to `192.168.1.2/32` only; `listen_addresses = '192.168.1.6,127.0.0.1'`; `iptables` restrict port 5432 to `192.168.1.2` + localhost.
- **nginx proxy**: SSH hardening (`PermitRootLogin prohibit-password`, `PasswordAuthentication no`), `fail2ban`, baseline `iptables` (22/80/443 only, default-deny rest). This box's `80`/`443` stay genuinely public — it's the real internet-facing entry point.

### 4.11 CSP fix for `boudi.ca` cross-origin fetch
Inside the `nextcloud` container, `/etc/apache2/sites-available/000-default.conf` (lost on container recreate — not on the persisted volume):
```apache
Header edit Content-Security-Policy "connect-src [^;]*" "connect-src 'self' wss: https://boudi.ca"
Header edit Content-Security-Policy "script-src 'self'" "script-src 'self' https://boudi.ca"
Header edit Content-Security-Policy "default-src 'self'" "default-src 'self' https://boudi.ca"
```
Requires `a2enmod headers` and `apache2ctl graceful`. This is explicitly a **stopgap** — the real fix (proxying `boudi.ca` calls server-side through PHP rather than direct browser fetch) was deferred, see `Application.php`'s comment at the old CSP registration site.

### 4.12 RAG corpus External Storage mount
Nextcloud Admin → External Storage → SFTP, `Root: corpus/$user`, pointed at `boudi.ca`'s `nextcloud-mount` user (SFTP-chrooted to `/var/boudica`). Requires:
- Dedicated `nextcloud-mount` user on `boudi.ca`, home `/var/boudica`, shell `nologin`
- `Match User nextcloud-mount` block in `boudi.ca`'s `sshd_config` with `ChrootDirectory /var/boudica` + `ForceCommand internal-sftp`
- ACL granting `nextcloud-mount` access to `corpus/` without disturbing `www-data`'s existing ownership: `setfacl -R -m u:nextcloud-mount:rwx /var/boudica/corpus` + matching `-d` default ACL so new per-user folders inherit it automatically
- **Private key must be RSA in PEM format** (`ssh-keygen -t rsa -b 4096 -m PEM`) — Nextcloud's SFTP backend (`phpseclib`) failed to parse a modern OpenSSH-format ED25519 key
- The inference server's own folder-sanitizer must allow `@` in folder names (it's a completely safe filename character) — without this, folder names on disk never match Nextcloud's `$user` placeholder (the literal email address) at all

---

## 5. `post-restore-check.sh`

See the accompanying script. Run it on `eu1` after any restore or rebuild — it's read-only, reports status, makes no changes itself.

---

## 6. Known Fragility — Worth Fixing Properly Eventually

Several fixes today live on the Nextcloud container's **writable layer**, not the persisted volume — meaning a plain `docker restart`/recreate (as opposed to a full disk snapshot) loses them:
- `ffmpeg`, `janus-pp-rec` (§4.5)
- The Apache CSP `Header edit` config (§4.11)

The durable fix: a small custom `Dockerfile` extending `nextcloud:latest`, baking these in at build time instead of live `docker exec`/`apt install`. Not done today — flagged as a real follow-up, since this exact class of "it worked, then vanished" surprise cost significant time throughout this build.
