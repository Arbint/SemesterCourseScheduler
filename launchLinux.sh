#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPTS="$SCRIPT_DIR/scripts/linux"

GREEN='\033[0;32m'; CYAN='\033[0;36m'; RED='\033[0;31m'; NC='\033[0m'
log()  { echo -e "${GREEN}[✓]${NC} $*"; }
info() { echo -e "${CYAN}[…]${NC} $*"; }
die()  { echo -e "${RED}[✗]${NC} $*" >&2; exit 1; }

# ── 1. Setup ──────────────────────────────────────────────────────────────────
info "Running setup..."
"$SCRIPTS/setup.sh"

# ── 2. Launch servers ─────────────────────────────────────────────────────────
info "Launching servers..."
rm -f "$SCRIPT_DIR/.frontend_port"   # clear stale port from a previous run
"$SCRIPTS/launch.sh" &
LAUNCH_PID=$!

# Wait until launch.sh has written the port file (timeout 30s)
info "Waiting for servers to bind..."
TIMEOUT=30
ELAPSED=0
until [[ -f "$SCRIPT_DIR/.frontend_port" ]]; do
    sleep 1
    ELAPSED=$((ELAPSED + 1))
    [[ $ELAPSED -ge $TIMEOUT ]] && die "Timed out waiting for launch.sh to write .frontend_port"
done
log "Servers are up."

# ── 3. Tunnel ─────────────────────────────────────────────────────────────────
info "Starting tunnel..."
"$SCRIPTS/tunnel.sh" &
TUNNEL_PID=$!

# ── Cleanup on exit ───────────────────────────────────────────────────────────
cleanup() {
    echo ""
    info "Shutting down all services..."
    kill "$LAUNCH_PID" "$TUNNEL_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

log "All services running. Press Ctrl+C to stop."
wait "$LAUNCH_PID" "$TUNNEL_PID"
