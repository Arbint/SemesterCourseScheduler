from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import ScheduleEntry, Term, TermCourseSectionsNeeded
from schemas import SectionCountPatch, ScheduleEntryOut

router = APIRouter(tags=["sections"])


@router.get("/api/terms/{term_id}/sections", response_model=list[ScheduleEntryOut])
def list_sections(term_id: int, db: Session = Depends(get_db)):
    entries = db.query(ScheduleEntry).filter(ScheduleEntry.term_id == term_id).order_by(
        ScheduleEntry.course_id, ScheduleEntry.section
    ).all()
    return [ScheduleEntryOut.from_orm(e) for e in entries]


@router.get("/api/terms/{term_id}/sections-needed")
def get_sections_needed(term_id: int, db: Session = Depends(get_db)):
    """course_id -> target section count, for courses where the chair has
    explicitly set one via the Course List's spin box (feedback_79)."""
    rows = db.query(TermCourseSectionsNeeded).filter(TermCourseSectionsNeeded.term_id == term_id).all()
    return {r.course_id: r.count for r in rows}


@router.patch("/api/terms/{term_id}/courses/{course_id}/section-count")
def patch_section_count(term_id: int, course_id: int, data: SectionCountPatch, db: Session = Depends(get_db)):
    term = db.query(Term).filter(Term.id == term_id).first()
    if not term:
        raise HTTPException(404, "Term not found")

    entries = db.query(ScheduleEntry).filter(
        ScheduleEntry.term_id == term_id,
        ScheduleEntry.course_id == course_id,
    ).order_by(ScheduleEntry.section.desc()).all()

    current_count = len(entries)
    target_count = data.count

    if target_count < 1:
        raise HTTPException(400, "Section count must be at least 1")

    if target_count > current_count:
        # Add entries, filling any gaps in currently-used section numbers
        # before appending past the highest one (feedback_79).
        used = {e.section for e in entries}
        to_add = target_count - current_count
        n = 1
        added = 0
        while added < to_add:
            if n not in used:
                db.add(ScheduleEntry(term_id=term_id, course_id=course_id, section=n))
                used.add(n)
                added += 1
            n += 1
    elif target_count < current_count:
        # Remove from the end (highest section numbers first)
        to_remove = entries[:current_count - target_count]
        for e in to_remove:
            db.delete(e)

    # Persist the target itself (distinct from actual entry count — a course
    # can be over-sectioned beyond this via plain drag-and-drop, which is
    # exactly what the SectionNumbering auditor flags).
    needed_row = db.query(TermCourseSectionsNeeded).filter_by(term_id=term_id, course_id=course_id).first()
    if needed_row:
        needed_row.count = target_count
    else:
        db.add(TermCourseSectionsNeeded(term_id=term_id, course_id=course_id, count=target_count))

    db.commit()
    return {"ok": True, "count": target_count}
