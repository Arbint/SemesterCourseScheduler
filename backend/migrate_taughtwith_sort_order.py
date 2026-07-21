"""
Migrate for feedback_80: add sort_order (integer, default 0) to
taught_with_members and term_taught_with_members. The first course added to
a TaughtWith group is its "lead" course (sort_order 0) — always displayed
first — instead of relying on undefined row-iteration order.

Existing rows are backfilled with sort_order based on their current
(insertion) order within each group, so whichever course already displays
first keeps doing so.

Run with: uv run migrate_taughtwith_sort_order.py
"""
import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "scheduler.db")

conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()


def backfill(table, group_col):
    cur.execute(f"SELECT rowid, {group_col}, course_id FROM {table} ORDER BY rowid")
    rows = cur.fetchall()
    counters = {}
    for rowid, group_id, _course_id in rows:
        order = counters.get(group_id, 0)
        cur.execute(f"UPDATE {table} SET sort_order = ? WHERE rowid = ?", (order, rowid))
        counters[group_id] = order + 1


for table, group_col in [("taught_with_members", "group_id"), ("term_taught_with_members", "group_id")]:
    cur.execute(f"PRAGMA table_info({table})")
    columns = {row[1] for row in cur.fetchall()}
    if "sort_order" in columns:
        print(f"{table}: migration already applied.")
        continue
    print(f"{table}: adding sort_order...")
    cur.execute(f"ALTER TABLE {table} ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0")
    backfill(table, group_col)
    conn.commit()
    print(f"{table}: done.")

conn.close()
print("Migration complete.")
