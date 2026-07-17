"""
Migrate for feedback_59: split load_settings.min_office_hours_per_week into
rank-specific thresholds — part-time faculty only require 1 hour/week by
default, full-time keep the existing value.

  load_settings.min_office_hours_per_week -> renamed to min_office_hours_fulltime
  load_settings: add min_office_hours_parttime (default 1)

Run with: uv run migrate_min_office_hours_by_rank.py
"""
import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "scheduler.db")

conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()

cur.execute("PRAGMA table_info(load_settings)")
columns = {row[1] for row in cur.fetchall()}

if "min_office_hours_fulltime" in columns:
    print("Migration already applied.")
    conn.close()
    exit(0)

print("Starting min-office-hours-by-rank migration...")
if "min_office_hours_per_week" in columns:
    cur.execute("ALTER TABLE load_settings RENAME COLUMN min_office_hours_per_week TO min_office_hours_fulltime")
else:
    cur.execute("ALTER TABLE load_settings ADD COLUMN min_office_hours_fulltime INTEGER NOT NULL DEFAULT 4")
cur.execute("ALTER TABLE load_settings ADD COLUMN min_office_hours_parttime INTEGER NOT NULL DEFAULT 1")
conn.commit()
conn.close()
print("Migration complete — min_office_hours_fulltime/parttime in place.")
