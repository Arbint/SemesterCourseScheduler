"""Seed script for development/testing. Run with: uv run seed.py"""
from database import SessionLocal, engine, Base
import models

Base.metadata.create_all(bind=engine)

db = SessionLocal()

# Semesters and weekdays are auto-seeded by main.py startup.
# Manually seed them here too for standalone use.
from models import (
    Semester, Weekday, SemesterEnum, WeekdayEnum,
    TimeSlot, Room, Faculty, Course, CourseOffering, RankEnum
)

if db.query(Semester).count() == 0:
    for name in SemesterEnum:
        db.add(Semester(name=name))
    db.commit()

if db.query(Weekday).count() == 0:
    weekdays = [
        (WeekdayEnum.mon, 1), (WeekdayEnum.tue, 2), (WeekdayEnum.wed, 3),
        (WeekdayEnum.thu, 4), (WeekdayEnum.fri, 5),
    ]
    for name, order in weekdays:
        db.add(Weekday(name=name, display_order=order))
    db.commit()

if db.query(TimeSlot).count() == 0:
    slots = [
        ("7:30 AM - 8:45 AM", "07:30", "08:45", 1),
        ("9:00 AM - 10:15 AM", "09:00", "10:15", 2),
        ("10:30 AM - 11:45 AM", "10:30", "11:45", 3),
        ("12:00 PM - 1:15 PM", "12:00", "13:15", 4),
        ("1:30 PM - 2:45 PM", "13:30", "14:45", 5),
        ("3:00 PM - 4:15 PM", "15:00", "16:15", 6),
        ("4:30 PM - 5:45 PM", "16:30", "17:45", 7),
    ]
    for label, start, end, order in slots:
        db.add(TimeSlot(label=label, start_time=start, end_time=end, display_order=order))
    db.commit()

if db.query(Room).count() == 0:
    rooms = [("FH 3233", 30), ("FH 3059", 25), ("G036", 40)]
    for label, cap in rooms:
        db.add(Room(label=label, capacity=cap))
    db.commit()

if db.query(Faculty).count() == 0:
    faculty_data = [
        ("Alice", "Smith", RankEnum.full_time, ["Programming"], 4),
        ("Bob", "Jones", RankEnum.full_time, ["Art", "Design"], 4),
        ("Carol", "Lee", RankEnum.part_time, ["Animation"], 2),
    ]
    for fn, ln, rank, tags, fl in faculty_data:
        db.add(Faculty(first_name=fn, last_name=ln, rank=rank, tags=tags, full_load=fl))
    db.commit()

if db.query(Course).count() == 0:
    fall = db.query(Semester).filter_by(name=SemesterEnum.fall).first()
    spring = db.query(Semester).filter_by(name=SemesterEnum.spring).first()

    courses_data = [
        ("ANGD", 1312, "Foundations of Animation", 75, 25, 2),
        ("ANGD", 2321, "Animation II", 75, 20, 2),
        ("ANGD", 3371, "Animation III", 75, 20, 2),
        ("CIS", 1100, "Intro to Programming", 75, 30, 2),
        ("CIS", 3371, "Game Programming III", 75, 25, 2),
    ]
    for dept, num, name, dur, cap, freq in courses_data:
        c = Course(dept_code=dept, course_number=num, course_name=name,
                   duration_minutes=dur, capacity=cap, frequency=freq)
        db.add(c)
        db.flush()
        db.add(CourseOffering(course_id=c.id, semester_id=fall.id))
        db.add(CourseOffering(course_id=c.id, semester_id=spring.id))
    db.commit()

print("Seed complete.")
db.close()
