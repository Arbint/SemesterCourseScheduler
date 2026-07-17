from sqlalchemy import (
    Column, Integer, String, Enum, JSON, ForeignKey, UniqueConstraint,
    Table, Time, CheckConstraint, Boolean
)
from sqlalchemy.orm import relationship
import enum
from database import Base


class FullTimeOrPartTimeEnum(str, enum.Enum):
    full_time = "full_time"
    part_time = "part_time"


class FacultyRankEnum(str, enum.Enum):
    instructor = "instructor"
    senior_instructor = "senior_instructor"
    assistant_professor = "assistant_professor"
    associate_professor = "associate_professor"
    professor_of_practice = "professor_of_practice"
    professor = "professor"


class SemesterEnum(str, enum.Enum):
    fall = "fall"
    spring = "spring"
    summer = "summer"


class WeekdayEnum(str, enum.Enum):
    mon = "mon"
    tue = "tue"
    wed = "wed"
    thu = "thu"
    fri = "fri"


# Association tables
schedule_table_weekdays = Table(
    "schedule_table_weekdays",
    Base.metadata,
    Column("schedule_table_id", Integer, ForeignKey("schedule_tables.id"), primary_key=True),
    Column("weekday_id", Integer, ForeignKey("weekdays.id"), primary_key=True),
)

schedule_entry_timeslots = Table(
    "schedule_entry_timeslots",
    Base.metadata,
    Column("schedule_entry_id", Integer, ForeignKey("schedule_entries.id"), primary_key=True),
    Column("time_slot_id", Integer, ForeignKey("time_slots.id"), primary_key=True),
)

schedule_entry_active_weekdays = Table(
    "schedule_entry_active_weekdays",
    Base.metadata,
    Column("schedule_entry_id", Integer, ForeignKey("schedule_entries.id"), primary_key=True),
    Column("weekday_id", Integer, ForeignKey("weekdays.id"), primary_key=True),
)



class Faculty(Base):
    __tablename__ = "faculty"

    id = Column(Integer, primary_key=True, index=True)
    first_name = Column(String, nullable=False)
    last_name = Column(String, nullable=False)
    full_time_or_part_time = Column(Enum(FullTimeOrPartTimeEnum), nullable=False)
    tags = Column(JSON, default=list)
    office = Column(String, nullable=True)
    is_department_owned = Column(Boolean, nullable=False, default=False)
    # Academic rank (feedback_60) — purely informational, doesn't affect any
    # scheduling/load/conflict logic, just needs to be settable and printed.
    rank = Column(Enum(FacultyRankEnum), nullable=True)

    teaching_capabilities = relationship("FacultyTeaching", back_populates="faculty", cascade="all, delete-orphan")
    schedule_entries = relationship("ScheduleEntry", back_populates="faculty")


class LoadSettings(Base):
    __tablename__ = "load_settings"

    id = Column(Integer, primary_key=True, default=1)
    fulltime_load = Column(Integer, nullable=False, default=3)
    parttime_load = Column(Integer, nullable=False, default=2)
    min_office_hours_fulltime = Column(Integer, nullable=False, default=4)
    min_office_hours_parttime = Column(Integer, nullable=False, default=1)


class DoorTagSettings(Base):
    """Singleton (id=1), same pattern as LoadSettings — persists across all
    terms rather than being scoped to one."""
    __tablename__ = "door_tag_settings"

    id = Column(Integer, primary_key=True, default=1)
    department_empty_label = Column(String, nullable=False, default="OPEN")
    shared_empty_label = Column(String, nullable=False, default="OPEN")


class Semester(Base):
    __tablename__ = "semesters"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(Enum(SemesterEnum), unique=True, nullable=False)

    offerings = relationship("CourseOffering", back_populates="semester")
    terms = relationship("Term", back_populates="semester")


class Weekday(Base):
    __tablename__ = "weekdays"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(Enum(WeekdayEnum), unique=True, nullable=False)
    display_order = Column(Integer, nullable=False)

    schedule_tables = relationship("ScheduleTable", secondary=schedule_table_weekdays, back_populates="weekdays")
    active_in_entries = relationship("ScheduleEntry", secondary=schedule_entry_active_weekdays, back_populates="active_weekdays")


