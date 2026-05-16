#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Colors ──────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; CYAN='\033[0;36m'; NC='\033[0m'
log()  { echo -e "${GREEN}[✓]${NC} $*"; }
info() { echo -e "${CYAN}[…]${NC} $*"; }
warn() { echo -e "${YELLOW}[!]${NC} $*"; }
die()  { echo -e "${RED}[✗]${NC} $*" >&2; exit 1; }

# ── Package manager ──────────────────────────────────────────────────────────
pkg_install() {
    if   command -v apt-get &>/dev/null; then sudo apt-get install -y -qq "$@"
    elif command -v dnf     &>/dev/null; then sudo dnf install -y -q "$@"
    elif command -v pacman  &>/dev/null; then sudo pacman -Sy --noconfirm "$@"
    elif command -v zypper  &>/dev/null; then sudo zypper install -y "$@"
    elif command -v brew    &>/dev/null; then brew install "$@"
    else die "No supported package manager found. Install manually: $*"
    fi
}

pkg_update() {
    if   command -v apt-get &>/dev/null; then sudo apt-get update -qq
    elif command -v dnf     &>/dev/null; then : # dnf updates on install
    elif command -v pacman  &>/dev/null; then sudo pacman -Sy --noconfirm
    fi
}

# ── Python 3.10+ ─────────────────────────────────────────────────────────────
info "Checking Python..."
if ! command -v python3 &>/dev/null; then
    warn "Python3 not found. Installing..."
    pkg_update
    pkg_install python3 python3-pip curl
fi

PY_MINOR=$(python3 -c "import sys; print(sys.version_info.minor)" 2>/dev/null || echo 0)
PY_MAJOR=$(python3 -c "import sys; print(sys.version_info.major)" 2>/dev/null || echo 0)
if [[ "$PY_MAJOR" -lt 3 || "$PY_MINOR" -lt 10 ]]; then
    warn "Python 3.$PY_MINOR found. Python 3.10+ strongly recommended."
    warn "Attempting to install python3.12..."
    if command -v apt-get &>/dev/null; then
        sudo apt-get update -qq
        sudo apt-get install -y software-properties-common 2>/dev/null || true
        sudo add-apt-repository -y ppa:deadsnakes/ppa 2>/dev/null || true
        sudo apt-get update -qq
        sudo apt-get install -y python3.12 python3.12-venv || warn "Could not install 3.12; proceeding with current version."
    fi
fi
log "Python: $(python3 --version)"

# ── curl (needed for uv installer) ───────────────────────────────────────���───
if ! command -v curl &>/dev/null; then
    info "Installing curl..."
    pkg_install curl
fi

# ── uv ────────────────────────────────────────────────────────────────────────
info "Checking uv..."
if ! command -v uv &>/dev/null; then
    info "Installing uv (Python package manager)..."
    curl -LsSf https://astral.sh/uv/install.sh | sh
    # Add uv to PATH for this session
    export PATH="$HOME/.local/bin:$PATH"
    # Also try cargo/local uv locations
    for d in "$HOME/.cargo/bin" "$HOME/.local/bin"; do
        [[ -d "$d" ]] && export PATH="$d:$PATH"
    done
fi
# One more attempt to find uv after install
if ! command -v uv &>/dev/null; then
    export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"
fi
command -v uv &>/dev/null || die "uv installation failed. Please install manually: https://docs.astral.sh/uv/getting-started/installation/"
log "uv: $(uv --version)"

# ── Node.js 18+ ──��────────────────────────────────────────────────────────────
info "Checking Node.js..."
if ! command -v node &>/dev/null; then
    warn "Node.js not found. Installing..."
    if command -v apt-get &>/dev/null; then
        # NodeSource setup for Ubuntu/Debian
        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - 2>/dev/null
        sudo apt-get install -y -qq nodejs
    elif command -v dnf &>/dev/null; then
        sudo dnf module install -y nodejs:20
    elif command -v pacman &>/dev/null; then
        sudo pacman -Sy --noconfirm nodejs npm
    elif command -v brew &>/dev/null; then
        brew install node
    else
        die "Cannot auto-install Node.js. Install Node.js 18+ from https://nodejs.org and re-run."
    fi
