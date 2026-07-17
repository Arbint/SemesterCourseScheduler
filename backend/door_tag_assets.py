"""Persisted header/footer image config for the Room Schedule and Faculty
Schedule PDF exports.

Stored as plain files on disk (mirrors how scheduler.db lives next to the
backend code — this app is single-user, single-file, no object storage), one
file per (scope, kind) named "{scope}_{kind}.<ext>" (feedback_69 — the two
exports each get their own header/footer, not a shared global one) so
re-uploading with a different format cleanly replaces the old one.
"""
from pathlib import Path

UPLOAD_DIR = Path(__file__).resolve().parent / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".svg"}
CONTENT_TYPES = {
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".png": "image/png", ".svg": "image/svg+xml",
}
MAX_BYTES = 5 * 1024 * 1024


def get_asset_path(kind: str, scope: str) -> Path | None:
    return next(UPLOAD_DIR.glob(f"{scope}_{kind}.*"), None)


def save_asset(kind: str, scope: str, filename: str, content: bytes) -> Path:
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise ValueError("Only JPG, PNG, or SVG files are supported")
    if len(content) > MAX_BYTES:
        raise ValueError("File is too large (max 5MB)")
    existing = get_asset_path(kind, scope)
    if existing:
        existing.unlink()
    path = UPLOAD_DIR / f"{scope}_{kind}{ext}"
    path.write_bytes(content)
    return path


def delete_asset(kind: str, scope: str) -> bool:
    existing = get_asset_path(kind, scope)
    if existing:
        existing.unlink()
        return True
    return False


def content_type_for(path: Path) -> str:
    return CONTENT_TYPES.get(path.suffix.lower(), "application/octet-stream")
