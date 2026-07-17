"""
Migrate for feedback_50 (faculty office hours):
  add table: office_hours (id, term_id, faculty_id, weekday_id)
  add table: office_hour_timeslots (office_hour_id, time_slot_id) — M2M like
    schedule_entry_timeslots
  load_settings: add min_office_hours_per_week (default 4)

Run with: uv run migrate_office_hours.py
"""
import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "scheduler.db")

conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()

cur.execute("PRAGMA table_info(load_settings)")
columns = {row[1] for row in cur.fetchall()}

if "min_office_hours_per_week" in columns:
    print("Migration already applied.")
    conn.close()
    exit(0)

print("Starting office hours migration...")

cur.execute("""
CREATE TABLE IF NOT EXISTS office_hours (
    id          INTEGER PRIMARY KEY,
    term_id     INTEGER NOT NULL,
    faculty_id  INTEGER NOT NULL,
    weekday_id  INTEGER NOT NULL,
    FOREIGN KEY(term_id) REFERENCES terms (id),
    FOREIGN KEY(faculty_id) REFERENCES faculty (id),
    FOREIGN KEY(weekday_id) REFERENCES weekdays (id)
)
""")

cur.execute("""
CREATE TABLE IF NOT EXISTS office_hour_timeslots (
    office_hour_id  INTEGER NOT NULL,
    time_slot_id    INTEGER NOT NULL,
    PRIMARY KEY (office_hour_id, time_slot_id),
    FOREIGN KEY(office_hour_id) REFERENCES office_hours (id),
    FOREIGN KEY(time_slot_id) REFERENCES time_slots (id)
)
""")

cur.execute("ALTER TABLE load_settings ADD COLUMN min_office_hours_per_week INTEGER NOT NULL DEFAULT 4")

conn.commit()
conn.close()
print("Migration complete — office_hours/office_hour_timeslots tables created, "
      "load_settings.min_office_hours_per_week added.")
