"""
Migrate for feedback_53 (meeting freq/week):
  meetings: add column frequency INTEGER NOT NULL DEFAULT 2

Run with: uv run migrate_meeting_frequency.py
"""
import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "scheduler.db")

conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()

cur.execute("PRAGMA table_info(meetings)")
columns = {row[1] for row in cur.fetchall()}

if "frequency" in columns:
    print("Migration already applied.")
    conn.close()
    exit(0)

print("Starting meeting frequency migration...")

cur.execute("ALTER TABLE meetings ADD COLUMN frequency INTEGER NOT NULL DEFAULT 2")

conn.commit()
conn.close()
print("Migration complete — meetings.frequency added.")
