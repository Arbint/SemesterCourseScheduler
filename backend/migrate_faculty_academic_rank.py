"""
Migrate for feedback_60: add faculty.rank — academic rank (Instructor, Senior
Instructor, Assistant/Associate Professor, Professor of Practice, Professor).
Nullable/unset by default; purely informational, doesn't affect any
scheduling/load/conflict logic.

Run with: uv run migrate_faculty_academic_rank.py
"""
import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "scheduler.db")

conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()

cur.execute("PRAGMA table_info(faculty)")
columns = {row[1] for row in cur.fetchall()}

if "rank" in columns:
    print("Migration already applied.")
    conn.close()
    exit(0)

print("Starting faculty academic rank migration...")
cur.execute("ALTER TABLE faculty ADD COLUMN rank TEXT")
conn.commit()
conn.close()
print("Migration complete — faculty.rank added (nullable).")
