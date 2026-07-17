"""Persisted icon files for faculty attributes (feedback_61).

Stored as plain files on disk, same approach as door_tag_assets.py, but keyed
by the attribute's numeric id (one icon per attribute, dynamic count) instead
of a fixed "header"/"footer" kind.
"""
from pathlib import Path

UPLOAD_DIR = Path(__file__).resolve().parent / "uploads" / "faculty_attribute_icons"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".svg"}
CONTENT_TYPES = {
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".png": "image/png", ".svg": "image/svg+xml",
}
MAX_BYTES = 2 * 1024 * 1024


def get_asset_path(attribute_id: int) -> Path | None:
    return next(UPLOAD_DIR.glob(f"{attribute_id}.*"), None)


def save_asset(attribute_id: int, filename: str, content: bytes) -> Path:
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise ValueError("Only JPG, PNG, or SVG files are supported")
    if len(content) > MAX_BYTES:
        raise ValueError("File is too large (max 2MB)")
    existing = get_asset_path(attribute_id)
    if existing:
        existing.unlink()
    path = UPLOAD_DIR / f"{attribute_id}{ext}"
    path.write_bytes(content)
    return path


def delete_asset(attribute_id: int) -> bool:
    existing = get_asset_path(attribute_id)
    if existing:
        existing.unlink()
        return True
    return False


def content_type_for(path: Path) -> str:
    return CONTENT_TYPES.get(path.suffix.lower(), "application/octet-stream")
