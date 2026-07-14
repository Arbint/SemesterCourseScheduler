from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, selectinload
from database import get_db
from models import ScheduleEntry, ScheduleTable, TimeSlot, Term, Course, Weekday, TaughtWithMember, TermTaughtWithMember, TermTaughtWithGroup
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


def _place_taught_with_partners(
    db: Session,
    source_entry: ScheduleEntry,
    table_id: int,
    room_id,
    time_slot_ids: list[int],
) -> list[ScheduleEntry]:
    """Co-schedule all TaughtWith partners of source_entry into the same slot.

    - If a partner already has a scheduled section, move it.
    - If it has an unscheduled placeholder, place it.
    - If it has no entry at all (not offered this term), skip it.
    Returns the list of partner entries that were affected.
    """
    partner_ids: set[int] = set()

    # Global TaughtWith
    membership = db.query(TaughtWithMember).filter(
        TaughtWithMember.course_id == source_entry.course_id
    ).first()
    if membership:
        for m in db.query(TaughtWithMember).filter(
            TaughtWithMember.group_id == membership.group_id,
            TaughtWithMember.course_id != source_entry.course_id,
        ).all():
            partner_ids.add(m.course_id)

    # Per-term TaughtWith
    term_membership = (
        db.query(TermTaughtWithMember)
        .join(TermTaughtWithGroup, TermTaughtWithMember.group_id == TermTaughtWithGroup.id)
        .filter(
            TermTaughtWithMember.course_id == source_entry.course_id,
            TermTaughtWithGroup.term_id == source_entry.term_id,
        )
        .first()
    )
    if term_membership:
        for m in db.query(TermTaughtWithMember).filter(
            TermTaughtWithMember.group_id == term_membership.group_id,
            TermTaughtWithMember.course_id != source_entry.course_id,
        ).all():
            partner_ids.add(m.course_id)

    if not partner_ids:
        return []

    slots = db.query(TimeSlot).filter(TimeSlot.id.in_(time_slot_ids)).all()
    affected: list[ScheduleEntry] = []

    for partner_id in partner_ids:
        # Prefer moving an already-scheduled section, otherwise use the placeholder.
        partner_entry = (
            db.query(ScheduleEntry)
            .filter(
                ScheduleEntry.term_id == source_entry.term_id,
                ScheduleEntry.course_id == partner_id,
                ScheduleEntry.schedule_table_id.isnot(None),
            )
            .first()
            or db.query(ScheduleEntry)
            .filter(
                ScheduleEntry.term_id == source_entry.term_id,
                ScheduleEntry.course_id == partner_id,
                ScheduleEntry.schedule_table_id.is_(None),
            )
            .first()
        )
        if not partner_entry:
            continue  # course not offered this term — skip

        partner_entry.schedule_table_id = table_id
        partner_entry.room_id = room_id
        partner_entry.time_slots = slots
        affected.append(partner_entry)

    return affected


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

    partner_entries = _place_taught_with_partners(db, entry, table_id, data.room_id, data.time_slot_ids)
    db.flush()

    term = _refresh_term(db, table.term_id)
    critical, warnings = run_audits(db, term)

    db.commit()
    db.refresh(entry)
    for pe in partner_entries:
        db.refresh(pe)

    return EntryWithWarnings(
        entry=ScheduleEntryOut.from_orm(entry),
        additional_entries=[ScheduleEntryOut.from_orm(pe) for pe in partner_entries],
        errors=[IssueItem(description=c.description, courses=c.courses, entries=c.entries) for c in critical],
        warnings=[IssueItem(description=w.description, courses=w.courses, entries=w.entries) for w in warnings]
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

    # Co-move TaughtWith partners only when the slot/table actually changed
    partner_entries: list[ScheduleEntry] = []
    if data.schedule_table_id is not None or data.room_id is not None or data.time_slot_ids is not None:
        final_slot_ids = data.time_slot_ids if data.time_slot_ids is not None else [ts.id for ts in entry.time_slots]
        partner_entries = _place_taught_with_partners(
            db, entry, entry.schedule_table_id, entry.room_id, final_slot_ids
        )

    db.flush()

    term = _refresh_term(db, term_id)
    critical, warnings = run_audits(db, term)

    db.commit()
    db.refresh(entry)
    for pe in partner_entries:
        db.refresh(pe)

    return EntryWithWarnings(
        entry=ScheduleEntryOut.from_orm(entry),
        additional_entries=[ScheduleEntryOut.from_orm(pe) for pe in partner_entries],
        errors=[IssueItem(description=c.description, courses=c.courses, entries=c.entries) for c in critical],
        warnings=[IssueItem(description=w.description, courses=w.courses, entries=w.entries) for w in warnings]
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
        errors=[IssueItem(description=c.description, courses=c.courses, entries=c.entries) for c in critical],
        warnings=[IssueItem(description=w.description, courses=w.courses, entries=w.entries) for w in warnings]
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


@router.get("/api/terms/{term_id}/audit")
def audit_term(term_id: int, db: Session = Depends(get_db)):
    term = _refresh_term(db, term_id)
    if not term:
        raise HTTPException(404, "Term not found")
    critical, warnings = run_audits(db, term)
    return {
        "errors": [{"description": r.description, "courses": r.courses, "entries": r.entries} for r in critical],
        "warnings": [{"description": r.description, "courses": r.courses, "entries": r.entries} for r in warnings],
    }