class TimeSlot(Base):
    __tablename__ = "time_slots"

    id = Column(Integer, primary_key=True, index=True)
    label = Column(String, nullable=False)
    start_time = Column(String, nullable=False)
    end_time = Column(String, nullable=False)
    display_order = Column(Integer, nullable=False)

    schedule_entries = relationship("ScheduleEntry", secondary=schedule_entry_timeslots, back_populates="time_slots")


class Room(Base):
    __tablename__ = "rooms"
    __table_args__ = (UniqueConstraint("building_code", "room_number"),)

    id = Column(Integer, primary_key=True, index=True)
    building_name = Column(String, nullable=True)   # optional full name, e.g. "Fullerton Hall"
    room_number = Column(String, nullable=False)
    building_code = Column(String, nullable=False)  # required abbreviation, e.g. "FH"
    capacity = Column(Integer, nullable=False)
    is_online = Column(Boolean, nullable=False, default=False)
    is_department_owned = Column(Boolean, nullable=False, default=False)

    schedule_entries = relationship("ScheduleEntry", back_populates="room")

    @property
    def display_label(self) -> str:
        return f"{self.building_code} {self.room_number}"


class Course(Base):
    __tablename__ = "courses"

    id = Column(Integer, primary_key=True, index=True)
    dept_code = Column(String, nullable=False)
    course_number = Column(Integer, nullable=False)
    course_name = Column(String, nullable=False)
    duration_minutes = Column(Integer, nullable=False, default=75)
    capacity = Column(Integer, nullable=False, default=30)
    frequency = Column(Integer, nullable=False, default=2)

    offerings = relationship("CourseOffering", back_populates="course", cascade="all, delete-orphan")
    teaching_capabilities = relationship("FacultyTeaching", back_populates="course", cascade="all, delete-orphan")
    schedule_entries = relationship("ScheduleEntry", back_populates="course")
    taught_with_membership = relationship("TaughtWithMember", back_populates="course", uselist=False, cascade="all, delete-orphan")
    coreq_memberships = relationship("CoReqMember", back_populates="course", cascade="all, delete-orphan")


class CourseOffering(Base):
    __tablename__ = "course_offerings"

    course_id = Column(Integer, ForeignKey("courses.id"), primary_key=True)
    semester_id = Column(Integer, ForeignKey("semesters.id"), primary_key=True)

    course = relationship("Course", back_populates="offerings")
    semester = relationship("Semester", back_populates="offerings")


class FacultyTeaching(Base):
    __tablename__ = "faculty_teaching"

    faculty_id = Column(Integer, ForeignKey("faculty.id"), primary_key=True)
    course_id = Column(Integer, ForeignKey("courses.id"), primary_key=True)

    faculty = relationship("Faculty", back_populates="teaching_capabilities")
    course = relationship("Course", back_populates="teaching_capabilities")


class TaughtWithGroup(Base):
    __tablename__ = "taught_with_groups"

    id = Column(Integer, primary_key=True, index=True)
    members = relationship("TaughtWithMember", back_populates="group", cascade="all, delete-orphan")


class TaughtWithMember(Base):
    __tablename__ = "taught_with_members"

    group_id = Column(Integer, ForeignKey("taught_with_groups.id"), primary_key=True)
    course_id = Column(Integer, ForeignKey("courses.id"), primary_key=True, unique=True)

    group = relationship("TaughtWithGroup", back_populates="members")
    course = relationship("Course", back_populates="taught_with_membership")


class CoReqGroup(Base):
    __tablename__ = "coreq_groups"

    id = Column(Integer, primary_key=True, index=True)
    members = relationship("CoReqMember", back_populates="group", cascade="all, delete-orphan")


class CoReqMember(Base):
    __tablename__ = "coreq_members"

    group_id = Column(Integer, ForeignKey("coreq_groups.id"), primary_key=True)
    course_id = Column(Integer, ForeignKey("courses.id"), primary_key=True)

    group = relationship("CoReqGroup", back_populates="members")
    course = relationship("Course", back_populates="coreq_memberships")


class TermTaughtWithGroup(Base):
    __tablename__ = "term_taught_with_groups"

    id = Column(Integer, primary_key=True, index=True)
    term_id = Column(Integer, ForeignKey("terms.id"), nullable=False)

    term = relationship("Term", back_populates="term_taught_with_groups")
    members = relationship("TermTaughtWithMember", back_populates="group", cascade="all, delete-orphan")


