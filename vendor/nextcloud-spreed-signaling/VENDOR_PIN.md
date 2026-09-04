# Vendored from upstream

Source: https://github.com/strukturag/nextcloud-spreed-signaling
Pinned commit: `5c079f7` (`v2.1.1-104-g5c079f7`)
Vendored (copied, `.git` stripped) into this repo on 2026-09-04 as part of
containerizing the Boudica/Nextcloud/Collabora stack — see
`product_templates/collabora/`.

`sfu/janus/janus.go.patch` is a local addition (was untracked in the
original clone, not part of upstream) — enables automatic per-publisher
recording (`"record": true, "rec_dir": "/opt/janus/share/janus/recordings"`)
in `createPublisherRoom()`. Applied during the signaling server's Docker
build. Matches the recording behavior documented in `RUNBOOK.md` §4.2/§4.4/§4.5
for the native `eu1` deployment.

To pull a newer upstream version: re-clone upstream at the desired tag,
diff `sfu/janus/janus.go` against this vendored copy to confirm the patch
still applies cleanly, re-copy (`rsync -a --exclude='.git' ...`), and update
the pinned commit above.
