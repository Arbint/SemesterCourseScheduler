from pydantic import BaseModel, ConfigDict
from typing import Literal, Optional, Union
from models import RankEnum, SemesterEnum, WeekdayEnum


# --- Faculty ---

class FacultyBase(BaseModel):
    first_name: str
    last_name: str
    rank: RankEnum
    tags: list[str] = []

class FacultyCreate(FacultyBase):
    pass

class FacultyUpdate(FacultyBase):
    pass

class FacultyOut(FacultyBase):
    model_config = ConfigDict(from_attributes=True)
    id: int


# --- LoadSettings ---

class LoadSettingsOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    fulltime_load: int
    parttime_load: int

class LoadSettingsUpdate(BaseModel):
    fulltime_load: int
    parttime_load: int


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
    building_name: Optional[str] = None
    room_number: str
    building_code: str
    capacity: int
    is_online: bool = False

class RoomCreate(RoomBase):
    pass

class RoomUpdate(RoomBase):
    pass

class RoomOut(RoomBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    display_label: str


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
    taught_with_partner_ids: list[int] = []

    @classmethod
    def from_orm_with_semesters(cls, course):
        obj = cls.model_validate(course)
        obj.semester_ids = [o.semester_id for o in course.offerings]
        obj.scheduled_entry_count = len(course.schedule_entries)
        if course.taught_with_membership:
            obj.taught_with_partner_ids = [
                m.course_id for m in course.taught_with_membership.group.members
                if m.course_id != course.id
            ]
        return obj


# --- TaughtWith ---

class TaughtWithGroupOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    course_ids: list[int] = []

    @classmethod
    def from_orm(cls, group):
        return cls(id=group.id, course_ids=[m.course_id for m in group.members])


# --- TermTaughtWith ---

class TermTaughtWithGroupOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    term_id: int
    course_ids: list[int] = []

    @classmethod
    def from_orm(cls, group):
        return cls(id=group.id, term_id=group.term_id, course_ids=[m.course_id for m in group.members])


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
    additional_entries: list[ScheduleEntryOut] = []
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


# --- Change List (feedback_42) ---

class ChangeListRowOut(BaseModel):
    row_key: str
    term_num: Optional[Union[int, str]] = None  # e.g. "G1" for grad-only sections in real registrar data
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    crn: Optional[int] = None
    subject: Optional[str] = None
    course_number: Optional[Union[int, str]] = None  # registrar data occasionally uses non-numeric codes (e.g. "63CS1")
    section: Optional[Union[int, str]] = None  # e.g. "SL" for service-learning sections
    course_title: Optional[str] = None
    type: Optional[str] = None
    inst_method: Optional[str] = None
    instructor: Optional[str] = None
    secondary_instructor: Optional[str] = None
    hours: Optional[int] = None
    enrollment_max: Optional[int] = None
    waitlist_cap: Optional[int] = None
    begin: Optional[int] = None
    end: Optional[int] = None
    days: Optional[str] = None
    bldg: Optional[str] = None
    rm: Optional[str] = None
    course_comments: Optional[str] = None
    prerequisite: Optional[str] = None
    fee_detail: Optional[str] = None
    fee_amount: Optional[str] = None
    sig_code: Optional[str] = None
    sig_required: Optional[str] = None

class ChangeListParseOut(BaseModel):
    departments: list[str]
    sheets: dict[str, list[ChangeListRowOut]]

class ChangeListComputeRequest(BaseModel):
    term_id: int
    department: str
    old_rows: list[ChangeListRowOut] = []
    enrollment_overrides: dict[str, int] = {}

class ChangeListComputedRowOut(BaseModel):
    row_key: str
    status: Literal["keep", "changed", "delete", "add"]
    changed_fields: list[str] = []
    values: ChangeListRowOut
    original_enrollment_max: Optional[int] = None

class ChangeListComputeOut(BaseModel):
    rows: list[ChangeListComputedRowOut]


# --- Chat ---

class ChatMessage(BaseModel):
    message: str
    session_id: str

class ProposedChange(BaseModel):
    action: str
    description: str
