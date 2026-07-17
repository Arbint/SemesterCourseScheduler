from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import Faculty, FacultyTeaching, FacultyAttribute, Course
from schemas import FacultyCreate, FacultyUpdate, FacultyOut, CourseOut

router = APIRouter(prefix="/api/faculty", tags=["faculty"])


@router.get("", response_model=list[FacultyOut])
def list_faculty(db: Session = Depends(get_db)):
    return [FacultyOut.from_orm(f) for f in db.query(Faculty).all()]


@router.post("", response_model=FacultyOut, status_code=201)
def create_faculty(data: FacultyCreate, db: Session = Depends(get_db)):
    faculty = Faculty(**data.model_dump())
    db.add(faculty)
    db.commit()
    db.refresh(faculty)
    return FacultyOut.from_orm(faculty)


@router.get("/{faculty_id}", response_model=FacultyOut)
def get_faculty(faculty_id: int, db: Session = Depends(get_db)):
    f = db.query(Faculty).filter(Faculty.id == faculty_id).first()
    if not f:
        raise HTTPException(404, "Faculty not found")
    return FacultyOut.from_orm(f)


@router.put("/{faculty_id}", response_model=FacultyOut)
def update_faculty(faculty_id: int, data: FacultyUpdate, db: Session = Depends(get_db)):
    f = db.query(Faculty).filter(Faculty.id == faculty_id).first()
    if not f:
        raise HTTPException(404, "Faculty not found")
    for k, v in data.model_dump().items():
        setattr(f, k, v)
    db.commit()
    db.refresh(f)
    return FacultyOut.from_orm(f)


@router.delete("/{faculty_id}", status_code=204)
def delete_faculty(faculty_id: int, db: Session = Depends(get_db)):
    f = db.query(Faculty).filter(Faculty.id == faculty_id).first()
    if not f:
        raise HTTPException(404, "Faculty not found")
    db.delete(f)
    db.commit()


@router.get("/{faculty_id}/courses", response_model=list[CourseOut])
def get_faculty_courses(faculty_id: int, db: Session = Depends(get_db)):
    f = db.query(Faculty).filter(Faculty.id == faculty_id).first()
    if not f:
        raise HTTPException(404, "Faculty not found")
    courses = [tc.course for tc in f.teaching_capabilities]
    return [CourseOut.from_orm_with_semesters(c) for c in courses]


@router.post("/{faculty_id}/courses/{course_id}", status_code=201)
def add_teaching_capability(faculty_id: int, course_id: int, db: Session = Depends(get_db)):
    existing = db.query(FacultyTeaching).filter_by(faculty_id=faculty_id, course_id=course_id).first()
    if existing:
        raise HTTPException(409, "Already exists")
    db.add(FacultyTeaching(faculty_id=faculty_id, course_id=course_id))
    db.commit()
    return {"ok": True}


@router.delete("/{faculty_id}/courses/{course_id}", status_code=204)
def remove_teaching_capability(faculty_id: int, course_id: int, db: Session = Depends(get_db)):
    row = db.query(FacultyTeaching).filter_by(faculty_id=faculty_id, course_id=course_id).first()
    if not row:
        raise HTTPException(404, "Not found")
    db.delete(row)
    db.commit()


@router.post("/{faculty_id}/attributes/{attribute_id}", status_code=201)
def add_faculty_attribute(faculty_id: int, attribute_id: int, db: Session = Depends(get_db)):
    f = db.query(Faculty).filter(Faculty.id == faculty_id).first()
    if not f:
        raise HTTPException(404, "Faculty not found")
    attribute = db.query(FacultyAttribute).filter(FacultyAttribute.id == attribute_id).first()
    if not attribute:
        raise HTTPException(404, "Attribute not found")
    if attribute not in f.attributes:
        f.attributes.append(attribute)
        db.commit()
    return {"ok": True}


@router.delete("/{faculty_id}/attributes/{attribute_id}", status_code=204)
def remove_faculty_attribute(faculty_id: int, attribute_id: int, db: Session = Depends(get_db)):
    f = db.query(Faculty).filter(Faculty.id == faculty_id).first()
    if not f:
        raise HTTPException(404, "Faculty not found")
    attribute = db.query(FacultyAttribute).filter(FacultyAttribute.id == attribute_id).first()
    if attribute and attribute in f.attributes:
        f.attributes.remove(attribute)
        db.commit()
