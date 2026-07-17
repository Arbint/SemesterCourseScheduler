"""Persisted header/footer image config for the Room Schedule PDF export.

Stored as plain files on disk (mirrors how scheduler.db lives next to the
backend code — this app is single-user, single-file, no object storage), one
file per kind named "header.<ext>" / "footer.<ext>" so re-uploading with a
different format cleanly replaces the old one.
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


def get_asset_path(kind: str) -> Path | None:
    return next(UPLOAD_DIR.glob(f"{kind}.*"), None)


def save_asset(kind: str, filename: str, content: bytes) -> Path:
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise ValueError("Only JPG, PNG, or SVG files are supported")
    if len(content) > MAX_BYTES:
        raise ValueError("File is too large (max 5MB)")
    existing = get_asset_path(kind)
    if existing:
        existing.unlink()
    path = UPLOAD_DIR / f"{kind}{ext}"
    path.write_bytes(content)
    return path


def delete_asset(kind: str) -> bool:
    existing = get_asset_path(kind)
    if existing:
        existing.unlink()
        return True
    return False


def content_type_for(path: Path) -> str:
    return CONTENT_TYPES.get(path.suffix.lower(), "application/octet-stream")
