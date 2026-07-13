#!/usr/bin/env bash
# launch.sh — Start the backend and frontend dev servers.
# Run setup.sh first if this is a fresh environment.
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_common.sh"

# Ensure uv is on PATH if installed in non-default location
export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"

command -v uv   &>/dev/null || die "uv not found. Run scripts/linux/setup.sh first."
command -v node &>/dev/null || die "Node.js not found. Run scripts/linux/setup.sh first."

# ── Detect LAN IP ─────────────────────────────────────────────────────────────
LOCAL_IP=""
if command -v ip &>/dev/null; then
    LOCAL_IP=$(ip route get 1.1.1.1 2>/dev/null | awk '/src/ {for(i=1;i<=NF;i++) if($i=="src") print $(i+1)}' | head -1)
fi
if [[ -z "$LOCAL_IP" ]] && command -v hostname &>/dev/null; then
    LOCAL_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
fi
[[ -z "$LOCAL_IP" ]] && LOCAL_IP="<your-lan-ip>"

# ── Find free ports ────────────────────────────────────────────────────────────
info "Finding available ports..."
BACKEND_PORT=$(python3 "$ROOT_DIR/find_port.py" 8000 8020)
FRONTEND_PORT=$(python3 "$ROOT_DIR/find_port.py" 5173 5193)
log "Backend port: $BACKEND_PORT  |  Frontend port: $FRONTEND_PORT"

echo "$BACKEND_PORT"  > "$ROOT_DIR/.backend_port"
echo "$FRONTEND_PORT" > "$ROOT_DIR/.frontend_port"

# ── Start backend ──────────────────────────────────────────────────────────────
echo ""
info "Starting backend  →  http://0.0.0.0:${BACKEND_PORT}"
cd "$ROOT_DIR/backend"
uv run uvicorn main:app --host 0.0.0.0 --port "$BACKEND_PORT" --reload &
BACKEND_PID=$!

sleep 2

# ── Start frontend ─────────────────────────────────────────────────────────────
info "Starting frontend →  http://0.0.0.0:${FRONTEND_PORT}"
cd "$ROOT_DIR/frontend"
npm run dev -- --host --port "$FRONTEND_PORT" &
FRONTEND_PID=$!

sleep 3

# ── Print access info ──────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║     Semester Course Scheduler — Running      ║${NC}"
echo -e "${GREEN}╠══════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║${NC}  Local:     ${CYAN}http://localhost:${FRONTEND_PORT}${NC}"
echo -e "${GREEN}║${NC}  Network:   ${CYAN}http://${LOCAL_IP}:${FRONTEND_PORT}${NC}"
echo -e "${GREEN}║${NC}  API Docs:  ${CYAN}http://localhost:${BACKEND_PORT}/docs${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════╝${NC}"
echo ""
echo "  Any device on your LAN can open:  http://${LOCAL_IP}:${FRONTEND_PORT}"
echo ""
echo "  Press Ctrl+C to stop all servers."

# ── Cleanup on exit ────────────────────────────────────────────────────────────
cleanup() {
    echo ""
    info "Shutting down..."
    kill "$BACKEND_PID"  2>/dev/null || true
    kill "$FRONTEND_PID" 2>/dev/null || true
    pkill -P "$BACKEND_PID"  2>/dev/null || true
    pkill -P "$FRONTEND_PID" 2>/dev/null || true
    log "Servers stopped."
}
trap cleanup EXIT INT TERM

wait "$FRONTEND_PID"
