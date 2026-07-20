from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db
from models import (
    Term, ScheduleEntry, ScheduleTable, CourseOffering,
    TermTaughtWithGroup, TermTaughtWithMember,
)
from schemas import TermCreate, TermOut, TermRename, TermTaughtWithGroupOut

router = APIRouter(prefix="/api/terms", tags=["terms"])


@router.get("", response_model=list[TermOut])
def list_terms(db: Session = Depends(get_db)):
    terms = db.query(Term).all()
    return [TermOut.from_orm(t) for t in terms]


@router.post("", response_model=TermOut, status_code=201)
def create_term(data: TermCreate, db: Session = Depends(get_db)):
    name = data.name.strip()
    existing = db.query(Term).filter_by(semester_id=data.semester_id, year=data.year, name=name).first()
    if existing:
        raise HTTPException(409, "Term already exists")

    source = None
    if data.duplicate_from_id is not None:
        source = db.query(Term).filter(Term.id == data.duplicate_from_id).first()
        if not source:
            raise HTTPException(404, "Duplicate-from term not found")

    term = Term(semester_id=data.semester_id, year=data.year, name=name)
    db.add(term)
    db.flush()

    if source is None:
        # Auto-populate one ScheduleEntry per offered course
        offerings = db.query(CourseOffering).filter(CourseOffering.semester_id == data.semester_id).all()
        for offering in offerings:
            entry = ScheduleEntry(
                term_id=term.id,
                course_id=offering.course_id,
                section=1,
            )
            db.add(entry)
    else:
        # Duplicate schedule tables, entries, and per-term TaughtWith groups
        # from the source term as a starting point.
        table_id_map: dict[int, int] = {}
        for src_table in source.schedule_tables:
            new_table = ScheduleTable(term_id=term.id, weekdays=list(src_table.weekdays))
            db.add(new_table)
            db.flush()
            table_id_map[src_table.id] = new_table.id

        for src_entry in source.schedule_entries:
            new_entry = ScheduleEntry(
                term_id=term.id,
                schedule_table_id=table_id_map.get(src_entry.schedule_table_id),
                course_id=src_entry.course_id,
                section=src_entry.section,
                room_id=src_entry.room_id,
                faculty_id=src_entry.faculty_id,
                time_slots=list(src_entry.time_slots),
                active_weekdays=list(src_entry.active_weekdays),
            )
            db.add(new_entry)

        for src_group in source.term_taught_with_groups:
            new_group = TermTaughtWithGroup(term_id=term.id)
            db.add(new_group)
            db.flush()
            for member in src_group.members:
                db.add(TermTaughtWithMember(group_id=new_group.id, course_id=member.course_id))

    db.commit()
    db.refresh(term)
    return TermOut.from_orm(term)


@router.patch("/{term_id}", response_model=TermOut)
def rename_term(term_id: int, data: TermRename, db: Session = Depends(get_db)):
    term = db.query(Term).filter(Term.id == term_id).first()
    if not term:
        raise HTTPException(404, "Term not found")

    name = data.name.strip()
    existing = db.query(Term).filter(
        Term.semester_id == term.semester_id, Term.year == term.year,
        Term.name == name, Term.id != term_id,
    ).first()
    if existing:
        raise HTTPException(409, "A term with that name already exists for this semester/year")

    term.name = name
    db.commit()
    db.refresh(term)
    return TermOut.from_orm(term)


@router.get("/{term_id}", response_model=TermOut)
def get_term(term_id: int, db: Session = Depends(get_db)):
    t = db.query(Term).filter(Term.id == term_id).first()
    if not t:
        raise HTTPException(404, "Term not found")
    return TermOut.from_orm(t)


@router.delete("/{term_id}", status_code=204)
def delete_term(term_id: int, db: Session = Depends(get_db)):
    t = db.query(Term).filter(Term.id == term_id).first()
    if not t:
        raise HTTPException(404, "Term not found")
    db.delete(t)
    db.commit()


@router.get("/{term_id}/course-list/export")
def export_course_list(term_id: int, entry_ids: str = Query(..., description="Comma-separated ScheduleEntry ids, in the order to export"), db: Session = Depends(get_db)):
    from export import generate_course_list_excel
    ids = [int(x) for x in entry_ids.split(",") if x.strip()]
    try:
        content = generate_course_list_excel(db, term_id, ids)
    except ValueError as e:
        raise HTTPException(404, str(e))
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=course_list_{term_id}.xlsx"}
    )


# --- Per-term TaughtWith ---

class TermTaughtWithCreate(BaseModel):
    course_ids: list[int]


@router.get("/{term_id}/taughtwith", response_model=list[TermTaughtWithGroupOut])
def list_term_taughtwith(term_id: int, db: Session = Depends(get_db)):
    groups = db.query(TermTaughtWithGroup).filter(TermTaughtWithGroup.term_id == term_id).all()
    return [TermTaughtWithGroupOut.from_orm(g) for g in groups]


@router.post("/{term_id}/taughtwith", response_model=TermTaughtWithGroupOut, status_code=201)
def create_term_taughtwith(term_id: int, data: TermTaughtWithCreate, db: Session = Depends(get_db)):
    if not db.query(Term).filter(Term.id == term_id).first():
        raise HTTPException(404, "Term not found")
    if len(data.course_ids) < 2:
        raise HTTPException(400, "A TaughtWith group requires at least 2 courses")
    group = TermTaughtWithGroup(term_id=term_id)
    db.add(group)
    db.flush()
    for cid in data.course_ids:
        db.add(TermTaughtWithMember(group_id=group.id, course_id=cid))
    db.commit()
    db.refresh(group)
    return TermTaughtWithGroupOut.from_orm(group)


@router.delete("/{term_id}/taughtwith/{group_id}", status_code=204)
def delete_term_taughtwith(term_id: int, group_id: int, db: Session = Depends(get_db)):
    g = db.query(TermTaughtWithGroup).filter_by(id=group_id, term_id=term_id).first()
    if not g:
        raise HTTPException(404, "Group not found")
    db.delete(g)
    db.commit()
