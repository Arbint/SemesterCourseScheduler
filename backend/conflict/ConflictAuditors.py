from conflict.ConflictAudit import ConflictAuditor, ConflictReport


def _slots_overlap(slots_a: list, slots_b: list) -> bool:
    ids_a = {ts.id for ts in slots_a}
    ids_b = {ts.id for ts in slots_b}
    return bool(ids_a & ids_b)


def _get_taught_with_group_id(entry) -> int | None:
    membership = entry.course.taught_with_membership
    if membership:
        return membership.group_id
    return None


class FacultyTimeConflict(ConflictAuditor):
    def __init__(self, db):
        super().__init__(db, isCritical=True)

    def Audit(self, term) -> list[ConflictReport]:
        reports = []
        entries = [e for e in term.schedule_entries if e.faculty_id and e.time_slots and e.schedule_table_id]

        for i, a in enumerate(entries):
            for b in entries[i + 1:]:
                if a.faculty_id != b.faculty_id:
                    continue
                if not _slots_overlap(a.time_slots, b.time_slots):
                    continue
                # Check if they share a weekday
                weekdays_a = {w.id for w in a.schedule_table.weekdays}
                weekdays_b = {w.id for w in b.schedule_table.weekdays}
                if not (weekdays_a & weekdays_b):
                    continue
                # TaughtWith exception
                gid_a = _get_taught_with_group_id(a)
                gid_b = _get_taught_with_group_id(b)
                if gid_a is not None and gid_a == gid_b:
                    continue
                reports.append(ConflictReport(
                    courses=[a.course_id, b.course_id],
                    description=f"Faculty conflict: same instructor assigned to overlapping courses ({a.course.dept_code}{a.course.course_number} and {b.course.dept_code}{b.course.course_number})"
                ))
        return reports


class CoReqTimeConflict(ConflictAuditor):
    def __init__(self, db):
        super().__init__(db, isCritical=True)

    def Audit(self, term) -> list[ConflictReport]:
        from models import CoReqGroup
        reports = []
        groups = self.db.query(CoReqGroup).all()

        for group in groups:
            course_ids = [m.course_id for m in group.members]
            if len(course_ids) < 2:
                continue

            # All sections for each course in the term
            sections_by_course = {}
            for cid in course_ids:
                sections = [e for e in term.schedule_entries if e.course_id == cid and e.time_slots and e.schedule_table_id]
                if sections:
                    sections_by_course[cid] = sections

            if len(sections_by_course) < 2:
                continue

            # Check if ALL sections of every course overlap with ALL sections of every other course
            # Conflict exists only if every section-pair across the two courses overlaps
            all_overlap = True
            for i, cid_a in enumerate(course_ids):
                for cid_b in course_ids[i + 1:]:
                    secs_a = sections_by_course.get(cid_a, [])
                    secs_b = sections_by_course.get(cid_b, [])
                    if not secs_a or not secs_b:
                        all_overlap = False
                        break
                    # There must exist at least one non-overlapping pair
                    has_non_overlap = False
                    for ea in secs_a:
                        for eb in secs_b:
                            weekdays_a = {w.id for w in ea.schedule_table.weekdays}
                            weekdays_b = {w.id for w in eb.schedule_table.weekdays}
                            if not (weekdays_a & weekdays_b):
                                has_non_overlap = True
                                break
                            if not _slots_overlap(ea.time_slots, eb.time_slots):
                                has_non_overlap = True
                                break
                        if has_non_overlap:
                            break
                    if not has_non_overlap:
                        all_overlap = True
                    else:
                        all_overlap = False
                if not all_overlap:
                    break

            if all_overlap:
                reports.append(ConflictReport(
                    courses=course_ids,
                    description=f"Co-requisite conflict: all sections of co-requisite courses overlap in time"
                ))
        return reports


class RoomConflict(ConflictAuditor):
    def __init__(self, db):
        super().__init__(db, isCritical=True)

    def Audit(self, term) -> list[ConflictReport]:
        reports = []
        entries = [e for e in term.schedule_entries if e.room_id and e.time_slots and e.schedule_table_id]

        for i, a in enumerate(entries):
            for b in entries[i + 1:]:
                if a.id == b.id or a.room_id != b.room_id:
                    continue
                if not _slots_overlap(a.time_slots, b.time_slots):
                    continue
                weekdays_a = {w.id for w in a.schedule_table.weekdays}
                weekdays_b = {w.id for w in b.schedule_table.weekdays}
                if not (weekdays_a & weekdays_b):
                    continue
                reports.append(ConflictReport(
                    courses=[a.course_id, b.course_id],
                    description=f"Room conflict: {a.room.label} is double-booked at overlapping times"
                ))
        return reports


class RoomCapacity(ConflictAuditor):
    def __init__(self, db):
        super().__init__(db, isCritical=True)

    def Audit(self, term) -> list[ConflictReport]:
        reports = []
        for entry in term.schedule_entries:
            if entry.room_id and entry.course.capacity > entry.room.capacity:
                reports.append(ConflictReport(
                    courses=[entry.course_id],
                    description=f"Room capacity: {entry.course.dept_code}{entry.course.course_number} (cap {entry.course.capacity}) exceeds {entry.room.label} capacity ({entry.room.capacity})"
                ))
        return reports


class FrequencyConflict(ConflictAuditor):
    def __init__(self, db):
        super().__init__(db, isCritical=True)

    def Audit(self, term) -> list[ConflictReport]:
        reports = []
        for entry in term.schedule_entries:
            if not entry.schedule_table_id:
                continue
            table_days = len(entry.schedule_table.weekdays)
            course_freq = entry.course.frequency
            if table_days != course_freq:
                reports.append(ConflictReport(
                    courses=[entry.course_id],
                    description=f"Frequency conflict: {entry.course.dept_code}{entry.course.course_number} requires {course_freq} day(s)/week but table has {table_days} day(s)"
                ))
        return reports


class FacultyLoad(ConflictAuditor):
    def __init__(self, db):
        super().__init__(db, isCritical=False)

    def Audit(self, term) -> list[ConflictReport]:
        from models import Faculty
        reports = []
        load_map: dict[int, int] = {}
        faculty_map: dict[int, object] = {}

        for entry in term.schedule_entries:
            if entry.faculty_id:
                load_map[entry.faculty_id] = load_map.get(entry.faculty_id, 0) + 1
                if entry.faculty_id not in faculty_map:
                    faculty_map[entry.faculty_id] = entry.faculty

        for fid, count in load_map.items():
            f = faculty_map[fid]
            if count > f.full_load:
                # Collect all course_ids for this faculty in the term
                course_ids = [e.course_id for e in term.schedule_entries if e.faculty_id == fid]
                reports.append(ConflictReport(
                    courses=course_ids,
                    description=f"Faculty load: {f.first_name} {f.last_name} has {count} sections (full load is {f.full_load})"
                ))
        return reports