fi

NODE_MAJOR=$(node -e "console.log(parseInt(process.versions.node))" 2>/dev/null || echo 0)
if [[ "$NODE_MAJOR" -lt 18 ]]; then
    die "Node.js $NODE_MAJOR detected. Node.js 18+ is required. Update at https://nodejs.org"
fi
log "Node.js: $(node --version)  |  npm: $(npm --version)"

# ── Backend dependencies ──────────────────────────────────────────────────────
info "Installing backend dependencies..."
cd "$SCRIPT_DIR/backend"
uv sync 2>/dev/null || uv pip install fastapi uvicorn sqlalchemy alembic openpyxl anthropic python-multipart
log "Backend dependencies ready."

# ── Seed database ─────────────────────────────────────────────────────────────
if [[ ! -f "$SCRIPT_DIR/backend/scheduler.db" ]]; then
    info "Database not found — seeding initial data..."
    uv run python seed.py
    log "Database seeded."
fi

# ── Frontend dependencies ─────────────────────────────────────────────────────
info "Installing frontend dependencies..."
cd "$SCRIPT_DIR/frontend"
if [[ ! -d node_modules ]]; then
    npm install --silent
    log "Frontend dependencies installed."
else
    log "Frontend dependencies already present."
fi

# ── Detect LAN IP ─────────────────────────────────────────────────────────────
LOCAL_IP=""
if command -v ip &>/dev/null; then
    LOCAL_IP=$(ip route get 1.1.1.1 2>/dev/null | awk '/src/ {for(i=1;i<=NF;i++) if($i=="src") print $(i+1)}' | head -1)
fi
if [[ -z "$LOCAL_IP" ]] && command -v hostname &>/dev/null; then
    LOCAL_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
fi
[[ -z "$LOCAL_IP" ]] && LOCAL_IP="<your-lan-ip>"

# ── Find free ports ───────────────────────────────────────────────────────────
info "Finding available ports..."
BACKEND_PORT=$(python3 "$SCRIPT_DIR/find_port.py" 8000 8020)
FRONTEND_PORT=$(python3 "$SCRIPT_DIR/find_port.py" 5173 5193)
log "Backend port: $BACKEND_PORT  |  Frontend port: $FRONTEND_PORT"

# Write port file so vite.config.ts picks up the backend port
echo "$BACKEND_PORT" > "$SCRIPT_DIR/.backend_port"

# ── Start servers ─────────────────────────────────────────────────────────────
echo ""
info "Starting backend  →  http://0.0.0.0:${BACKEND_PORT}"
cd "$SCRIPT_DIR/backend"
uv run uvicorn main:app --host 0.0.0.0 --port "$BACKEND_PORT" --reload &
BACKEND_PID=$!

# Give backend a moment to bind before starting frontend
sleep 2

info "Starting frontend →  http://0.0.0.0:${FRONTEND_PORT}"
cd "$SCRIPT_DIR/frontend"
npm run dev -- --host --port "$FRONTEND_PORT" &
FRONTEND_PID=$!

sleep 3

# ── Print access info ─────────────────────────────────────────────────────────
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
echo "  Press Ctrl+C to stop both servers."

# ── Cleanup on exit ───────────────────────────────────────────────────────────
cleanup() {
    echo ""
    info "Shutting down..."
    kill "$BACKEND_PID"  2>/dev/null || true
    kill "$FRONTEND_PID" 2>/dev/null || true
    # Kill any child processes too
    pkill -P "$BACKEND_PID"  2>/dev/null || true
    pkill -P "$FRONTEND_PID" 2>/dev/null || true
    log "Servers stopped."
}
trap cleanup EXIT INT TERM

wait "$FRONTEND_PID"
