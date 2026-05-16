from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import ScheduleEntry, Term
from schemas import SectionCountPatch, ScheduleEntryOut

router = APIRouter(tags=["sections"])


@router.get("/api/terms/{term_id}/sections", response_model=list[ScheduleEntryOut])
def list_sections(term_id: int, db: Session = Depends(get_db)):
    entries = db.query(ScheduleEntry).filter(ScheduleEntry.term_id == term_id).order_by(
        ScheduleEntry.course_id, ScheduleEntry.section
    ).all()
    return [ScheduleEntryOut.from_orm(e) for e in entries]


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
        # Add entries
        for i in range(current_count, target_count):
            db.add(ScheduleEntry(
                term_id=term_id,
                course_id=course_id,
                section=i + 1,
            ))
    elif target_count < current_count:
        # Remove from the end (highest section numbers first)
        to_remove = entries[:current_count - target_count]
        for e in to_remove:
            db.delete(e)

    db.commit()
    return {"ok": True, "count": target_count}
