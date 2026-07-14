"""
Migrate the rooms table from {label, capacity, is_online}
to {building_name, room_number, building_abbr, capacity, is_online}.

Existing labels like "FH 3056" are split on the first space:
  building_abbr = "FH"  (first word)
  room_number   = "3056" (rest)
  building_name = "FH"  (abbreviation used as full name per feedback_41)

Run with: uv run migrate_rooms.py
"""
import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "scheduler.db")

conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()

# Check whether migration is already done
cur.execute("PRAGMA table_info(rooms)")
columns = {row[1] for row in cur.fetchall()}

if "building_name" in columns:
    print("Migration already applied — rooms table already has building_name column.")
    conn.close()
    exit(0)

if "label" not in columns:
    print("Unexpected schema — neither 'label' nor 'building_name' found. Aborting.")
    conn.close()
    exit(1)

print("Starting rooms migration...")

# 1. Rename old table
cur.execute("ALTER TABLE rooms RENAME TO rooms_old")

# 2. Create new table with updated schema
cur.execute("""
CREATE TABLE rooms (
    id           INTEGER PRIMARY KEY,
    building_name TEXT NOT NULL,
    room_number   TEXT NOT NULL,
    building_abbr TEXT,
    capacity      INTEGER NOT NULL,
    is_online     BOOLEAN NOT NULL DEFAULT 0,
    UNIQUE (building_name, room_number)
)
""")

# 3. Copy and transform rows
cur.execute("SELECT id, label, capacity, is_online FROM rooms_old")
rows = cur.fetchall()
for room_id, label, capacity, is_online in rows:
    parts = label.split(" ", 1)
    abbr = parts[0]
    room_num = parts[1] if len(parts) > 1 else ""
    # per feedback_41: use abbreviation as the Full Name for existing rows
    cur.execute(
        "INSERT INTO rooms (id, building_name, room_number, building_abbr, capacity, is_online) VALUES (?,?,?,?,?,?)",
        (room_id, abbr, room_num, abbr, capacity, is_online)
    )
    print(f"  {label!r} → building_name={abbr!r}, room_number={room_num!r}, building_abbr={abbr!r}")

# 4. Drop old table
cur.execute("DROP TABLE rooms_old")

conn.commit()
conn.close()
print(f"Migration complete — {len(rows)} room(s) migrated.")
