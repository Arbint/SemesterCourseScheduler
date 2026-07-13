from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional
from database import get_db
from models import Course, CourseOffering, Semester, SemesterEnum, ScheduleEntry
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


@router.post("/{course_id}/semesters/{semester_id}", status_code=201)
def add_offering(course_id: int, semester_id: int, db: Session = Depends(get_db)):
    existing = db.query(CourseOffering).filter_by(course_id=course_id, semester_id=semester_id).first()
    if existing:
        raise HTTPException(409, "Offering already exists")
    db.add(CourseOffering(course_id=course_id, semester_id=semester_id))
    db.commit()
    return {"ok": True}


@router.delete("/{course_id}/semesters/{semester_id}", status_code=204)
def remove_offering(course_id: int, semester_id: int, db: Session = Depends(get_db)):
    row = db.query(CourseOffering).filter_by(course_id=course_id, semester_id=semester_id).first()
    if not row:
        raise HTTPException(404, "Not found")
    db.delete(row)
    db.commit()
