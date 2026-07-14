from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional
from database import get_db
from models import Course, CourseOffering, Semester, SemesterEnum, ScheduleEntry, Term
from schemas import CourseCreate, CourseUpdate, CourseOut

router = APIRouter(prefix="/api/courses", tags=["courses"])


@router.get("", response_model=list[CourseOut])
def list_courses(semester: Optional[str] = Query(None), db: Session = Depends(get_db)):
    query = db.query(Course)
    if semester:
        sem = db.query(Semester).filter(Semester.name == semester).first()
        if not sem:
            raise HTTPException(404, "Semester not found")
        query = query.join(CourseOffering).filter(CourseOffering.semester_id == sem.id)
    courses = query.all()
    return [CourseOut.from_orm_with_semesters(c) for c in courses]


@router.post("", response_model=CourseOut, status_code=201)
def create_course(data: CourseCreate, db: Session = Depends(get_db)):
    course = Course(**data.model_dump())
    db.add(course)
    db.commit()
    db.refresh(course)
    return CourseOut.from_orm_with_semesters(course)


@router.get("/{course_id}", response_model=CourseOut)
def get_course(course_id: int, db: Session = Depends(get_db)):
    c = db.query(Course).filter(Course.id == course_id).first()
    if not c:
        raise HTTPException(404, "Course not found")
    return CourseOut.from_orm_with_semesters(c)


@router.put("/{course_id}", response_model=CourseOut)
def update_course(course_id: int, data: CourseUpdate, db: Session = Depends(get_db)):
    c = db.query(Course).filter(Course.id == course_id).first()
    if not c:
        raise HTTPException(404, "Course not found")
    for k, v in data.model_dump().items():
        setattr(c, k, v)
    db.commit()
    db.refresh(c)
    return CourseOut.from_orm_with_semesters(c)


@router.delete("/{course_id}", status_code=204)
def delete_course(course_id: int, db: Session = Depends(get_db)):
    c = db.query(Course).filter(Course.id == course_id).first()
    if not c:
        raise HTTPException(404, "Course not found")
    db.query(ScheduleEntry).filter(ScheduleEntry.course_id == course_id).delete()
    db.delete(c)
    db.commit()


@router.get("/{course_id}/semesters/{semester_id}/impact")
def get_offering_removal_impact(course_id: int, semester_id: int, db: Session = Depends(get_db)):
    """Terms of this semester that already have schedule entries for this
    course — used by the frontend to warn before removing the offering,
    since those entries would otherwise be silently dropped from the term's
    course list without ever being cleaned up (they'd become invisible
    orphans: not shown in the course list because the course is no longer
    offered, but still sitting in the database)."""
    terms = db.query(Term).filter_by(semester_id=semester_id).all()
    affected = []
    for term in terms:
        entries = db.query(ScheduleEntry).filter_by(course_id=course_id, term_id=term.id).all()
        if entries:
            affected.append({
                "term_id": term.id,
                "term_label": f"{term.semester.name.value.capitalize()} {term.year}",
                "entry_count": len(entries),
                "scheduled_count": sum(1 for e in entries if e.schedule_table_id is not None),
            })
    return {"affected_terms": affected}


@router.post("/{course_id}/semesters/{semester_id}", status_code=201)
def add_offering(course_id: int, semester_id: int, db: Session = Depends(get_db)):
    existing = db.query(CourseOffering).filter_by(course_id=course_id, semester_id=semester_id).first()
    if existing:
        raise HTTPException(409, "Offering already exists")
    db.add(CourseOffering(course_id=course_id, semester_id=semester_id))
    db.flush()

    # The course is now offered in this semester — make sure it shows up in
    # the course list of any existing term for that semester, the same way
    # it would if the term had been created after this offering existed.
    terms = db.query(Term).filter_by(semester_id=semester_id).all()
    for term in terms:
        has_entry = db.query(ScheduleEntry).filter_by(course_id=course_id, term_id=term.id).first()
        if not has_entry:
            db.add(ScheduleEntry(term_id=term.id, course_id=course_id, section=1))

    db.commit()
    return {"ok": True}


@router.delete("/{course_id}/semesters/{semester_id}", status_code=204)
def remove_offering(course_id: int, semester_id: int, db: Session = Depends(get_db)):
    row = db.query(CourseOffering).filter_by(course_id=course_id, semester_id=semester_id).first()
    if not row:
        raise HTTPException(404, "Not found")
    db.delete(row)

    # The course is no longer offered in this semester — remove any
    # leftover schedule entries in existing terms of that semester so they
    # don't linger as orphans (hidden from the course list, but still in
    # the database and, if scheduled, still occupying a table slot).
    term_ids = [t.id for t in db.query(Term).filter_by(semester_id=semester_id).all()]
    if term_ids:
        entries = db.query(ScheduleEntry).filter(
            ScheduleEntry.course_id == course_id,
            ScheduleEntry.term_id.in_(term_ids),
        ).all()
        for entry in entries:
            db.delete(entry)

    db.commit()
