"""
Migrate for feedback_58 (department-owned rooms):
  rooms: add is_department_owned (boolean, default false — i.e. shared).

Run with: uv run migrate_room_department_owned.py
"""
import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "scheduler.db")

conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()

cur.execute("PRAGMA table_info(rooms)")
columns = {row[1] for row in cur.fetchall()}

if "is_department_owned" in columns:
    print("Migration already applied.")
    conn.close()
    exit(0)

print("Starting department-owned room migration...")
cur.execute("ALTER TABLE rooms ADD COLUMN is_department_owned BOOLEAN NOT NULL DEFAULT 0")
conn.commit()
conn.close()
print("Migration complete — rooms.is_department_owned added (default false/shared).")
