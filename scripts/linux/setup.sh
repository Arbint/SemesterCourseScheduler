#!/usr/bin/env bash
# setup.sh — Install all system and project dependencies.
# Run once before launching the app for the first time, or to update deps.
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_common.sh"

# ── Python 3.10+ ──────────────────────────────────────────────────────────────
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

# ── curl ──────────────────────────────────────────────────────────────────────
if ! command -v curl &>/dev/null; then
    info "Installing curl..."
    pkg_install curl
fi

# ── uv ────────────────────────────────────────────────────────────────────────
info "Checking uv..."
if ! command -v uv &>/dev/null; then
    info "Installing uv (Python package manager)..."
    curl -LsSf https://astral.sh/uv/install.sh | sh
    export PATH="$HOME/.local/bin:$PATH"
    for d in "$HOME/.cargo/bin" "$HOME/.local/bin"; do
        [[ -d "$d" ]] && export PATH="$d:$PATH"
    done
fi
if ! command -v uv &>/dev/null; then
    export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"
fi
command -v uv &>/dev/null || die "uv installation failed. Install manually: https://docs.astral.sh/uv/getting-started/installation/"
log "uv: $(uv --version)"

# ── Node.js 18+ ───────────────────────────────────────────────────────────────
info "Checking Node.js..."
if ! command -v node &>/dev/null; then
    warn "Node.js not found. Installing..."
    if command -v apt-get &>/dev/null; then
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

# ── Backend dependencies ───────────────────────────────────────────────────────
info "Installing backend dependencies..."
cd "$ROOT_DIR/backend"
uv sync 2>/dev/null || uv pip install fastapi uvicorn sqlalchemy alembic openpyxl anthropic python-multipart
log "Backend dependencies ready."

# ── Seed database ──────────────────────────────────────────────────────────────
if [[ ! -f "$ROOT_DIR/backend/scheduler.db" ]]; then
    info "Database not found — seeding initial data..."
    uv run python seed.py
    log "Database seeded."
else
    log "Database already exists — skipping seed."
fi

# ── Frontend dependencies ──────────────────────────────────────────────────────
info "Installing frontend dependencies..."
cd "$ROOT_DIR/frontend"
if [[ ! -d node_modules ]]; then
    npm install --silent
    log "Frontend dependencies installed."
else
    log "Frontend dependencies already present."
fi

echo ""
log "Setup complete. Run scripts/linux/launch.sh to start the app."
