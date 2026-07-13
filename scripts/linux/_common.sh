#!/usr/bin/env bash
# Shared helpers — source this file, do not execute directly.

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; CYAN='\033[0;36m'; NC='\033[0m'
log()  { echo -e "${GREEN}[✓]${NC} $*"; }
info() { echo -e "${CYAN}[…]${NC} $*"; }
warn() { echo -e "${YELLOW}[!]${NC} $*"; }
die()  { echo -e "${RED}[✗]${NC} $*" >&2; exit 1; }

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

# Absolute path to the repo root (two levels up from scripts/linux/)
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[1]}")/../.." && pwd)"
