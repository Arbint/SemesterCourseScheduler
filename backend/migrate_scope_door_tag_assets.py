"""
Migrate for feedback_69: header/footer image assets become scoped per export
type ("room" for the Room Schedule/Door Tag export, "faculty" for the Faculty
Schedule export) instead of one shared global file. Filesystem-only, no DB
changes — renames any existing uploads/header.<ext> / uploads/footer.<ext> to
uploads/room_header.<ext> / uploads/room_footer.<ext>, since Room Schedule /
Door Tags was the original feature these belonged to. The Faculty tab starts
with no header/footer image; the user re-uploads one there if they want it.

Run with: uv run migrate_scope_door_tag_assets.py
"""
from pathlib import Path

UPLOAD_DIR = Path(__file__).resolve().parent / "uploads"

did_anything = False
for kind in ("header", "footer"):
    old_path = next(UPLOAD_DIR.glob(f"{kind}.*"), None)
    if not old_path:
        continue
    new_path = UPLOAD_DIR / f"room_{old_path.name}"
    if new_path.exists():
        print(f"{new_path.name} already exists — skipping {old_path.name}.")
        continue
    old_path.rename(new_path)
    print(f"Renamed {old_path.name} -> {new_path.name}")
    did_anything = True

if did_anything:
    print("Migration complete.")
else:
    print("Nothing to migrate.")
