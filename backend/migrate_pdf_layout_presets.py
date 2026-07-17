"""
Migrate for feedback_64: add pdf_layout_presets — saved Print Configuration
snapshots (page size, orientation, header/info layouts, header/footer scale)
usable from either the Room Schedule or Faculty Schedule export panel.

Run with: uv run migrate_pdf_layout_presets.py
"""
import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "scheduler.db")

conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()

cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='pdf_layout_presets'")
if cur.fetchone():
    print("Migration already applied.")
    conn.close()
    exit(0)

print("Starting pdf layout presets migration...")
cur.execute("""
CREATE TABLE pdf_layout_presets (
    id      INTEGER PRIMARY KEY,
    name    TEXT NOT NULL UNIQUE,
    config  TEXT NOT NULL
)
""")
conn.commit()
conn.close()
print("Migration complete — pdf_layout_presets table created.")
