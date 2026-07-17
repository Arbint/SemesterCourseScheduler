"""
Migrate for feedback_69: pdf_layout_presets gains a `scope` column ("room" for
the Room Schedule/Door Tag export, "faculty" for the Faculty Schedule export)
so each export type keeps its own independent list of saved layouts, instead
of one shared global list. The unique constraint on `name` becomes a
composite unique constraint on (name, scope). Existing presets become
scope='room' (Room Schedule was the original feature these belonged to).

Run with: uv run migrate_pdf_layout_presets_scope.py
"""
import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "scheduler.db")

conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()

cur.execute("PRAGMA table_info(pdf_layout_presets)")
columns = {row[1] for row in cur.fetchall()}

if "scope" in columns:
    print("Migration already applied.")
    conn.close()
    exit(0)

print("Starting pdf_layout_presets scope migration...")

cur.execute("ALTER TABLE pdf_layout_presets RENAME TO pdf_layout_presets_v1")

cur.execute("""
CREATE TABLE pdf_layout_presets (
    id      INTEGER PRIMARY KEY,
    name    TEXT NOT NULL,
    scope   TEXT NOT NULL DEFAULT 'room',
    config  TEXT NOT NULL,
    UNIQUE (name, scope)
)
""")

cur.execute("SELECT id, name, config FROM pdf_layout_presets_v1")
rows = cur.fetchall()
for preset_id, name, config in rows:
    cur.execute(
        "INSERT INTO pdf_layout_presets (id, name, scope, config) VALUES (?, ?, 'room', ?)",
        (preset_id, name, config),
    )
    print(f"  id={preset_id}  name={name!r}  scope='room'")

cur.execute("DROP TABLE pdf_layout_presets_v1")

conn.commit()
conn.close()
print(f"Migration complete — {len(rows)} preset(s) migrated.")
