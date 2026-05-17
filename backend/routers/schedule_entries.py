from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, selectinload
from database import get_db
from models import ScheduleEntry, ScheduleTable, TimeSlot, Term, Course, Weekday
from schemas import (
    ScheduleEntryCreate, ScheduleEntryUpdate, ScheduleEntryFacultyPatch,
    ScheduleEntryOut, EntryWithWarnings, IssueItem
)
from conflict.runner import run_audits

router = APIRouter(tags=["schedule_entries"])


def _refresh_term(db: Session, term_id: int) -> Term:
    """Reload the term with all relationships the auditors need, pre-loaded."""
    db.expire_all()
    return (
        db.query(Term)
        .options(
            selectinload(Term.schedule_entries)
                .selectinload(ScheduleEntry.schedule_table)
                .selectinload(ScheduleTable.weekdays),
            selectinload(Term.schedule_entries)
                .selectinload(ScheduleEntry.time_slots),
            selectinload(Term.schedule_entries)
                .selectinload(ScheduleEntry.room),
            selectinload(Term.schedule_entries)
                .selectinload(ScheduleEntry.faculty),
            selectinload(Term.schedule_entries)
                .selectinload(ScheduleEntry.course)
                .selectinload(Course.taught_with_membership),
            selectinload(Term.schedule_entries)
                .selectinload(ScheduleEntry.active_weekdays),
        )
        .filter(Term.id == term_id)
        .first()
    )


@router.get("/api/terms/{term_id}/entries", response_model=list[ScheduleEntryOut])
def list_term_entries(term_id: int, db: Session = Depends(get_db)):
    entries = db.query(ScheduleEntry).filter(ScheduleEntry.term_id == term_id).all()
    return [ScheduleEntryOut.from_orm(e) for e in entries]


@router.get("/api/tables/{table_id}/entries", response_model=list[ScheduleEntryOut])
def list_table_entries(table_id: int, db: Session = Depends(get_db)):
    entries = db.query(ScheduleEntry).filter(ScheduleEntry.schedule_table_id == table_id).all()
    return [ScheduleEntryOut.from_orm(e) for e in entries]


@router.post("/api/tables/{table_id}/entries", response_model=EntryWithWarnings, status_code=201)
def create_entry(table_id: int, data: ScheduleEntryCreate, db: Session = Depends(get_db)):
    table = db.query(ScheduleTable).filter(ScheduleTable.id == table_id).first()
    if not table:
        raise HTTPException(404, "Table not found")

    # Determine next section number for this course in this term
    existing = db.query(ScheduleEntry).filter(
        ScheduleEntry.term_id == table.term_id,
        ScheduleEntry.course_id == data.course_id,
        ScheduleEntry.schedule_table_id.isnot(None)
    ).all()

    # Find existing unscheduled entry for this course in this term to reuse
    unscheduled = db.query(ScheduleEntry).filter(
        ScheduleEntry.term_id == table.term_id,
        ScheduleEntry.course_id == data.course_id,
        ScheduleEntry.schedule_table_id.is_(None)
    ).first()

    if unscheduled:
        entry = unscheduled
        entry.schedule_table_id = table_id
        entry.section = len(existing) + 1
    else:
        entry = ScheduleEntry(
            term_id=table.term_id,
            schedule_table_id=table_id,
            course_id=data.course_id,
            section=len(existing) + 1,
        )
        db.add(entry)

    entry.room_id = data.room_id
    entry.faculty_id = data.faculty_id

    if data.time_slot_ids:
        slots = db.query(TimeSlot).filter(TimeSlot.id.in_(data.time_slot_ids)).all()
        entry.time_slots = slots

    if data.active_weekday_ids is not None:
        active_days = db.query(Weekday).filter(Weekday.id.in_(data.active_weekday_ids)).all()
        entry.active_weekdays = active_days

    db.flush()

    term = _refresh_term(db, table.term_id)
    critical, warnings = run_audits(db, term)

    db.commit()
    db.refresh(entry)

    return EntryWithWarnings(
        entry=ScheduleEntryOut.from_orm(entry),
        errors=[IssueItem(description=c.description, courses=c.courses) for c in critical],
        warnings=[IssueItem(description=w.description, courses=w.courses) for w in warnings]
    )


@router.put("/api/entries/{entry_id}", response_model=EntryWithWarnings)
def update_entry(entry_id: int, data: ScheduleEntryUpdate, db: Session = Depends(get_db)):
    entry = db.query(ScheduleEntry).filter(ScheduleEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(404, "Entry not found")

    term_id = entry.term_id

    if data.schedule_table_id is not None:
        entry.schedule_table_id = data.schedule_table_id
    if data.room_id is not None:
        entry.room_id = data.room_id
    if data.faculty_id is not None:
        entry.faculty_id = data.faculty_id

    if data.time_slot_ids is not None:
        slots = db.query(TimeSlot).filter(TimeSlot.id.in_(data.time_slot_ids)).all()
        entry.time_slots = slots

    if data.active_weekday_ids is not None:
        active_days = db.query(Weekday).filter(Weekday.id.in_(data.active_weekday_ids)).all()
        entry.active_weekdays = active_days

    db.flush()

    term = _refresh_term(db, term_id)
    critical, warnings = run_audits(db, term)

    db.commit()
    db.refresh(entry)

    return EntryWithWarnings(
        entry=ScheduleEntryOut.from_orm(entry),
        errors=[IssueItem(description=c.description, courses=c.courses) for c in critical],
        warnings=[IssueItem(description=w.description, courses=w.courses) for w in warnings]
    )


@router.patch("/api/entries/{entry_id}/faculty", response_model=EntryWithWarnings)
def patch_faculty(entry_id: int, data: ScheduleEntryFacultyPatch, db: Session = Depends(get_db)):
    entry = db.query(ScheduleEntry).filter(ScheduleEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(404, "Entry not found")

    term_id = entry.term_id
    entry.faculty_id = data.faculty_id
    db.flush()

    term = _refresh_term(db, term_id)
    critical, warnings = run_audits(db, term)

    db.commit()
    db.refresh(entry)
    return EntryWithWarnings(
        entry=ScheduleEntryOut.from_orm(entry),
        errors=[IssueItem(description=c.description, courses=c.courses) for c in critical],
        warnings=[IssueItem(description=w.description, courses=w.courses) for w in warnings]
    )


@router.delete("/api/entries/{entry_id}", status_code=204)
def delete_entry(entry_id: int, db: Session = Depends(get_db)):
    entry = db.query(ScheduleEntry).filter(ScheduleEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(404, "Entry not found")

    term_id = entry.term_id
    course_id = entry.course_id
    was_scheduled = entry.schedule_table_id is not None

    db.delete(entry)
    db.flush()

    # If we removed a scheduled section and no entries remain for this course in
    # the term, restore a blank placeholder so the course reappears as unscheduled
    # (both in the Course List and for the auto-scheduler).
    if was_scheduled:
        remaining = db.query(ScheduleEntry).filter(
            ScheduleEntry.term_id == term_id,
            ScheduleEntry.course_id == course_id,
        ).count()
        if remaining == 0:
            db.add(ScheduleEntry(term_id=term_id, course_id=course_id, section=1))

    db.commit()
