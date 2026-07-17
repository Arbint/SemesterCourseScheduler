"""
Migrate for feedback_57 (fine-grained office hours):
  office_hours: drop the office_hour_timeslots M2M, add start_time/end_time
  ("HH:MM" 24h free-form strings) so office hours aren't constrained to
  predefined TimeSlot boundaries.

Existing office_hours rows are preserved, converted from their linked time
slots to (min start_time, max end_time) across those slots.

Run with: uv run migrate_office_hours_freeform.py
"""
import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "scheduler.db")

conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()

cur.execute("PRAGMA table_info(office_hours)")
columns = {row[1] for row in cur.fetchall()}

if "start_time" in columns:
    print("Migration already applied.")
    conn.close()
    exit(0)

print("Starting fine-grained office hours migration...")

# Compute (min start_time, max end_time) per existing office_hour from its
# linked time slots, before the M2M table is dropped.
cur.execute("""
    SELECT oht.office_hour_id, MIN(ts.start_time), MAX(ts.end_time)
    FROM office_hour_timeslots oht
    JOIN time_slots ts ON ts.id = oht.time_slot_id
    GROUP BY oht.office_hour_id
""")
converted = {row[0]: (row[1], row[2]) for row in cur.fetchall()}

cur.execute("SELECT id, term_id, faculty_id, weekday_id FROM office_hours")
existing_rows = cur.fetchall()

cur.execute("ALTER TABLE office_hours RENAME TO office_hours_v1")

cur.execute("""
CREATE TABLE office_hours (
    id          INTEGER PRIMARY KEY,
    term_id     INTEGER NOT NULL,
    faculty_id  INTEGER NOT NULL,
    weekday_id  INTEGER NOT NULL,
    start_time  TEXT NOT NULL,
    end_time    TEXT NOT NULL,
    FOREIGN KEY(term_id) REFERENCES terms (id),
    FOREIGN KEY(faculty_id) REFERENCES faculty (id),
    FOREIGN KEY(weekday_id) REFERENCES weekdays (id)
)
""")

migrated = 0
skipped = 0
for oh_id, term_id, faculty_id, weekday_id in existing_rows:
    times = converted.get(oh_id)
    if not times:
        skipped += 1  # had no linked time slots — nothing to convert from
        continue
    start_time, end_time = times
    cur.execute(
        "INSERT INTO office_hours (id, term_id, faculty_id, weekday_id, start_time, end_time) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (oh_id, term_id, faculty_id, weekday_id, start_time, end_time),
    )
    migrated += 1

cur.execute("DROP TABLE office_hours_v1")
cur.execute("DROP TABLE IF EXISTS office_hour_timeslots")

conn.commit()
conn.close()
print(f"Migration complete — {migrated} office_hours row(s) converted, {skipped} skipped (no linked slots), "
      "office_hour_timeslots table dropped.")
