from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import Term, ScheduleEntry, CourseOffering
from schemas import TermCreate, TermOut

router = APIRouter(prefix="/api/terms", tags=["terms"])


@router.get("", response_model=list[TermOut])
def list_terms(db: Session = Depends(get_db)):
    terms = db.query(Term).all()
    return [TermOut.from_orm(t) for t in terms]


@router.post("", response_model=TermOut, status_code=201)
def create_term(data: TermCreate, db: Session = Depends(get_db)):
    existing = db.query(Term).filter_by(semester_id=data.semester_id, year=data.year).first()
    if existing:
        raise HTTPException(409, "Term already exists")

    term = Term(semester_id=data.semester_id, year=data.year)
    db.add(term)
    db.flush()

    # Auto-populate one ScheduleEntry per offered course
    offerings = db.query(CourseOffering).filter(CourseOffering.semester_id == data.semester_id).all()
    for offering in offerings:
        entry = ScheduleEntry(
            term_id=term.id,
            course_id=offering.course_id,
            section=1,
        )
        db.add(entry)

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
