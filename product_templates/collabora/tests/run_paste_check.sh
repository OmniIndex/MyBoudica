#!/usr/bin/env bash
# Paste check for the Collabora widget (2026-11-19). Run before every
# deploy of boudica_widget.js; takes ~20 s, needs Docker, no model, no browser.
#
# It renders tests/paste_fixture.md exactly as the widget pastes a written
# document (renderMarkdown(text, true)), imports that with Collabora's own
# markdown import (soffice from the Collabora image, the same import a paste
# goes through), and checks the result: real tables, a text-drawn diagram
# with its lines and spacing, headings, real lists, no placeholders.
#
# Why: on 2026-11-19 a ts-1 document came out with its tables as "|---|"
# text and its drawn diagrams as rows of dashes. The widget had always
# broken tables and code blocks; the local test documents had neither,
# so nothing showed it.
#
#   tests/run_paste_check.sh [widget.js] [collabora image]
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
WIDGET=${1:-$HERE/../collabora/boudica_widget.js}
IMAGE=${2:-git.omniindex.io:5050/omniindex/boudica-collabora/collabora:latest}
NODE_IMAGE=node:22-alpine

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
chmod 777 "$WORK"
cp "$WIDGET" "$WORK/widget.js"
cp "$HERE/render_paste.js" "$HERE/paste_fixture.md" "$WORK/"

docker run --rm -u "$(id -u):$(id -g)" -v "$WORK:/t" -w /t "$NODE_IMAGE" \
    sh -c 'node --check widget.js && node render_paste.js widget.js paste_fixture.md paste.md'

mkdir -p "$WORK/home"
# A fresh profile: soffice's first start only sets the profile up and exits
# (it expects a restart), so a second start does the conversion.
for attempt in 1 2; do
    docker run --rm -u "$(id -u):$(id -g)" -v "$WORK:/w" -e HOME=/w/home \
        --entrypoint /opt/collaboraoffice/program/soffice.bin "$IMAGE" \
        -env:UserInstallation=file:///w/profile --headless --norestore \
        --infilter=Markdown --convert-to odt --outdir /w /w/paste.md > "$WORK/soffice.log" 2>&1 || true
    [ -s "$WORK/paste.odt" ] && break
done
if [ ! -s "$WORK/paste.odt" ]; then
    echo "PASTE CHECK FAILED: Collabora could not import the rendered paste"; grep -v "^warn" "$WORK/soffice.log" | tail -5
    exit 1
fi
python3 -I "$HERE/check_paste.py" "$WORK/paste.odt"
