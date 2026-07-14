"""
Migrate rooms table:
  building_abbr (nullable) → building_code (NOT NULL, required)
  building_name (NOT NULL)  → building_name (nullable, optional full name)
  unique constraint: (building_name, room_number) → (building_code, room_number)

Existing rows: building_abbr becomes building_code; building_name set to NULL
(since the existing "Full Name" was just the abbreviation repeated, not a real full name).

Run with: uv run migrate_rooms_v2.py
"""
import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "scheduler.db")

conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()

cur.execute("PRAGMA table_info(rooms)")
columns = {row[1] for row in cur.fetchall()}

if "building_code" in columns:
    print("Migration already applied.")
    conn.close()
    exit(0)

if "building_abbr" not in columns:
    print("Unexpected schema — 'building_abbr' column not found. Aborting.")
    conn.close()
    exit(1)

print("Starting rooms v2 migration...")

cur.execute("ALTER TABLE rooms RENAME TO rooms_v1")

cur.execute("""
CREATE TABLE rooms (
    id            INTEGER PRIMARY KEY,
    building_name TEXT,
    room_number   TEXT NOT NULL,
    building_code TEXT NOT NULL,
    capacity      INTEGER NOT NULL,
    is_online     BOOLEAN NOT NULL DEFAULT 0,
    UNIQUE (building_code, room_number)
)
""")

cur.execute("SELECT id, building_name, room_number, building_abbr, capacity, is_online FROM rooms_v1")
rows = cur.fetchall()
for room_id, building_name, room_number, building_abbr, capacity, is_online in rows:
    # building_code = building_abbr (required); building_name = NULL (was just a repeated abbreviation)
    building_code = building_abbr or building_name or ""
    cur.execute(
        "INSERT INTO rooms (id, building_name, room_number, building_code, capacity, is_online) VALUES (?,?,?,?,?,?)",
        (room_id, None, room_number, building_code, capacity, is_online)
    )
    print(f"  id={room_id}  building_code={building_code!r}  room_number={room_number!r}")

cur.execute("DROP TABLE rooms_v1")

conn.commit()
conn.close()
print(f"Migration complete — {len(rows)} room(s) migrated.")
