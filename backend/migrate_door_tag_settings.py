"""
Migrate: add table door_tag_settings (singleton, id=1) — persists the Room
Schedule tab's Department/Shared empty-slot labels across all terms instead
of them living in local browser state.

Run with: uv run migrate_door_tag_settings.py
"""
import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "scheduler.db")

conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()

cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='door_tag_settings'")
if cur.fetchone():
    print("Migration already applied.")
    conn.close()
    exit(0)

print("Starting door tag settings migration...")
cur.execute("""
CREATE TABLE door_tag_settings (
    id                      INTEGER PRIMARY KEY,
    department_empty_label  TEXT NOT NULL DEFAULT 'OPEN',
    shared_empty_label      TEXT NOT NULL DEFAULT 'OPEN'
)
""")
conn.commit()
conn.close()
print("Migration complete — door_tag_settings table created.")
