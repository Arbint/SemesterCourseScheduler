"""
Seed the database from the Fall-2026 and Spring 2026 schedule spreadsheets.
Clears ALL existing data before seeding.
Run with: uv run seed.py
"""
from database import SessionLocal, engine, Base
from sqlalchemy import text
import models
from models import (
    Semester, Weekday, SemesterEnum, WeekdayEnum,
    TimeSlot, Room, Faculty, Course, CourseOffering,
    FacultyTeaching, RankEnum,
    TaughtWithGroup, TaughtWithMember, CoReqGroup, CoReqMember,
    ScheduleEntry, ScheduleTable,
    schedule_table_weekdays, schedule_entry_timeslots,
)

Base.metadata.create_all(bind=engine)
db = SessionLocal()

# ── Clear everything ──────────────────────────────────────────────────────────
db.execute(schedule_entry_timeslots.delete())
db.execute(schedule_table_weekdays.delete())
db.query(ScheduleEntry).delete()
db.query(ScheduleTable).delete()
db.query(models.Term).delete()
db.query(CoReqMember).delete()
db.query(CoReqGroup).delete()
db.query(TaughtWithMember).delete()
db.query(TaughtWithGroup).delete()
db.query(FacultyTeaching).delete()
db.query(CourseOffering).delete()
db.query(Course).delete()
db.query(Faculty).delete()
db.query(Room).delete()
db.query(TimeSlot).delete()
db.query(Weekday).delete()
db.query(Semester).delete()
db.commit()

# ── Semesters ─────────────────────────────────────────────────────────────────
semesters = {}
for name in SemesterEnum:
    s = Semester(name=name)
    db.add(s)
    db.flush()
    semesters[name.value] = s
db.commit()

FALL   = semesters["fall"]
SPRING = semesters["spring"]
SUMMER = semesters["summer"]

# ── Weekdays ──────────────────────────────────────────────────────────────────
for name, order in [
    (WeekdayEnum.mon, 1), (WeekdayEnum.tue, 2), (WeekdayEnum.wed, 3),
    (WeekdayEnum.thu, 4), (WeekdayEnum.fri, 5),
]:
    db.add(Weekday(name=name, display_order=order))
db.commit()

# ── Time Slots ────────────────────────────────────────────────────────────────
TIME_SLOTS = [
    ("7:30 AM - 8:45 AM",   "07:30", "08:45", 1),
    ("9:00 AM - 10:15 AM",  "09:00", "10:15", 2),
    ("10:30 AM - 11:45 AM", "10:30", "11:45", 3),
    ("12:00 PM - 1:15 PM",  "12:00", "13:15", 4),
    ("1:30 PM - 2:45 PM",   "13:30", "14:45", 5),
    ("3:00 PM - 4:15 PM",   "15:00", "16:15", 6),
    ("4:30 PM - 5:45 PM",   "16:30", "17:45", 7),
    ("6:00 PM - 7:15 PM",   "18:00", "19:15", 8),
    ("7:30 PM - 8:45 PM",   "19:30", "20:45", 9),
]
for label, start, end, order in TIME_SLOTS:
    db.add(TimeSlot(label=label, start_time=start, end_time=end, display_order=order))
db.commit()

# ── Rooms (from Fall-2026-Schedule.xlsx only) ─────────────────────────────────
# Capacities from the spreadsheet's "Capacity" row + enrollment data
# (building_abbr, room_number, capacity)
ROOMS = [
    ("FH", "3056",  16),
    ("FH", "3057",  16),
    ("FH", "3058",  18),
    ("FH", "3059",  16),
    ("FH", "3060",  15),
    ("JB", "126",   35),
    ("FH", "G030", 120),  # auditorium — holds 113-student seminar
    ("FH", "3023",  25),
    ("FH", "3024",  25),
    ("FA", "222",   25),
    ("JB", "123",   15),
    ("BSH","129",   20),
]
for abbr, num, cap in ROOMS:
    db.add(Room(building_name=abbr, room_number=num, building_abbr=abbr, capacity=cap))
db.commit()

