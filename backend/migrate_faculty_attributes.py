"""
Migrate for feedback_61: add faculty_attributes (configurable tags like
"FLIGHT certified", each with an optional uploaded icon — see
faculty_attribute_assets.py) and faculty_attribute_assignments (many-to-many
with faculty).

Run with: uv run migrate_faculty_attributes.py
"""
import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "scheduler.db")

conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()

cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='faculty_attributes'")
if cur.fetchone():
    print("Migration already applied.")
    conn.close()
    exit(0)

print("Starting faculty attributes migration...")
cur.execute("""
CREATE TABLE faculty_attributes (
    id    INTEGER PRIMARY KEY,
    name  TEXT NOT NULL UNIQUE
)
""")
cur.execute("""
CREATE TABLE faculty_attribute_assignments (
    faculty_id    INTEGER NOT NULL,
    attribute_id  INTEGER NOT NULL,
    PRIMARY KEY (faculty_id, attribute_id),
    FOREIGN KEY(faculty_id) REFERENCES faculty (id),
    FOREIGN KEY(attribute_id) REFERENCES faculty_attributes (id)
)
""")
conn.commit()
conn.close()
print("Migration complete — faculty_attributes/faculty_attribute_assignments tables created.")
