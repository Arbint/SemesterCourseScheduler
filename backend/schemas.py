from pydantic import BaseModel, ConfigDict
from typing import Optional
from models import RankEnum, SemesterEnum, WeekdayEnum


# --- Faculty ---

class FacultyBase(BaseModel):
    first_name: str
    last_name: str
    rank: RankEnum
    tags: list[str] = []
    full_load: int = 4

class FacultyCreate(FacultyBase):
    pass

class FacultyUpdate(FacultyBase):
    pass

class FacultyOut(FacultyBase):
    model_config = ConfigDict(from_attributes=True)
    id: int


# --- Semester ---

class SemesterOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: SemesterEnum


# --- Weekday ---

class WeekdayOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: WeekdayEnum
    display_order: int


# --- TimeSlot ---

class TimeSlotBase(BaseModel):
    label: str
    start_time: str
    end_time: str
    display_order: int

class TimeSlotCreate(TimeSlotBase):
    pass

class TimeSlotUpdate(TimeSlotBase):
    pass

class TimeSlotOut(TimeSlotBase):
    model_config = ConfigDict(from_attributes=True)
    id: int


# --- Room ---

class RoomBase(BaseModel):
    label: str
    capacity: int
    is_online: bool = False

class RoomCreate(RoomBase):
    pass

class RoomUpdate(RoomBase):
    pass

class RoomOut(RoomBase):
    model_config = ConfigDict(from_attributes=True)
    id: int


# --- Course ---

class CourseBase(BaseModel):
    dept_code: str
    course_number: int
    course_name: str
    duration_minutes: int = 75
    capacity: int = 30
    frequency: int = 2

class CourseCreate(CourseBase):
    pass

class CourseUpdate(CourseBase):
    pass

class CourseOut(CourseBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    semester_ids: list[int] = []
    scheduled_entry_count: int = 0

    @classmethod
    def from_orm_with_semesters(cls, course):
        obj = cls.model_validate(course)
        obj.semester_ids = [o.semester_id for o in course.offerings]
        obj.scheduled_entry_count = len(course.schedule_entries)
        return obj


# --- TaughtWith ---

class TaughtWithGroupOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    course_ids: list[int] = []

    @classmethod
    def from_orm(cls, group):
        return cls(id=group.id, course_ids=[m.course_id for m in group.members])


# --- CoReq ---

class CoReqGroupOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    course_ids: list[int] = []

    @classmethod
    def from_orm(cls, group):
        return cls(id=group.id, course_ids=[m.course_id for m in group.members])


# --- ScheduleEntry ---

class ScheduleEntryCreate(BaseModel):
    course_id: int
    room_id: Optional[int] = None
    time_slot_ids: list[int] = []
    faculty_id: Optional[int] = None
    active_weekday_ids: list[int] = []

class ScheduleEntryUpdate(BaseModel):
    room_id: Optional[int] = None
    time_slot_ids: Optional[list[int]] = None
    schedule_table_id: Optional[int] = None
    faculty_id: Optional[int] = None
    active_weekday_ids: Optional[list[int]] = None

class ScheduleEntryFacultyPatch(BaseModel):
    faculty_id: Optional[int] = None

class ScheduleEntryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    term_id: int
    schedule_table_id: Optional[int]
    course_id: int
    section: int
    room_id: Optional[int]
    faculty_id: Optional[int]
    time_slot_ids: list[int] = []
    active_weekday_ids: list[int] = []

    @classmethod
    def from_orm(cls, entry):
        return cls(
            id=entry.id,
            term_id=entry.term_id,
            schedule_table_id=entry.schedule_table_id,
            course_id=entry.course_id,
            section=entry.section,
            room_id=entry.room_id,
            faculty_id=entry.faculty_id,
            time_slot_ids=[ts.id for ts in entry.time_slots],
            active_weekday_ids=[w.id for w in entry.active_weekdays],
        )


class IssueItem(BaseModel):
    description: str
    courses: list[int] = []
    entries: list[int] = []

class EntryWithWarnings(BaseModel):
    entry: ScheduleEntryOut
    errors: list[IssueItem] = []
    warnings: list[IssueItem] = []


# --- ScheduleTable ---

class ScheduleTableCreate(BaseModel):
    weekday_ids: list[int] = []

class ScheduleTableUpdate(BaseModel):
    weekday_ids: list[int] = []

class ScheduleTableOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    term_id: int
    weekday_ids: list[int] = []
    entry_ids: list[int] = []

    @classmethod
    def from_orm(cls, table):
        return cls(
            id=table.id,
            term_id=table.term_id,
            weekday_ids=[w.id for w in table.weekdays],
            entry_ids=[e.id for e in table.entries],
        )


# --- Term ---

class TermCreate(BaseModel):
    semester_id: int
    year: int

class TermOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    semester_id: int
    year: int
    semester_name: str = ""

    @classmethod
    def from_orm(cls, term):
        return cls(
            id=term.id,
            semester_id=term.semester_id,
            year=term.year,
            semester_name=term.semester.name.value,
        )


# --- Section count ---

class SectionCountPatch(BaseModel):
    count: int


# --- Chat ---

class ChatMessage(BaseModel):
    message: str
    session_id: str

class ProposedChange(BaseModel):
    action: str
    description: str

class ChatResponse(BaseModel):
    text: str
    highlighted_course_ids: list[int] = []
    proposal: Optional[dict] = None
