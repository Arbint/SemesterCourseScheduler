"""
Migrate for feedback_52 (faculty meetings):
  add table: meetings (id, term_id, name, duration_minutes)
  schedule_entries: course_id NOT NULL -> nullable, add meeting_id (nullable FK)
    — a row now has exactly one of course_id / meeting_id set.

Existing schedule_entries rows are preserved as-is (course_id unchanged,
meeting_id NULL). While recreating the table this also repoints its
course_id/room_id/term_id FOREIGN KEY targets at the *current* table names
(courses/rooms/terms) — earlier migrations left them pointing at renamed
snapshot tables (terms_v1/rooms_old), which is harmless in SQLite but worth
cleaning up while the table is already being rebuilt.

Run with: uv run migrate_meetings.py
"""
import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "scheduler.db")

conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()

cur.execute("PRAGMA table_info(schedule_entries)")
columns = {row[1] for row in cur.fetchall()}

if "meeting_id" in columns:
    print("Migration already applied.")
    conn.close()
    exit(0)

print("Starting meetings migration...")

cur.execute("""
CREATE TABLE IF NOT EXISTS meetings (
    id                INTEGER PRIMARY KEY,
    term_id           INTEGER NOT NULL,
    name              TEXT NOT NULL,
    duration_minutes  INTEGER NOT NULL DEFAULT 75,
    FOREIGN KEY(term_id) REFERENCES terms (id)
)
""")

cur.execute("ALTER TABLE schedule_entries RENAME TO schedule_entries_v1")

cur.execute("""
CREATE TABLE schedule_entries (
    id                 INTEGER PRIMARY KEY,
    term_id            INTEGER NOT NULL,
    schedule_table_id  INTEGER,
    course_id          INTEGER,
    meeting_id         INTEGER,
    section            INTEGER NOT NULL DEFAULT 1,
    room_id            INTEGER,
    faculty_id         INTEGER,
    FOREIGN KEY(term_id) REFERENCES terms (id),
    FOREIGN KEY(schedule_table_id) REFERENCES schedule_tables (id),
    FOREIGN KEY(course_id) REFERENCES courses (id),
    FOREIGN KEY(meeting_id) REFERENCES meetings (id),
    FOREIGN KEY(room_id) REFERENCES rooms (id),
    FOREIGN KEY(faculty_id) REFERENCES faculty (id)
)
""")

cur.execute("""
    INSERT INTO schedule_entries (id, term_id, schedule_table_id, course_id, meeting_id, section, room_id, faculty_id)
    SELECT id, term_id, schedule_table_id, course_id, NULL, section, room_id, faculty_id
    FROM schedule_entries_v1
""")
migrated = cur.rowcount

cur.execute("DROP TABLE schedule_entries_v1")

conn.commit()
conn.close()
print(f"Migration complete — {migrated} schedule_entries row(s) preserved, meetings table created.")
