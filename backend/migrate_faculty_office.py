"""
Migrate: add faculty.office (nullable text — the faculty member's physical office
location, e.g. "JB 245").

Run with: uv run migrate_faculty_office.py
"""
import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "scheduler.db")

conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()

cur.execute("PRAGMA table_info(faculty)")
columns = {row[1] for row in cur.fetchall()}

if "office" in columns:
    print("Migration already applied.")
    conn.close()
    exit(0)

print("Starting faculty office migration...")
cur.execute("ALTER TABLE faculty ADD COLUMN office TEXT")
conn.commit()
conn.close()
print("Migration complete — faculty.office added.")
