from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db

router = APIRouter(tags=["load"])


def _credit_hours(course_number: int) -> int:
    """Extract credit hours from 4-digit course number (2nd digit = credits)."""
    return (course_number // 100) % 10


@router.get("/api/terms/{term_id}/load")
def get_term_load(term_id: int, db: Session = Depends(get_db)):
    from models import Term, TaughtWithGroup, TermTaughtWithGroup, LoadSettings

    term = db.query(Term).filter(Term.id == term_id).first()
    if not term:
        raise HTTPException(404, "Term not found")

    # Load tier settings
    settings = db.query(LoadSettings).first()
    fulltime_load = settings.fulltime_load if settings else 3
    parttime_load = settings.parttime_load if settings else 2

    def _full_load(faculty) -> int:
        return fulltime_load if faculty.full_time_or_part_time.value == "full_time" else parttime_load

    # Only scheduled entries with a faculty assigned
    entries = [
        e for e in term.schedule_entries
        if e.schedule_table_id and e.faculty_id
    ]

    # Build combined TaughtWith lookups (global "g_N" + per-term "t_N")
    course_to_tw_key: dict[int, str] = {}
    tw_key_courses: dict[str, list] = {}
    for g in db.query(TaughtWithGroup).all():
        key = f"g_{g.id}"
        courses_in_group = [m.course for m in g.members]
        tw_key_courses[key] = courses_in_group
        for m in g.members:
            course_to_tw_key[m.course_id] = key
    for g in db.query(TermTaughtWithGroup).filter(TermTaughtWithGroup.term_id == term_id).all():
        key = f"t_{g.id}"
        courses_in_group = [m.course for m in g.members]
        tw_key_courses[key] = courses_in_group
        for m in g.members:
            course_to_tw_key[m.course_id] = key

    # Group entries by faculty
    by_faculty: dict[int, list] = {}
    for e in entries:
        by_faculty.setdefault(e.faculty_id, []).append(e)

    result = []
    for fid, fentries in by_faculty.items():
        faculty = fentries[0].faculty

        # Group entries by "teaching unit": TaughtWith group or standalone course
        units: dict[str, list] = {}
        for e in fentries:
            gk = course_to_tw_key.get(e.course_id)
            key = gk if gk else f"c_{e.course_id}"
            units.setdefault(key, []).append(e)

        courses_data = []
        total_sections = 0
        total_credit_hours = 0

        for key, uentries in units.items():
            if key.startswith("g_") or key.startswith("t_"):
                # Collect distinct courses in the group that appear in this faculty's entries
                seen_courses: dict[int, object] = {}
                for e in uentries:
                    seen_courses.setdefault(e.course_id, e.course)
                sorted_courses = sorted(seen_courses.values(), key=lambda c: c.course_number)
                display = " / ".join(f"{c.dept_code} {c.course_number} {c.course_name}" for c in sorted_courses)
                credit_hrs = sum(_credit_hours(c.course_number) for c in sorted_courses)
                # Section count: entries for any one representative course
                rep_cid = next(iter(seen_courses))
                section_count = sum(1 for e in uentries if e.course_id == rep_cid)
            else:
                course = uentries[0].course
                display = f"{course.dept_code} {course.course_number} {course.course_name}"
                credit_hrs = _credit_hours(course.course_number)
                section_count = len(uentries)

            total_ch = credit_hrs * section_count
            total_sections += section_count
            total_credit_hours += total_ch

            courses_data.append({
                "display": display,
                "sections": section_count,
                "credit_hours": credit_hrs,
                "total_credit_hours": total_ch,
            })

        # Sort courses alphabetically by display
        courses_data.sort(key=lambda x: x["display"])

        result.append({
            "faculty_id": fid,
            "name": f"{faculty.last_name}, {faculty.first_name}",
            "full_time_or_part_time": faculty.full_time_or_part_time.value,
            "full_load": _full_load(faculty),
            "courses": courses_data,
            "total_sections": total_sections,
            "total_credit_hours": total_credit_hours,
        })

    result.sort(key=lambda x: x["name"])
    return result
