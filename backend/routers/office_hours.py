from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session, selectinload
from database import get_db
from models import OfficeHour, Faculty, Term, ScheduleEntry
from schemas import OfficeHourCreate, OfficeHourUpdate, OfficeHourOut
from conflict.ConflictAuditors import _get_effective_weekdays, _entry_time_range, _time_ranges_overlap, _minutes_between
from conflict.runner import run_audits
from routers.schedule_entries import _refresh_term

router = APIRouter(tags=["office_hours"])

MIN_OFFICE_HOUR_MINUTES = 30


def _office_hour_conflict(db: Session, faculty: Faculty, term_id: int, weekday_id: int,
                           start_time: str, end_time: str, exclude_id: int | None = None) -> str | None:
    """Returns a human-readable conflict description, or None if the placement is clear."""
    if start_time >= end_time:
        return "End time must be after start time"
    if _minutes_between(start_time, end_time) < MIN_OFFICE_HOUR_MINUTES:
        return f"Office hours must be at least {MIN_OFFICE_HOUR_MINUTES} minutes"

    faculty_id = faculty.id
    other_office_hours = db.query(OfficeHour).filter(
        OfficeHour.faculty_id == faculty_id,
        OfficeHour.term_id == term_id,
        OfficeHour.weekday_id == weekday_id,
    )
    if exclude_id is not None:
        other_office_hours = other_office_hours.filter(OfficeHour.id != exclude_id)
    for oh in other_office_hours.all():
        if _time_ranges_overlap(start_time, end_time, oh.start_time, oh.end_time):
            return "Overlaps an existing office hour"

    # Meetings (feedback_58) have no faculty_id of their own — they're
    # department-wide, but department meetings only bind faculty who are both
    # department-owned and full-time (feedback_59); everyone else is free to
    # schedule office hours over them.
    requires_department_meeting = faculty.is_department_owned and faculty.full_time_or_part_time.value == "full_time"
    entry_filter = ScheduleEntry.faculty_id == faculty_id
    if requires_department_meeting:
        entry_filter = or_(entry_filter, ScheduleEntry.meeting_id.isnot(None))
    entries = (
        db.query(ScheduleEntry)
        .filter(
            ScheduleEntry.term_id == term_id,
            entry_filter,
            ScheduleEntry.schedule_table_id.isnot(None),
        )
        .options(
            selectinload(ScheduleEntry.time_slots),
            selectinload(ScheduleEntry.schedule_table),
            selectinload(ScheduleEntry.active_weekdays),
        )
        .all()
    )
    for e in entries:
        if not e.schedule_table or weekday_id not in _get_effective_weekdays(e):
            continue
        rng = _entry_time_range(e)
        if not rng:
            continue
        if _time_ranges_overlap(start_time, end_time, rng[0], rng[1]):
            return "Overlaps a scheduled meeting" if e.meeting_id else "Overlaps a scheduled course or meeting"

    return None


@router.get("/api/terms/{term_id}/office-hours", response_model=list[OfficeHourOut])
def list_office_hours(term_id: int, db: Session = Depends(get_db)):
    return db.query(OfficeHour).filter(OfficeHour.term_id == term_id).all()


@router.post("/api/faculty/{faculty_id}/office-hours", response_model=OfficeHourOut, status_code=201)
def create_office_hour(faculty_id: int, data: OfficeHourCreate, db: Session = Depends(get_db)):
    faculty = db.query(Faculty).filter(Faculty.id == faculty_id).first()
    if not faculty:
        raise HTTPException(404, "Faculty not found")
    term = db.query(Term).filter(Term.id == data.term_id).first()
    if not term:
        raise HTTPException(404, "Term not found")

    conflict = _office_hour_conflict(db, faculty, data.term_id, data.weekday_id, data.start_time, data.end_time)
    if conflict:
        raise HTTPException(409, conflict)

    office_hour = OfficeHour(
        term_id=data.term_id, faculty_id=faculty_id, weekday_id=data.weekday_id,
        start_time=data.start_time, end_time=data.end_time,
    )
    db.add(office_hour)
    db.flush()

    refreshed_term = _refresh_term(db, data.term_id)
    run_audits(db, refreshed_term)

    db.commit()
    db.refresh(office_hour)
    return office_hour


@router.put("/api/office-hours/{office_hour_id}", response_model=OfficeHourOut)
def update_office_hour(office_hour_id: int, data: OfficeHourUpdate, db: Session = Depends(get_db)):
    office_hour = db.query(OfficeHour).filter(OfficeHour.id == office_hour_id).first()
    if not office_hour:
        raise HTTPException(404, "Office hour not found")
    faculty = db.query(Faculty).filter(Faculty.id == office_hour.faculty_id).first()
    if not faculty:
        raise HTTPException(404, "Faculty not found")

    conflict = _office_hour_conflict(
        db, faculty, office_hour.term_id, office_hour.weekday_id,
        data.start_time, data.end_time, exclude_id=office_hour.id,
    )
    if conflict:
        raise HTTPException(409, conflict)

    office_hour.start_time = data.start_time
    office_hour.end_time = data.end_time
    db.flush()

    refreshed_term = _refresh_term(db, office_hour.term_id)
    run_audits(db, refreshed_term)

    db.commit()
    db.refresh(office_hour)
    return office_hour


@router.delete("/api/office-hours/{office_hour_id}", status_code=204)
def delete_office_hour(office_hour_id: int, db: Session = Depends(get_db)):
    office_hour = db.query(OfficeHour).filter(OfficeHour.id == office_hour_id).first()
    if not office_hour:
        raise HTTPException(404, "Office hour not found")
    db.delete(office_hour)
    db.commit()
