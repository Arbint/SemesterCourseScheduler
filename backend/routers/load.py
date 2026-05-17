from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db

router = APIRouter(tags=["load"])


def _credit_hours(course_number: int) -> int:
    """Extract credit hours from 4-digit course number (2nd digit = credits)."""
    return (course_number // 100) % 10


@router.get("/api/terms/{term_id}/load")
def get_term_load(term_id: int, db: Session = Depends(get_db)):
    from models import Term, TaughtWithGroup

    term = db.query(Term).filter(Term.id == term_id).first()
    if not term:
        raise HTTPException(404, "Term not found")

    # Only scheduled entries with a faculty assigned
    entries = [
        e for e in term.schedule_entries
        if e.schedule_table_id and e.faculty_id
    ]

    # Build TaughtWith lookups
    tw_groups = db.query(TaughtWithGroup).all()
    course_to_tw_group: dict[int, int] = {}  # course_id -> group_id
    tw_group_course_ids: dict[int, list[int]] = {}  # group_id -> [course_id, ...]
    for g in tw_groups:
        ids = [m.course_id for m in g.members]
        tw_group_course_ids[g.id] = ids
        for cid in ids:
            course_to_tw_group[cid] = g.id

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
            gid = course_to_tw_group.get(e.course_id)
            key = f"tw_{gid}" if gid else f"c_{e.course_id}"
            units.setdefault(key, []).append(e)

        courses_data = []
        total_sections = 0
        total_credit_hours = 0

        for key, uentries in units.items():
            if key.startswith("tw_"):
                gid = int(key[3:])
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
            "rank": faculty.rank.value,
            "full_load": faculty.full_load,
            "courses": courses_data,
            "total_sections": total_sections,
            "total_credit_hours": total_credit_hours,
        })

    result.sort(key=lambda x: x["name"])
    return result