class TermTaughtWithMember(Base):
    __tablename__ = "term_taught_with_members"

    group_id = Column(Integer, ForeignKey("term_taught_with_groups.id"), primary_key=True)
    course_id = Column(Integer, ForeignKey("courses.id"), primary_key=True)

    group = relationship("TermTaughtWithGroup", back_populates="members")
    course = relationship("Course")


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, nullable=False, unique=True)
    hashed_password = Column(String, nullable=False)


class Term(Base):
    __tablename__ = "terms"

    id = Column(Integer, primary_key=True, index=True)
    semester_id = Column(Integer, ForeignKey("semesters.id"), nullable=False)
    year = Column(Integer, nullable=False)
    name = Column(String, nullable=False, default="")

    __table_args__ = (UniqueConstraint("semester_id", "year", "name", name="uq_term_semester_year_name"),)

    semester = relationship("Semester", back_populates="terms")
    schedule_tables = relationship("ScheduleTable", back_populates="term", cascade="all, delete-orphan")
    schedule_entries = relationship("ScheduleEntry", back_populates="term", cascade="all, delete-orphan")
    term_taught_with_groups = relationship("TermTaughtWithGroup", back_populates="term", cascade="all, delete-orphan")
    meetings = relationship("Meeting", back_populates="term", cascade="all, delete-orphan")
    office_hours = relationship("OfficeHour", back_populates="term", cascade="all, delete-orphan")


class Meeting(Base):
    __tablename__ = "meetings"

    id = Column(Integer, primary_key=True, index=True)
    term_id = Column(Integer, ForeignKey("terms.id"), nullable=False)
    name = Column(String, nullable=False)
    duration_minutes = Column(Integer, nullable=False, default=75)
    frequency = Column(Integer, nullable=False, default=2)

    term = relationship("Term", back_populates="meetings")
    schedule_entries = relationship("ScheduleEntry", back_populates="meeting", cascade="all, delete-orphan")


class OfficeHour(Base):
    __tablename__ = "office_hours"

    id = Column(Integer, primary_key=True, index=True)
    term_id = Column(Integer, ForeignKey("terms.id"), nullable=False)
    faculty_id = Column(Integer, ForeignKey("faculty.id"), nullable=False)
    weekday_id = Column(Integer, ForeignKey("weekdays.id"), nullable=False)
    # Free-form "HH:MM" 24h strings (feedback_57) — not tied to any predefined
    # TimeSlot, so faculty aren't constrained to slot boundaries.
    start_time = Column(String, nullable=False)
    end_time = Column(String, nullable=False)

    term = relationship("Term", back_populates="office_hours")
    faculty = relationship("Faculty")
    weekday = relationship("Weekday")


class ScheduleTable(Base):
    __tablename__ = "schedule_tables"

    id = Column(Integer, primary_key=True, index=True)
    term_id = Column(Integer, ForeignKey("terms.id"), nullable=False)

    term = relationship("Term", back_populates="schedule_tables")
    weekdays = relationship("Weekday", secondary=schedule_table_weekdays, back_populates="schedule_tables")
    entries = relationship("ScheduleEntry", back_populates="schedule_table", cascade="all, delete-orphan")


class ScheduleEntry(Base):
    __tablename__ = "schedule_entries"

    id = Column(Integer, primary_key=True, index=True)
    term_id = Column(Integer, ForeignKey("terms.id"), nullable=False)
    schedule_table_id = Column(Integer, ForeignKey("schedule_tables.id"), nullable=True)
    # Exactly one of course_id / meeting_id is set on any row.
    course_id = Column(Integer, ForeignKey("courses.id"), nullable=True)
    meeting_id = Column(Integer, ForeignKey("meetings.id"), nullable=True)
    section = Column(Integer, nullable=False, default=1)
    room_id = Column(Integer, ForeignKey("rooms.id"), nullable=True)
    faculty_id = Column(Integer, ForeignKey("faculty.id"), nullable=True)

    term = relationship("Term", back_populates="schedule_entries")
    schedule_table = relationship("ScheduleTable", back_populates="entries")
    course = relationship("Course", back_populates="schedule_entries")
    meeting = relationship("Meeting", back_populates="schedule_entries")
    room = relationship("Room", back_populates="schedule_entries")
    faculty = relationship("Faculty", back_populates="schedule_entries")
    time_slots = relationship("TimeSlot", secondary=schedule_entry_timeslots, back_populates="schedule_entries")
    active_weekdays = relationship("Weekday", secondary=schedule_entry_active_weekdays, back_populates="active_in_entries")
