from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session
from database import get_db
from models import Faculty, FacultyTeaching, FacultyAttribute, Course, Term
from schemas import FacultyCreate, FacultyUpdate, FacultyOut, CourseOut
from faculty_schedule_pdf import generate_faculty_schedule_pdf
from door_tag_pdf import (
    DEFAULT_LAYOUT, DEFAULT_PAGE_SIZE, DEFAULT_ORIENTATION,
    DEFAULT_HEADER_PADDING_IN, DEFAULT_INFO_PADDING_IN, _safe_hex_color,
)

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


@router.get("/{faculty_id}/schedule-pdf")
def faculty_schedule_pdf(
    faculty_id: int, term_id: int,
    header_layout: str = DEFAULT_LAYOUT, info_layout: str = DEFAULT_LAYOUT,
    header_scale: float = 1.0, footer_scale: float = 1.0,
    page_size: str = DEFAULT_PAGE_SIZE, orientation: str = DEFAULT_ORIENTATION,
    custom_width_in: float | None = None, custom_height_in: float | None = None,
    header_padding_in: float = DEFAULT_HEADER_PADDING_IN, info_padding_in: float = DEFAULT_INFO_PADDING_IN,
    name_font_scale: float = 1.0, info_font_scale: float = 1.0, semester_font_scale: float = 1.0,
    icon_scale: float = 1.0,
    time_font_scale: float = 1.0, weekday_font_scale: float = 1.0,
    header_offset_x_in: float = 0.0, header_offset_y_in: float = 0.0,
    footer_offset_x_in: float = 0.0, footer_offset_y_in: float = 0.0,
    icon_offset_x_in: float = 0.0, icon_offset_y_in: float = 0.0,
    empty_bg_color: str = "#ffffff",
    entry_name_font_scale: float = 1.0, entry_name_font_color: str = "#000000",
    entry_instructor_font_scale: float = 1.0, entry_instructor_font_color: str = "#000000",
    entry_time_font_scale: float = 1.0, entry_time_font_color: str = "#333333",
    time_font_color: str = "#333333", weekday_font_color: str = "#222222",
    weekday_offset_y_in: float = 0.0,
    entry_name_padding_in: float = 0.0, entry_instructor_padding_in: float = 0.0, entry_time_padding_in: float = 0.0,
    inline: bool = False,
    db: Session = Depends(get_db),
):
    faculty = db.query(Faculty).filter(Faculty.id == faculty_id).first()
    if not faculty:
        raise HTTPException(404, "Faculty not found")
    term = db.query(Term).filter(Term.id == term_id).first()
    if not term:
        raise HTTPException(404, "Term not found")

    header_scale = max(0.25, min(3.0, header_scale))
    footer_scale = max(0.25, min(3.0, footer_scale))
    header_padding_in = max(0.0, min(2.0, header_padding_in))
    info_padding_in = max(0.0, min(2.0, info_padding_in))
    name_font_scale = max(0.25, min(3.0, name_font_scale))
    info_font_scale = max(0.25, min(3.0, info_font_scale))
    semester_font_scale = max(0.25, min(3.0, semester_font_scale))
    icon_scale = max(0.25, min(20.0, icon_scale))
    time_font_scale = max(0.25, min(3.0, time_font_scale))
    weekday_font_scale = max(0.25, min(3.0, weekday_font_scale))
    header_offset_x_in = max(-5.0, min(5.0, header_offset_x_in))
    header_offset_y_in = max(-5.0, min(5.0, header_offset_y_in))
    footer_offset_x_in = max(-5.0, min(5.0, footer_offset_x_in))
    footer_offset_y_in = max(-5.0, min(5.0, footer_offset_y_in))
    icon_offset_x_in = max(-5.0, min(5.0, icon_offset_x_in))
    icon_offset_y_in = max(-5.0, min(5.0, icon_offset_y_in))
    entry_name_font_scale = max(0.25, min(3.0, entry_name_font_scale))
    entry_instructor_font_scale = max(0.25, min(3.0, entry_instructor_font_scale))
    entry_time_font_scale = max(0.25, min(3.0, entry_time_font_scale))
    weekday_offset_y_in = max(-2.0, min(2.0, weekday_offset_y_in))
    entry_name_padding_in = max(0.0, min(0.5, entry_name_padding_in))
    entry_instructor_padding_in = max(0.0, min(0.5, entry_instructor_padding_in))
    entry_time_padding_in = max(0.0, min(0.5, entry_time_padding_in))
    empty_bg_color = _safe_hex_color(empty_bg_color, "#ffffff")
    entry_name_font_color = _safe_hex_color(entry_name_font_color, "#000000")
    entry_instructor_font_color = _safe_hex_color(entry_instructor_font_color, "#000000")
    entry_time_font_color = _safe_hex_color(entry_time_font_color, "#333333")
    time_font_color = _safe_hex_color(time_font_color, "#333333")
    weekday_font_color = _safe_hex_color(weekday_font_color, "#222222")
    content = generate_faculty_schedule_pdf(
        db, term, faculty, header_layout, info_layout, header_scale, footer_scale,
        page_size, orientation, custom_width_in, custom_height_in, header_padding_in, info_padding_in,
        name_font_scale, info_font_scale, semester_font_scale, icon_scale,
        time_font_scale, weekday_font_scale, header_offset_x_in, header_offset_y_in,
        footer_offset_x_in, footer_offset_y_in, icon_offset_x_in, icon_offset_y_in,
        empty_bg_color,
        entry_name_font_scale, entry_name_font_color,
        entry_instructor_font_scale, entry_instructor_font_color,
        entry_time_font_scale, entry_time_font_color,
        time_font_color, weekday_font_color, weekday_offset_y_in,
        entry_name_padding_in, entry_instructor_padding_in, entry_time_padding_in,
    )
    filename = f"faculty_schedule_{faculty.last_name}_{faculty.first_name}_{term.year}.pdf".replace(" ", "_")
    disposition = "inline" if inline else "attachment"
    return Response(
        content=content,
        media_type="application/pdf",
        headers={"Content-Disposition": f"{disposition}; filename={filename}"},
    )
