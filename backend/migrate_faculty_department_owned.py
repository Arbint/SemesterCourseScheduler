"""
Migrate for feedback_59: add faculty.is_department_owned (boolean, default
false) — department meetings are only required for faculty who are both
department-owned and full-time.

Run with: uv run migrate_faculty_department_owned.py
"""
import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "scheduler.db")

conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()

cur.execute("PRAGMA table_info(faculty)")
columns = {row[1] for row in cur.fetchall()}

if "is_department_owned" in columns:
    print("Migration already applied.")
    conn.close()
    exit(0)

print("Starting faculty department-owned migration...")
cur.execute("ALTER TABLE faculty ADD COLUMN is_department_owned BOOLEAN NOT NULL DEFAULT 0")
conn.commit()
conn.close()
print("Migration complete — faculty.is_department_owned added (default false).")