# ── Faculty ───────────────────────────────────────────────────────────────────
# (first_name, last_name, rank, tags)
FACULTY_DATA = [
    ("Kassandra", "Arevalo",   RankEnum.full_time,  ["Animation"]),
    ("Adam",      "Blair",     RankEnum.full_time,  ["Modeling", "Environment"]),
    ("Brendan",   "Casey",     RankEnum.part_time,  ["Production"]),
    ("Michael",   "Choi",      RankEnum.part_time,  ["Art"]),
    ("Alessandro","Dady",      RankEnum.part_time,  ["Modeling"]),
    ("Anna",      "Faryniarz", RankEnum.part_time,  ["Animation"]),
    ("Justin",    "Gallardo",  RankEnum.full_time,  ["Programming", "Animation"]),
    ("Carlos",    "Garcia",    RankEnum.full_time,  ["Animation", "Modeling"]),
    ("Devin",     "Gee",       RankEnum.part_time,  ["Modeling"]),
    ("Isaac",     "Herrera",   RankEnum.part_time,  ["Modeling"]),
    ("Jingtian",  "Li",        RankEnum.full_time,  ["Programming"]),
    ("David",     "Riddle",    RankEnum.part_time,  ["Modeling"]),
    ("Randall",   "Rudd",      RankEnum.full_time,  ["Production"]),
    ("Giovanni",  "Sabella",   RankEnum.part_time,  ["Programming"]),
    ("Jacob",     "Salazar",   RankEnum.full_time,  ["Modeling", "Environment"]),
    ("Emily",     "Sidler",    RankEnum.full_time,  ["Animation"]),
    ("Joshua",    "Starrett",  RankEnum.part_time,  ["Programming"]),
    ("Nathan",    "Sumsion",   RankEnum.part_time,  ["Programming"]),
    ("Adam",      "Watkins",   RankEnum.part_time,  ["Animation", "History"]),
    ("William",   "Watkins",   RankEnum.part_time,  ["Math", "Core"]),
]
faculty_map = {}  # last_name → Faculty (works because last names are unique)
for fn, ln, rank, tags in FACULTY_DATA:
    f = Faculty(first_name=fn, last_name=ln, rank=rank, tags=tags)
    db.add(f)
    db.flush()
    faculty_map[ln] = f
db.commit()

