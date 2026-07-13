from conflict.ConflictAudit import ConflictAuditor, ConflictReport


def _slots_overlap(slots_a: list, slots_b: list) -> bool:
    ids_a = {ts.id for ts in slots_a}
    ids_b = {ts.id for ts in slots_b}
    return bool(ids_a & ids_b)


def _build_combined_tw_map(db, term_id: int) -> dict[int, str]:
    """Return course_id -> group_key for both global ('g_N') and per-term ('t_N') TaughtWith groups."""
    from models import TaughtWithMember, TermTaughtWithGroup
    result: dict[int, str] = {}
    for m in db.query(TaughtWithMember).all():
        result[m.course_id] = f"g_{m.group_id}"
    for g in db.query(TermTaughtWithGroup).filter(TermTaughtWithGroup.term_id == term_id).all():
        for m in g.members:
            result[m.course_id] = f"t_{g.id}"
    return result


def _get_effective_weekdays(entry) -> set:
    """Returns per-entry active weekday IDs if set, else all table weekday IDs."""
    if entry.active_weekdays:
        return {w.id for w in entry.active_weekdays}
    return {w.id for w in entry.schedule_table.weekdays}


class FacultyTimeConflict(ConflictAuditor):
    def __init__(self, db):
        super().__init__(db, isCritical=True)

    def Audit(self, term) -> list[ConflictReport]:
        reports = []
        tw_map = _build_combined_tw_map(self.db, term.id)
        entries = [e for e in term.schedule_entries if e.faculty_id and e.time_slots and e.schedule_table_id and e.schedule_table]

        for i, a in enumerate(entries):
            for b in entries[i + 1:]:
                if a.faculty_id != b.faculty_id:
                    continue
                if not _slots_overlap(a.time_slots, b.time_slots):
                    continue
                weekdays_a = _get_effective_weekdays(a)
                weekdays_b = _get_effective_weekdays(b)
                if not (weekdays_a & weekdays_b):
                    continue
                # TaughtWith exception (global or per-term)
                gk_a = tw_map.get(a.course_id)
                gk_b = tw_map.get(b.course_id)
                if gk_a and gk_a == gk_b:
                    continue
                reports.append(ConflictReport(
                    courses=[a.course_id, b.course_id],
                    entries=[a.id, b.id],
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
                sections = [e for e in term.schedule_entries if e.course_id == cid and e.time_slots and e.schedule_table_id and e.schedule_table]
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
                            weekdays_a = _get_effective_weekdays(ea)
                            weekdays_b = _get_effective_weekdays(eb)
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
                entry_ids = [e.id for cid in course_ids for e in sections_by_course.get(cid, [])]
                reports.append(ConflictReport(
                    courses=course_ids,
                    entries=entry_ids,
                    description=f"Co-requisite conflict: all sections of co-requisite courses overlap in time"
                ))
        return reports


class RoomConflict(ConflictAuditor):
    def __init__(self, db):
        super().__init__(db, isCritical=True)

    def Audit(self, term) -> list[ConflictReport]:
        reports = []
        tw_map = _build_combined_tw_map(self.db, term.id)
        entries = [e for e in term.schedule_entries if e.room_id and e.time_slots and e.schedule_table_id and e.schedule_table]

        for i, a in enumerate(entries):
            for b in entries[i + 1:]:
                if a.id == b.id or a.room_id != b.room_id:
                    continue
                # Online rooms allow unlimited concurrent courses
                if a.room and a.room.is_online:
                    continue
                if not _slots_overlap(a.time_slots, b.time_slots):
                    continue
                weekdays_a = _get_effective_weekdays(a)
                weekdays_b = _get_effective_weekdays(b)
                if not (weekdays_a & weekdays_b):
                    continue
                # TaughtWith exception: same group shares the same room intentionally
                gk_a = tw_map.get(a.course_id)
                gk_b = tw_map.get(b.course_id)
                if gk_a and gk_a == gk_b:
                    continue
                reports.append(ConflictReport(
                    courses=[a.course_id, b.course_id],
                    entries=[a.id, b.id],
                    description=f"Room conflict: {a.room.label} is double-booked at overlapping times"
                ))
        return reports


class RoomCapacity(ConflictAuditor):
    def __init__(self, db):
        super().__init__(db, isCritical=True)

    def Audit(self, term) -> list[ConflictReport]:
        reports = []
        for entry in term.schedule_entries:
            if entry.room_id and not entry.room.is_online and entry.course.capacity > entry.room.capacity:
                reports.append(ConflictReport(
                    courses=[entry.course_id],
                    entries=[entry.id],
                    description=f"Room capacity: {entry.course.dept_code}{entry.course.course_number} (cap {entry.course.capacity}) exceeds {entry.room.label} capacity ({entry.room.capacity})"
                ))
        return reports


class FrequencyConflict(ConflictAuditor):
    """Critical: fires when a table has fewer days than the course requires."""
    def __init__(self, db):
        super().__init__(db, isCritical=True)

    def Audit(self, term) -> list[ConflictReport]:
        reports = []
        for entry in term.schedule_entries:
            if not entry.schedule_table_id or not entry.schedule_table:
                continue
            table_days = len(entry.schedule_table.weekdays)
            course_freq = entry.course.frequency
            if table_days < course_freq:
                reports.append(ConflictReport(
                    courses=[entry.course_id],
                    entries=[entry.id],
                    description=f"Frequency conflict: {entry.course.dept_code}{entry.course.course_number} requires {course_freq} day(s)/week but table only has {table_days} day(s)"
                ))
        return reports


class FrequencyToggleWarning(ConflictAuditor):
    """Warning: fires when a table has more days than needed and the day toggles aren't set correctly."""
    def __init__(self, db):
        super().__init__(db, isCritical=False)

    def Audit(self, term) -> list[ConflictReport]:
        reports = []
        for entry in term.schedule_entries:
            if not entry.schedule_table_id or not entry.schedule_table:
                continue
            table_days = len(entry.schedule_table.weekdays)
            course_freq = entry.course.frequency
            if table_days > course_freq:
                active = len(entry.active_weekdays)
                if active != course_freq:
                    reports.append(ConflictReport(
                        courses=[entry.course_id],
                        entries=[entry.id],
                        description=f"Day selection: {entry.course.dept_code}{entry.course.course_number} §{entry.section} needs exactly {course_freq} day(s) toggled on ({active} currently selected)"
                    ))
        return reports


class FacultyLoad(ConflictAuditor):
    def __init__(self, db):
        super().__init__(db, isCritical=False)

    def Audit(self, term) -> list[ConflictReport]:
        from models import Faculty, LoadSettings
        reports = []
        settings = self.db.query(LoadSettings).first()
        fulltime_load = settings.fulltime_load if settings else 3
        parttime_load = settings.parttime_load if settings else 2

        def _full_load(f) -> int:
            return fulltime_load if f.rank.value == "full_time" else parttime_load

        tw_map = _build_combined_tw_map(self.db, term.id)
        load_map: dict[int, int] = {}
        faculty_map: dict[int, object] = {}
        counted_tw: set[tuple] = set()  # (faculty_id, tw_group_key) already counted

        for entry in term.schedule_entries:
            if not entry.faculty_id:
                continue
            faculty_map.setdefault(entry.faculty_id, entry.faculty)
            gk = tw_map.get(entry.course_id)
            if gk is not None:
                key = (entry.faculty_id, gk)
                if key in counted_tw:
                    continue  # partner already counted; don't double-count
                counted_tw.add(key)
            load_map[entry.faculty_id] = load_map.get(entry.faculty_id, 0) + 1

        for fid, count in load_map.items():
            f = faculty_map[fid]
            limit = _full_load(f)
            if count > limit:
                overloaded = [e for e in term.schedule_entries if e.faculty_id == fid]
                reports.append(ConflictReport(
                    courses=[e.course_id for e in overloaded],
                    entries=[e.id for e in overloaded],
                    description=f"Faculty load: {f.first_name} {f.last_name} has {count} sections (full load is {limit})"
                ))
        return reports
