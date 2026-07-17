from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, selectinload
from database import get_db
from models import OfficeHour, Faculty, Term, TimeSlot, ScheduleEntry
from schemas import OfficeHourCreate, OfficeHourResize, OfficeHourOut
from conflict.ConflictAuditors import _get_effective_weekdays
from conflict.runner import run_audits
from routers.schedule_entries import _refresh_term

router = APIRouter(tags=["office_hours"])


def _office_hour_conflict(db: Session, faculty_id: int, term_id: int, weekday_id: int,
                           time_slot_ids: list[int], exclude_id: int | None = None) -> str | None:
    """Returns a human-readable conflict description, or None if the placement is clear."""
    slot_ids = set(time_slot_ids)
    if not slot_ids:
        return "At least one time slot is required"

    other_office_hours = db.query(OfficeHour).filter(
        OfficeHour.faculty_id == faculty_id,
        OfficeHour.term_id == term_id,
        OfficeHour.weekday_id == weekday_id,
    )
    if exclude_id is not None:
        other_office_hours = other_office_hours.filter(OfficeHour.id != exclude_id)
    for oh in other_office_hours.all():
        if slot_ids & {ts.id for ts in oh.time_slots}:
            return "Overlaps an existing office hour"

    entries = (
        db.query(ScheduleEntry)
        .filter(
            ScheduleEntry.term_id == term_id,
            ScheduleEntry.faculty_id == faculty_id,
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
        if slot_ids & {ts.id for ts in e.time_slots}:
            return "Overlaps a scheduled course or meeting"

    return None


@router.get("/api/terms/{term_id}/office-hours", response_model=list[OfficeHourOut])
def list_office_hours(term_id: int, db: Session = Depends(get_db)):
    rows = db.query(OfficeHour).filter(OfficeHour.term_id == term_id).all()
    return [OfficeHourOut.from_orm(r) for r in rows]


@router.post("/api/faculty/{faculty_id}/office-hours", response_model=OfficeHourOut, status_code=201)
def create_office_hour(faculty_id: int, data: OfficeHourCreate, db: Session = Depends(get_db)):
    faculty = db.query(Faculty).filter(Faculty.id == faculty_id).first()
    if not faculty:
        raise HTTPException(404, "Faculty not found")
    term = db.query(Term).filter(Term.id == data.term_id).first()
    if not term:
        raise HTTPException(404, "Term not found")

    conflict = _office_hour_conflict(db, faculty_id, data.term_id, data.weekday_id, data.time_slot_ids)
    if conflict:
        raise HTTPException(409, conflict)

    slots = db.query(TimeSlot).filter(TimeSlot.id.in_(data.time_slot_ids)).all()
    office_hour = OfficeHour(term_id=data.term_id, faculty_id=faculty_id, weekday_id=data.weekday_id)
    office_hour.time_slots = slots
    db.add(office_hour)
    db.flush()

    refreshed_term = _refresh_term(db, data.term_id)
    run_audits(db, refreshed_term)

    db.commit()
    db.refresh(office_hour)
    return OfficeHourOut.from_orm(office_hour)


@router.put("/api/office-hours/{office_hour_id}", response_model=OfficeHourOut)
def resize_office_hour(office_hour_id: int, data: OfficeHourResize, db: Session = Depends(get_db)):
    office_hour = db.query(OfficeHour).filter(OfficeHour.id == office_hour_id).first()
    if not office_hour:
        raise HTTPException(404, "Office hour not found")

    conflict = _office_hour_conflict(
        db, office_hour.faculty_id, office_hour.term_id, office_hour.weekday_id,
        data.time_slot_ids, exclude_id=office_hour.id,
    )
    if conflict:
        raise HTTPException(409, conflict)

    slots = db.query(TimeSlot).filter(TimeSlot.id.in_(data.time_slot_ids)).all()
    office_hour.time_slots = slots
    db.flush()

    refreshed_term = _refresh_term(db, office_hour.term_id)
    run_audits(db, refreshed_term)

    db.commit()
    db.refresh(office_hour)
    return OfficeHourOut.from_orm(office_hour)


@router.delete("/api/office-hours/{office_hour_id}", status_code=204)
def delete_office_hour(office_hour_id: int, db: Session = Depends(get_db)):
    office_hour = db.query(OfficeHour).filter(OfficeHour.id == office_hour_id).first()
    if not office_hour:
        raise HTTPException(404, "Office hour not found")
    db.delete(office_hour)
    db.commit()