def _duration(course_number: int) -> int:
    """Derive duration from credit hours encoded as the second digit of the course number.
    1 credit hour → 75 min, 3 credit hours → 165 min, anything else → 75 min.
    """
    credits = (course_number // 100) % 10
    if credits == 3:
        return 165
    return 75  # 1-credit seminars and any unrecognised credit value

# ── Courses + Offerings ───────────────────────────────────────────────────────
# (dept, number, name, capacity, frequency, [semester_keys])
# duration_minutes is derived automatically from the course number via _duration()
# frequency: 1=once/week, 2=twice/week (MW or TuTh), 3=three times/week (MWF)
COURSES_DATA = [
    # ── Fall courses ────────────────────────────────────────────────────────
    ("ANGD", 1101, "Orientation to ANGD",               60, 1, ["fall"]),
    ("ANGD", 1380, "Anatomy for Animators",              35, 2, ["fall"]),
    ("ANGD", 2330, "History of Animation",               40, 2, ["fall"]),
    ("ANGD", 2333, "Environment Production I",           18, 2, ["fall"]),
    ("ANGD", 2340, "Animation I: Adv Body Mechanics",   18, 2, ["fall"]),
    ("ANGD", 2351, "Production Management I",            15, 1, ["fall"]),
    ("ANGD", 2353, "Modeling & Texture Pipeline",        12, 2, ["fall"]),
    ("ANGD", 2371, "Game Programming I",                 18, 2, ["fall"]),
    ("ANGD", 3331, "Environment Production III",         18, 2, ["fall"]),
    ("ANGD", 3341, "Animation III: Adv Pantomime Acting",18, 2, ["fall"]),
    ("ANGD", 3343, "Motion Capture for Animators",       18, 2, ["fall"]),
    ("ANGD", 3351, "Production Management III",          12, 1, ["fall"]),
    ("ANGD", 3361, "Character Modeling II",              18, 2, ["fall"]),
    ("ANGD", 3371, "Game Programming III",               15, 2, ["fall"]),
    ("ANGD", 4350, "Senior Thesis Production I",         18, 2, ["fall"]),
    # ── Spring courses ──────────────────────────────────────────────────────
    ("ANGD", 1302, "Element of Design",                  25, 2, ["spring"]),
    ("ANGD", 2334, "Environment Production II",          18, 2, ["spring"]),
    ("ANGD", 2341, "Period Styles",                      20, 2, ["spring"]),
    ("ANGD", 2342, "Animation II: Animation for Games",  18, 2, ["spring"]),
    ("ANGD", 2352, "Production Management II",           15, 1, ["spring"]),
    ("ANGD", 2355, "Animation Pipeline",                 18, 2, ["spring"]),
    ("ANGD", 2361, "Character Modeling I",               18, 2, ["spring"]),
    ("ANGD", 2372, "Game Programming II",                15, 2, ["spring"]),
    ("ANGD", 3330, "History of Games",                   40, 2, ["spring"]),
    ("ANGD", 3332, "Environment Production IV",          18, 2, ["spring"]),
    ("ANGD", 3342, "Animation IV: Performance Animation",18, 2, ["spring"]),
    ("ANGD", 3345, "Advanced Animation for Games",       18, 2, ["spring"]),
    ("ANGD", 3352, "Production Management IV",           12, 1, ["spring"]),
    ("ANGD", 3355, "Tools of Production Management",     15, 2, ["spring"]),
    ("ANGD", 3362, "Character Modeling III",             18, 2, ["spring"]),
    ("ANGD", 3372, "Game Programming IV",                15, 2, ["spring"]),
    ("ANGD", 4140, "Senior Thesis Workshop",             20, 2, ["spring"]),
    ("ANGD", 4340, "Business of Animation and Game Design",20,2, ["spring"]),
    ("ANGD", 4360, "Senior Thesis Production II",        18, 2, ["spring"]),
    ("ANGD", 4381, "Prototyping and Game Design",        15, 2, ["spring"]),
    ("ANGD", 4399, "Realizing 3D",                       15, 2, ["spring"]),
    ("THAR", 2330, "Performance for Animators",          20, 2, ["spring"]),
    # ── Summer courses ──────────────────────────────────────────────────────
    ("ANGD", 2384, "Elements of Gameplay",               15, 2, ["summer"]),
    # ── Fall + Spring ───────────────────────────────────────────────────────
    ("ANGD", 1312, "Hardsurface Modeling",               18, 2, ["fall", "spring"]),
    ("ANGD", 1313, "Game Engines",                       18, 2, ["fall", "spring"]),
    ("ANGD", 1314, "Organic Modeling",                   18, 2, ["fall", "spring"]),
    ("ANGD", 1315, "Principles of Animation",            18, 2, ["fall", "spring"]),
    ("ANGD", 2321, "Technical Direction",                15, 2, ["fall", "spring"]),
    ("ANGD", 3315, "Visual Narrative Conventions",       40, 2, ["fall", "spring"]),
    ("ANGD", 3325, "Figure Drawing For Animators",       20, 1, ["fall", "spring"]),
    ("ANGD", 4100, "Animation Industry Seminar",        120, 1, ["fall", "spring"]),
    # ── Fall + Spring + Summer ──────────────────────────────────────────────
    ("ANGD", 4305, "Senior Portfolio",                   20, 2, ["fall", "spring", "summer"]),
]

course_map = {}  # course_number → Course
sem_lookup = {"fall": FALL, "spring": SPRING, "summer": SUMMER}

for dept, num, name, cap, freq, sem_keys in COURSES_DATA:
    c = Course(dept_code=dept, course_number=num, course_name=name,
               duration_minutes=_duration(num), capacity=cap, frequency=freq)
    db.add(c)
    db.flush()
    course_map[num] = c
    for key in sem_keys:
        db.add(CourseOffering(course_id=c.id, semester_id=sem_lookup[key].id))
db.commit()

# ── Faculty Teaching Capabilities ─────────────────────────────────────────────
# Maps last_name → list of course_numbers they can teach
CAPABILITIES = {
    "Arevalo":  [1315, 3343, 3345, 4340, 4360],
    "Blair":    [1312, 2334, 3331, 3332, 4340],
    "Casey":    [4140, 4305],
    "Choi":     [3325],
    "Dady":     [1314],
    "Faryniarz":[1315],
    "Gallardo": [1313, 2371, 2372, 4305, 4350, 4360],
    "Garcia":   [1101, 1314, 1380, 3330, 4100, 4350],
    "Gee":      [1312],
    "Herrera":  [1312],
    "Li":       [2321, 3371, 3372],
    "Riddle":   [4140, 4305],
    "Rudd":     [2351, 2352, 3351, 3352, 3355],
    "Sabella":  [4305],
    "Salazar":  [1302, 1314, 2333, 2353, 2361, 3315, 3361, 4100],
    "Sidler":   [2340, 2342, 3341, 3342, 4140, 4350, 4360],
    "Starrett": [2321],
    "Sumsion":  [2384, 4381],
    "A_Watkins":  [2330, 2341],   # Adam Watkins
    "W_Watkins":  [2341, 4399],   # William Watkins
}

# Special-cased lookup for the two Watkins
watkins_adam    = faculty_map["Watkins"]  # last inserted = William; need to query by first name
watkins_william = None
for f in db.query(Faculty).filter_by(last_name="Watkins").all():
    if f.first_name == "Adam":
        watkins_adam = f
    else:
        watkins_william = f

for last_name, course_nums in CAPABILITIES.items():
    if last_name == "A_Watkins":
        f = watkins_adam
    elif last_name == "W_Watkins":
        f = watkins_william
    else:
        f = faculty_map.get(last_name)
    if not f:
        continue
    for num in course_nums:
        c = course_map.get(num)
        if c:
            db.add(FacultyTeaching(faculty_id=f.id, course_id=c.id))
db.commit()

# ── Co-requisite constraint: ANGD 2342 ↔ ANGD 2355 (must share time slot) ─────
g = CoReqGroup()
db.add(g)
db.flush()
for num in [2342, 2355]:
    c = course_map.get(num)
    if c:
        db.add(CoReqMember(group_id=g.id, course_id=c.id))

# ── TaughtWith constraint: ANGD 2333 & ANGD 2353 (taught together) ────────────
tw = TaughtWithGroup()
db.add(tw)
db.flush()
for num in [2333, 2353]:
    c = course_map.get(num)
    if c:
        db.add(TaughtWithMember(group_id=tw.id, course_id=c.id))

db.commit()

print(f"Seed complete.")
print(f"  Rooms:    {db.query(Room).count()}")
print(f"  Slots:    {db.query(TimeSlot).count()}")
print(f"  Faculty:  {db.query(Faculty).count()}")
print(f"  Courses:  {db.query(Course).count()}")
print(f"  Offerings:{db.query(CourseOffering).count()}")
print(f"  Caps:     {db.query(FacultyTeaching).count()}")
db.close()
