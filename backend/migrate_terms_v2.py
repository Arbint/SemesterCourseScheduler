"""
Migrate terms table (feedback_45 — semester versioning):
  add column: name TEXT NOT NULL DEFAULT ''
  unique constraint: (semester_id, year) → (semester_id, year, name)

Existing rows keep their id/semester_id/year; name is set to '' so they
remain the same term, just now versionable.

Run with: uv run migrate_terms_v2.py
"""
import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "scheduler.db")

conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()

cur.execute("PRAGMA table_info(terms)")
columns = {row[1] for row in cur.fetchall()}

if "name" in columns:
    print("Migration already applied.")
    conn.close()
    exit(0)

print("Starting terms v2 migration...")

cur.execute("ALTER TABLE terms RENAME TO terms_v1")

cur.execute("""
CREATE TABLE terms (
    id          INTEGER PRIMARY KEY,
    semester_id INTEGER NOT NULL,
    year        INTEGER NOT NULL,
    name        TEXT NOT NULL DEFAULT '',
    UNIQUE (semester_id, year, name),
    FOREIGN KEY(semester_id) REFERENCES semesters (id)
)
""")

cur.execute("SELECT id, semester_id, year FROM terms_v1")
rows = cur.fetchall()
for term_id, semester_id, year in rows:
    cur.execute(
        "INSERT INTO terms (id, semester_id, year, name) VALUES (?,?,?,?)",
        (term_id, semester_id, year, "")
    )
    print(f"  id={term_id}  semester_id={semester_id}  year={year}  name=''")

cur.execute("DROP TABLE terms_v1")

conn.commit()
conn.close()
print(f"Migration complete — {len(rows)} term(s) migrated.")
