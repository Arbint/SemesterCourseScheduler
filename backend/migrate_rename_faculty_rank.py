"""
Migrate for feedback_60: rename faculty.rank -> faculty.full_time_or_part_time
(values unchanged — still "full_time"/"part_time"). This frees up the "rank"
name for the new academic-rank attribute added afterward.

Run with: uv run migrate_rename_faculty_rank.py
"""
import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "scheduler.db")

conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()

cur.execute("PRAGMA table_info(faculty)")
columns = {row[1] for row in cur.fetchall()}

if "full_time_or_part_time" in columns:
    print("Migration already applied.")
    conn.close()
    exit(0)

print("Starting faculty rank rename migration...")
cur.execute("ALTER TABLE faculty RENAME COLUMN rank TO full_time_or_part_time")
conn.commit()
conn.close()
print("Migration complete — faculty.rank renamed to full_time_or_part_time.")
