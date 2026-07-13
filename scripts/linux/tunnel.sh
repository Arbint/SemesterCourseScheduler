#!/usr/bin/env bash
# tunnel.sh — Start the Cloudflare tunnel for external access.
# The app (launch.sh) should already be running before starting the tunnel.
# Reads .frontend_port written by launch.sh and patches the tunnel config on
# the fly so cloudflared always points at the right port without modifying
# the original config file.
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_common.sh"

if ! command -v cloudflared &>/dev/null; then
    die "cloudflared not found. Install from: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/get-started/"
fi

TUNNEL_CONFIG="$HOME/.cloudflared/schedule-config.yml"
if [[ ! -f "$TUNNEL_CONFIG" ]]; then
    die "Tunnel config not found at $TUNNEL_CONFIG. Set up your tunnel first."
fi

# ── Read the port chosen by launch.sh ─────────────────────────────────────────
PORT_FILE="$ROOT_DIR/.frontend_port"
if [[ ! -f "$PORT_FILE" ]]; then
    die ".frontend_port not found. Run scripts/linux/launch.sh first."
fi
FRONTEND_PORT=$(cat "$PORT_FILE")
log "Frontend port: $FRONTEND_PORT"

# ── Build a temp config with the real port substituted in ─────────────────────
# Replaces any http(s)://localhost:<port> or http(s)://127.0.0.1:<port> line.
TEMP_CONFIG=$(mktemp /tmp/cloudflared-XXXXXX.yml)
sed -E "s@(https?://(localhost|127\.0\.0\.1)):[0-9]+@\1:${FRONTEND_PORT}@g" \
    "$TUNNEL_CONFIG" > "$TEMP_CONFIG"

cleanup() {
    echo ""
    info "Stopping tunnel..."
    kill "$CLOUDFLARED_PID" 2>/dev/null || true
    pkill -P "$CLOUDFLARED_PID" 2>/dev/null || true
    rm -f "$TEMP_CONFIG"
    log "Tunnel stopped."
}
trap cleanup EXIT INT TERM

info "Starting Cloudflare tunnel → frontend port ${FRONTEND_PORT}..."
cloudflared tunnel --config "$TEMP_CONFIG" run &
CLOUDFLARED_PID=$!
log "Cloudflare tunnel started (PID $CLOUDFLARED_PID)."
echo ""
echo "  Press Ctrl+C to stop the tunnel."

wait "$CLOUDFLARED_PID"
