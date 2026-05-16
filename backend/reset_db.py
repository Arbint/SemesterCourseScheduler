"""Reset all scheduling data (terms, tables, entries) while keeping catalog data intact.
Run with: uv run reset_db.py
"""
from database import SessionLocal
from models import Term, ScheduleTable, ScheduleEntry, schedule_table_weekdays, schedule_entry_timeslots

db = SessionLocal()

# Clear association tables first, then dependent rows, then parents
db.execute(schedule_entry_timeslots.delete())
db.execute(schedule_table_weekdays.delete())
db.query(ScheduleEntry).delete()
db.query(ScheduleTable).delete()
db.query(Term).delete()
db.commit()
db.close()

print("Reset complete. Catalog data (faculty, courses, rooms, time slots) preserved.")
