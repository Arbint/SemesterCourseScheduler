import json
import uuid
import statistics
import os
from agents.agent import Agent

_CONTEXT_FILE = os.path.join(os.path.dirname(__file__), "context", "context.md")

def _load_context() -> str:
    try:
        with open(_CONTEXT_FILE, "r", encoding="utf-8") as f:
            return f.read()
    except OSError:
        return ""


def _build_combined_tw_map(db, term_id: int) -> dict[int, str]:
    """Map course_id -> group_key for both catalog-wide TaughtWith groups
    (prefixed g_) and term-specific TaughtWith groups (prefixed t_)."""
    from models import TaughtWithMember, TermTaughtWithGroup
    tw_map: dict[int, str] = {}
    for m in db.query(TaughtWithMember).all():
        tw_map[m.course_id] = f"g_{m.group_id}"
    for g in db.query(TermTaughtWithGroup).filter_by(term_id=term_id).all():
        for m in g.members:
            tw_map[m.course_id] = f"t_{g.id}"
    return tw_map


class ScheduleAuditAgent(Agent):
    def __init__(self, db, term_id: int):
        domain_context = _load_context()
        super().__init__(
            name="ScheduleAuditAgent",
            description="Audit and auto-schedule a semester term",
            properties={
                "message": {"type": "string", "description": "User message"}
            },
            system=f"""{domain_context}

---

You are an expert academic schedule auditor and planner.
You help department chairs build and optimize semester schedules.

You can:
- Summarize the current schedule
- Audit for issues (long days, big gaps, unbalanced load, conflicts)
- Highlight specific courses the user should pay attention to
- Propose schedule changes for user approval (assign faculty, move courses, etc.)
- Auto-schedule an entire semester

Before assigning instructors, always call get_faculty() to retrieve the full faculty list with IDs and teaching capabilities.
Before proposing room or time-slot changes, call get_rooms() and get_time_slots() to retrieve their IDs.
When the user expresses a preference about which time slots to use (e.g. avoid mornings, prefer midday), call get_time_slots() first to get IDs, then pass the preferred slot IDs to auto_schedule() via preferred_time_slot_ids.
When a question is about the course catalog itself (capacity, duration, frequency, which semesters a course is offered in) rather than this term's schedule, call get_courses() — it covers every course, not just ones offered this term.
When a question is about TaughtWith or co-requisite rules in general (not this term's schedule), call get_taughtwith_groups() or get_coreq_groups().
When a question is about the full-time/part-time load limits themselves, call get_load_settings().

When auditing, always check for:
1. Long days: faculty teaching 3+ classes on same weekday
2. Big gaps: faculty with 3+ empty time slots between classes on same day
3. Unbalanced load: std deviation of faculty section counts > 1.5

ANTI-HALLUCINATION RULES — follow these without exception:
- NEVER state a specific course name, course number, room, time slot, faculty assignment, or section count unless it appears verbatim in a tool response from this conversation.
- NEVER infer, guess, or extrapolate facts about the schedule. If you do not have data from a tool call, say so and call the appropriate tool before continuing.
- When a user asks about a specific faculty member's courses or load, call get_faculty_load() or get_schedule_summary() first, then report only what the tool returned — nothing else.
- If you are unsure whether a fact is in the tool data or in your training knowledge, treat it as unknown and call the tool again.
- Do not combine data across multiple tool calls unless you are certain the IDs match exactly. Never "fill in" missing details from memory.

SCHEDULING RULES:
- To auto-schedule the entire semester (or any large batch), ALWAYS call auto_schedule() — never try to manually construct a proposal with propose_schedule_change() for this purpose.
- When the user asks to REDO, REPLACE, or RESCHEDULE an existing schedule, call auto_schedule(clear_existing=true) to wipe the existing tables first.
- When scheduling for the first time or filling in only the unscheduled courses, call auto_schedule() with no arguments.
- For targeted manual changes (moving one course, reassigning faculty, etc.), use propose_schedule_change().
- Always wait for user approval before applying any proposal. Never call apply_approved_proposal() without the user explicitly saying to apply or approve.
- Always highlight relevant courses using highlight_courses() when auditing.
""",
        )
        self.db = db
        self.term_id = term_id
        self.maxTokens = 8192
        self._proposals: dict[str, list[dict]] = {}

    def GetAgentTools(self):
        return [
            {
                "name": self.get_schedule_summary.__name__,
                "description": "Get the full schedule summary for the term",
                "input_schema": {"type": "object", "properties": {}}
            },
            {
                "name": self.get_faculty_load.__name__,
                "description": "Get each faculty member's section count and full load",
                "input_schema": {"type": "object", "properties": {}}
            },
            {
                "name": self.get_coreq_groups.__name__,
                "description": "Get all co-requisite groups with their course lists",
                "input_schema": {"type": "object", "properties": {}}
            },
            {
                "name": self.highlight_courses.__name__,
                "description": "Highlight specific courses in the frontend",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "course_ids": {
                            "type": "array",
                            "items": {"type": "integer"},
                            "description": "List of course IDs to highlight"
                        }
                    },
                    "required": ["course_ids"]
                }
            },
            {
                "name": self.propose_schedule_change.__name__,
                "description": "Propose a targeted set of manual schedule changes (e.g. move one course, reassign faculty). Do NOT use this for full auto-scheduling — call auto_schedule() instead.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "description": {"type": "string"},
                        "changes": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "action": {"type": "string"},
                                    "entry_id": {"type": "integer"},
                                    "course_id": {"type": "integer"},
                                    "table_id": {"type": "integer"},
                                    "room_id": {"type": "integer"},
                                    "time_slot_ids": {"type": "array", "items": {"type": "integer"}},
                                    "faculty_id": {"type": "integer"},
                                    "section": {"type": "integer"}
                                }
                            }
                        }
                    },
                    "required": ["description", "changes"]
                }
            },
            {
                "name": self.apply_approved_proposal.__name__,
                "description": "Apply a previously approved proposal to the database",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "proposal_id": {"type": "string"}
                    },
                    "required": ["proposal_id"]
                }
            },
            {
                "name": self.auto_schedule.__name__,
                "description": "Automatically schedule course sections by creating tables and assigning time slots, rooms, and faculty. Pass clear_existing=true when the user wants to redo or replace the existing schedule. Pass preferred_time_slot_ids to prioritize specific time slots (the scheduler will fill those first before using others).",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "clear_existing": {
                            "type": "boolean",
                            "description": "If true, wipe all existing tables and assignments for this term before scheduling from scratch."
                        },
                        "preferred_time_slot_ids": {
                            "type": "array",
                            "items": {"type": "integer"},
                            "description": "Time slot IDs to prioritize. The scheduler tries these slots first before falling back to others. Call get_time_slots() to look up IDs."
                        }
                    }
                }
            },
            {
                "name": self.get_faculty.__name__,
                "description": "Get all faculty members with their IDs, names, full load, and the courses they are qualified to teach. Use this before assigning instructors to look up faculty IDs and capabilities.",
                "input_schema": {"type": "object", "properties": {}}
            },
            {
                "name": self.get_faculty_courses.__name__,
                "description": "Get the exact list of courses currently assigned to a specific faculty member in this term. Call this whenever a user asks what a specific instructor is teaching — never infer from memory.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "faculty_id": {"type": "integer", "description": "The faculty member's ID"}
                    },
                    "required": ["faculty_id"]
                }
            },
            {
                "name": self.get_rooms.__name__,
                "description": "Get all available rooms with their IDs, labels, and capacities.",
                "input_schema": {"type": "object", "properties": {}}
            },
            {
                "name": self.get_time_slots.__name__,
                "description": "Get all available time slots with their IDs, labels, and display order.",
                "input_schema": {"type": "object", "properties": {}}
            },
            {
                "name": self.get_courses.__name__,
                "description": "Get the full course catalog (every course, regardless of whether it's offered this term), with IDs, department code, course number, name, duration, capacity, frequency, which semesters it's offered in, and its TaughtWith partner course IDs if any.",
                "input_schema": {"type": "object", "properties": {}}
            },
            {
                "name": self.get_taughtwith_groups.__name__,
                "description": "Get all catalog-wide TaughtWith groups (courses that are always taught together, e.g. cross-listed sections). Distinct from term-specific TaughtWith pairing, which shows up as taught_with_group values prefixed 't_' in other tool responses.",
                "input_schema": {"type": "object", "properties": {}}
            },
            {
                "name": self.get_load_settings.__name__,
                "description": "Get the configured full-time and part-time faculty load limits (sections per term) used to determine overloaded/underloaded faculty.",
                "input_schema": {"type": "object", "properties": {}}
            },
        ]

    def get_schedule_summary(self):
        from models import Term
        self.db.expire_all()
        term = self.db.query(Term).filter_by(id=self.term_id).first()
        if not term:
            return {"error": "Term not found"}

        tw_map = _build_combined_tw_map(self.db, self.term_id)

        result = {
            "term": f"{term.semester.name.value} {term.year}" + (f" {term.name}" if term.name else ""),
            "note": "All entries listed are offered in this semester. TaughtWith pairs share the same group_key and count as 1 load unit.",
            "tables": [],
            "unscheduled_entries": []
        }

        for table in term.schedule_tables:
            weekdays = [w.name.value for w in sorted(table.weekdays, key=lambda w: w.display_order)]
            entries_data = []
            for entry in table.entries:
                # Faculty meetings aren't managed by the agent (no auto-scheduling,
                # no proposals) — they're excluded here so the agent never tries
                # to reason about or move them. They're still enforced against
                # by the Room Conflict auditor regardless.
                if not entry.course_id:
                    continue
                entries_data.append({
                    "entry_id": entry.id,
                    "course": f"{entry.course.dept_code}{entry.course.course_number} {entry.course.course_name}",
                    "course_id": entry.course_id,
                    "section": entry.section,
                    "room": entry.room.display_label if entry.room else None,
                    "faculty": f"{entry.faculty.first_name} {entry.faculty.last_name}" if entry.faculty else None,
                    "faculty_id": entry.faculty_id,
                    "faculty_rank": entry.faculty.rank.value if entry.faculty else None,
                    "time_slots": [ts.label for ts in sorted(entry.time_slots, key=lambda ts: ts.display_order)],
                    "taught_with_group": tw_map.get(entry.course_id),
                })
            result["tables"].append({"weekdays": weekdays, "entries": entries_data})

        for entry in term.schedule_entries:
            if not entry.course_id:
                continue
            if not entry.schedule_table_id:
                result["unscheduled_entries"].append({
                    "entry_id": entry.id,
                    "course": f"{entry.course.dept_code}{entry.course.course_number} {entry.course.course_name}",
                    "course_id": entry.course_id,
                    "section": entry.section,
                    "taught_with_group": tw_map.get(entry.course_id),
                })

        return result

    def get_faculty_load(self):
        from models import Term, LoadSettings
        term = self.db.query(Term).filter_by(id=self.term_id).first()
        if not term:
            return {"error": "Term not found"}

        settings = self.db.query(LoadSettings).first()
        fulltime_load = settings.fulltime_load if settings else 3
        parttime_load = settings.parttime_load if settings else 2

        def _full_load(f) -> int:
            return fulltime_load if f.rank.value == "full_time" else parttime_load

        # Build TaughtWith map so pairs are counted as 1 load unit
        tw_map = _build_combined_tw_map(self.db, self.term_id)
        counted_tw: set[tuple] = set()  # (faculty_id, tw_group_key)

        raw_map: dict[int, int] = {}     # raw section count
        eff_map: dict[int, int] = {}     # effective load (TW pair = 1)
        faculty_map: dict[int, object] = {}
        courses_by_faculty: dict[int, list] = {}

        for entry in term.schedule_entries:
            if not entry.faculty_id:
                continue
            fid = entry.faculty_id
            faculty_map[fid] = entry.faculty
            raw_map[fid] = raw_map.get(fid, 0) + 1

            # TaughtWith deduplication for effective load
            gk = tw_map.get(entry.course_id)
            if gk is not None:
                key = (fid, gk)
                if key in counted_tw:
                    continue  # partner already counted
                counted_tw.add(key)
            eff_map[fid] = eff_map.get(fid, 0) + 1

            label = f"{entry.course.dept_code}{entry.course.course_number} {entry.course.course_name} §{entry.section}"
            if gk:
                label += f" [TaughtWith group {gk}]"
            courses_by_faculty.setdefault(fid, []).append(label)

        result = []
        for fid, eff_count in eff_map.items():
            f = faculty_map[fid]
            limit = _full_load(f)
            result.append({
                "faculty_id": fid,
                "name": f"{f.first_name} {f.last_name}",
                "rank": f.rank.value,
                "raw_section_count": raw_map.get(fid, 0),
                "effective_load": eff_count,
                "full_load": limit,
                "overloaded": eff_count > limit,
                "underloaded": f.rank.value == "full_time" and eff_count < limit,
                "courses": courses_by_faculty.get(fid, []),
            })
        return result

    def get_coreq_groups(self):
        from models import CoReqGroup
        groups = self.db.query(CoReqGroup).all()
        result = []
        for g in groups:
            result.append({
                "group_id": g.id,
                "courses": [
                    {
                        "course_id": m.course_id,
                        "course": f"{m.course.dept_code}{m.course.course_number} {m.course.course_name}"
                    }
                    for m in g.members
                ]
            })
        return result

    def get_faculty(self):
        from models import Faculty, Term, LoadSettings
        term = self.db.query(Term).filter_by(id=self.term_id).first()
        if not term:
            return {"error": "Term not found"}

        settings = self.db.query(LoadSettings).first()
        fulltime_load = settings.fulltime_load if settings else 3
        parttime_load = settings.parttime_load if settings else 2

        def _full_load(f) -> int:
            return fulltime_load if f.rank.value == "full_time" else parttime_load

        # Build current load map from this term's entries
        load_map: dict[int, int] = {}
        for entry in term.schedule_entries:
            if entry.faculty_id:
                load_map[entry.faculty_id] = load_map.get(entry.faculty_id, 0) + 1

        result = []
        for f in self.db.query(Faculty).order_by(Faculty.last_name).all():
            current_load = load_map.get(f.id, 0)
            limit = _full_load(f)
            result.append({
                "faculty_id": f.id,
                "name": f"{f.first_name} {f.last_name}",
                "rank": f.rank.value,
                "full_load": limit,
                "current_sections": current_load,
                "overloaded": current_load > limit,
                "underloaded": f.rank.value == "full_time" and current_load < limit,
                "can_teach": [
                    f"{cap.course.dept_code}{cap.course.course_number} {cap.course.course_name}"
                    for cap in f.teaching_capabilities
                ]
            })
        return result

    def get_faculty_courses(self, faculty_id: int):
        """Return the exact schedule entries assigned to one faculty member this term."""
        from models import Term
        term = self.db.query(Term).filter_by(id=self.term_id).first()
        if not term:
            return {"error": "Term not found"}

        tw_map = _build_combined_tw_map(self.db, self.term_id)
        entries = [e for e in term.schedule_entries if e.faculty_id == faculty_id]
        if not entries:
            return {"faculty_id": faculty_id, "courses": [], "note": "No courses assigned to this faculty member in this term."}

        faculty = entries[0].faculty
        result = []
        for e in entries:
            gk = tw_map.get(e.course_id)
            result.append({
                "entry_id": e.id,
                "course": f"{e.course.dept_code}{e.course.course_number} {e.course.course_name}",
                "section": e.section,
                "time_slots": [ts.label for ts in sorted(e.time_slots, key=lambda ts: ts.display_order)],
                "room": e.room.display_label if e.room else None,
                "taught_with_group": gk,
            })

        return {
            "faculty_id": faculty_id,
            "name": f"{faculty.first_name} {faculty.last_name}",
            "courses": result,
            "note": "This is the authoritative list. Only report what is listed here.",
        }

    def get_rooms(self):
        from models import Room
        return [
            {"room_id": r.id, "label": r.display_label, "capacity": r.capacity}
            for r in self.db.query(Room).order_by(Room.building_name, Room.room_number).all()
        ]

    def get_time_slots(self):
        from models import TimeSlot
        return [
            {"time_slot_id": ts.id, "label": ts.label, "display_order": ts.display_order}
            for ts in self.db.query(TimeSlot).order_by(TimeSlot.display_order).all()
        ]

    def get_courses(self):
        from models import Course
        courses = self.db.query(Course).order_by(Course.dept_code, Course.course_number).all()
        return [
            {
                "course_id": c.id,
                "course": f"{c.dept_code}{c.course_number} {c.course_name}",
                "dept_code": c.dept_code,
                "course_number": c.course_number,
                "duration_minutes": c.duration_minutes,
                "capacity": c.capacity,
                "frequency": c.frequency,
                "semester_ids": [o.semester_id for o in c.offerings],
                "taught_with_partner_ids": (
                    [m.course_id for m in c.taught_with_membership.group.members if m.course_id != c.id]
                    if c.taught_with_membership else []
                ),
            }
            for c in courses
        ]

    def get_taughtwith_groups(self):
        from models import TaughtWithGroup
        groups = self.db.query(TaughtWithGroup).all()
        return [
            {
                "group_id": g.id,
                "courses": [
                    {
                        "course_id": m.course_id,
                        "course": f"{m.course.dept_code}{m.course.course_number} {m.course.course_name}"
                    }
                    for m in g.members
                ]
            }
            for g in groups
        ]

    def get_load_settings(self):
        from models import LoadSettings
        settings = self.db.query(LoadSettings).first()
        return {
            "fulltime_load": settings.fulltime_load if settings else 3,
            "parttime_load": settings.parttime_load if settings else 2,
        }

    def highlight_courses(self, course_ids: list[int]):
        # This is intercepted by the chat route to extract highlighted IDs
        return {"highlighted_course_ids": course_ids}

    def propose_schedule_change(self, description: str, changes: list[dict]):
        proposal_id = str(uuid.uuid4())
        self._proposals[proposal_id] = changes
        return {
            "proposal_id": proposal_id,
            "description": description,
            "changes": changes
        }

    def apply_approved_proposal(self, proposal_id: str):
        from models import ScheduleEntry, ScheduleTable, TimeSlot, Weekday
        changes = self._proposals.get(proposal_id)
        if changes is None:
            return {"error": "Proposal not found"}

        for change in changes:
            action = change.get("action")
            if action == "assign_faculty":
                entry = self.db.query(ScheduleEntry).filter_by(id=change["entry_id"]).first()
                if entry:
                    entry.faculty_id = change.get("faculty_id")

            elif action == "move":
                entry = self.db.query(ScheduleEntry).filter_by(id=change["entry_id"]).first()
                if entry:
                    if "table_id" in change:
                        entry.schedule_table_id = change["table_id"]
                    if "room_id" in change:
                        entry.room_id = change["room_id"]
                    if "time_slot_ids" in change:
                        slots = self.db.query(TimeSlot).filter(TimeSlot.id.in_(change["time_slot_ids"])).all()
                        entry.time_slots = slots
                    if "faculty_id" in change:
                        entry.faculty_id = change.get("faculty_id")

            elif action == "create_table":
                # Create the table and assign entries to it in one atomic step.
                # auto_schedule uses this action so table creation is deferred until
                # apply time (never pre-created during the chat session).
                weekday_names = change.get("weekday_names", [])
                wdays = (
                    self.db.query(Weekday)
                    .filter(Weekday.name.in_(weekday_names))
                    .order_by(Weekday.display_order)
                    .all()
                )
                table = ScheduleTable(term_id=self.term_id)
                self.db.add(table)
                self.db.flush()
                table.weekdays = wdays

                for assign in change.get("entry_assignments", []):
                    entry = self.db.query(ScheduleEntry).filter_by(id=assign["entry_id"]).first()
                    if not entry:
                        continue
                    entry.schedule_table_id = table.id
                    if assign.get("room_id"):
                        entry.room_id = assign["room_id"]
                    if assign.get("faculty_id"):
                        entry.faculty_id = assign["faculty_id"]
                    if assign.get("time_slot_ids"):
                        slots = self.db.query(TimeSlot).filter(
                            TimeSlot.id.in_(assign["time_slot_ids"])
                        ).all()
                        entry.time_slots = slots

            elif action == "create_entry":
                entry = ScheduleEntry(
                    term_id=self.term_id,
                    schedule_table_id=change.get("table_id"),
                    course_id=change["course_id"],
                    section=change.get("section", 1),
                    room_id=change.get("room_id"),
                    faculty_id=change.get("faculty_id"),
                )
                self.db.add(entry)
                if change.get("time_slot_ids"):
                    self.db.flush()
                    slots = self.db.query(TimeSlot).filter(TimeSlot.id.in_(change["time_slot_ids"])).all()
                    entry.time_slots = slots

            elif action == "delete_entry":
                entry = self.db.query(ScheduleEntry).filter_by(id=change["entry_id"]).first()
                if entry:
                    self.db.delete(entry)

        self.db.commit()
        del self._proposals[proposal_id]
        return {"ok": True, "applied": len(changes)}

    def auto_schedule(self, clear_existing: bool = False, preferred_time_slot_ids: list = None):
        from models import (
            Term, TimeSlot, Room, ScheduleEntry, CourseOffering, ScheduleTable,
            FacultyTeaching, schedule_entry_timeslots, schedule_table_weekdays,
        )

        # Expire all cached ORM objects so we read the latest DB state.
        self.db.expire_all()

        term = self.db.query(Term).filter_by(id=self.term_id).first()
        if not term:
            return {"error": "Term not found"}

        if clear_existing:
            # Wipe all existing schedule data for this term so we start fresh.
            # Delete the association rows first (bulk SQL avoids ORM cascade loops).
            entry_ids = [
                e.id for e in self.db.query(ScheduleEntry).filter_by(term_id=self.term_id).all()
            ]
            if entry_ids:
                self.db.execute(
                    schedule_entry_timeslots.delete().where(
                        schedule_entry_timeslots.c.entry_id.in_(entry_ids)
                    )
                )
            table_ids = [
                t.id for t in self.db.query(ScheduleTable).filter_by(term_id=self.term_id).all()
            ]
            if table_ids:
                self.db.execute(
                    schedule_table_weekdays.delete().where(
                        schedule_table_weekdays.c.schedule_table_id.in_(table_ids)
                    )
                )
            self.db.query(ScheduleEntry).filter_by(term_id=self.term_id).delete(synchronize_session=False)
            self.db.query(ScheduleTable).filter_by(term_id=self.term_id).delete(synchronize_session=False)
            self.db.flush()

        # Ensure every offered course has at least one placeholder entry.
        # Entries must be committed — not just flushed — so that the approval
        # endpoint's fresh DB session can find them by ID.
        offered = self.db.query(CourseOffering).filter_by(semester_id=term.semester_id).all()
        entry_course_ids = {
            e.course_id for e in self.db.query(ScheduleEntry).filter_by(term_id=self.term_id).all()
        }
        restored = False
        for offering in offered:
            if offering.course_id not in entry_course_ids:
                self.db.add(ScheduleEntry(term_id=self.term_id, course_id=offering.course_id, section=1))
                restored = True
        if restored or clear_existing:
            self.db.commit()

        # Meetings are excluded — the agent doesn't auto-schedule them (the
        # chair places them manually); Room Conflict still enforces against
        # them regardless of what the agent proposes.
        unscheduled = self.db.query(ScheduleEntry).filter(
            ScheduleEntry.term_id == self.term_id,
            ScheduleEntry.schedule_table_id.is_(None),
            ScheduleEntry.course_id.isnot(None),
        ).all()

        if not unscheduled:
            total = self.db.query(ScheduleEntry).filter_by(term_id=self.term_id).count()
            if total == 0:
                return {"message": "No courses are offered in this term. Add courses to the catalog and mark them as offered first."}
            return {"message": "All course sections are already scheduled in tables. Nothing left to auto-schedule."}

        rooms = self.db.query(Room).order_by(Room.capacity.asc()).all()
        time_slots = self.db.query(TimeSlot).order_by(TimeSlot.display_order).all()

        # Build slot search order: preferred starts first, then others.
        # For multi-slot courses (165 min = 2 consecutive slots), the run must
        # fit within time_slots, so we filter out starts that would overflow.
        if preferred_time_slot_ids:
            preferred_set = set(preferred_time_slot_ids)
            preferred_starts = [si for si in range(len(time_slots)) if time_slots[si].id in preferred_set]
            other_starts = [si for si in range(len(time_slots)) if time_slots[si].id not in preferred_set]
            slot_search_order = preferred_starts + other_starts
        else:
            slot_search_order = list(range(len(time_slots)))

        # Load tier settings
        from models import LoadSettings
        _settings = self.db.query(LoadSettings).first()
        _fulltime_load = _settings.fulltime_load if _settings else 3
        _parttime_load = _settings.parttime_load if _settings else 2

        def _full_load(f) -> int:
            return _fulltime_load if f.rank.value == "full_time" else _parttime_load

        # Build faculty capability map: course_id -> list of Faculty
        fac_caps: dict[int, list] = {}
        for ft in self.db.query(FacultyTeaching).all():
            fac_caps.setdefault(ft.course_id, []).append(ft.faculty)

        # Seed faculty load from any already-scheduled entries that survive.
        fac_load: dict[int, int] = {}  # faculty_id -> section count
        for e in self.db.query(ScheduleEntry).filter(
            ScheduleEntry.term_id == self.term_id,
            ScheduleEntry.schedule_table_id.isnot(None),
            ScheduleEntry.faculty_id.isnot(None),
        ).all():
            fac_load[e.faculty_id] = fac_load.get(e.faculty_id, 0) + 1

        # Track which (weekday_pattern, slot_idx) pairs each faculty is assigned
        # to, so we avoid double-booking them across multiple tables.
        fac_slots: dict[int, set] = {}  # faculty_id -> set of (wk_key, slot_idx)

        # Group entries by frequency
        by_freq: dict[int, list] = {}
        for e in unscheduled:
            by_freq.setdefault(e.course.frequency, []).append(e)

        changes = []
        for freq, freq_entries in by_freq.items():
            if freq == 2:
                half = max(len(freq_entries) // 2, 1)
                batches = [
                    (["mon", "wed"], freq_entries[:half]),
                    (["tue", "thu"], freq_entries[half:]),
                ]
            else:
                all_days = ["mon", "tue", "wed", "thu", "fri"]
                batches = [(all_days[:freq], freq_entries)]

            for weekday_names, batch in batches:
                if not batch:
                    continue

                wk_key = tuple(sorted(weekday_names))
                occupied: set[tuple[int, int]] = set()  # (slot_idx, room_id)
                entry_assignments = []

                for entry in batch:
                    needed_slots = max(1, entry.course.duration_minutes // 75)
                    placed = False

                    for si in slot_search_order:
                        if si + needed_slots > len(time_slots):
                            continue
                        slot_range = list(range(si, si + needed_slots))
                        for room in rooms:
                            if room.capacity < entry.course.capacity:
                                continue
                            if all((si2, room.id) not in occupied for si2 in slot_range):
                                for si2 in slot_range:
                                    occupied.add((si2, room.id))

                                # Assign faculty: pick capable, under-load, conflict-free
                                faculty_id = None
                                capable = fac_caps.get(entry.course_id, [])
                                available = [
                                    f for f in capable
                                    if fac_load.get(f.id, 0) < _full_load(f)
                                    and all(
                                        (wk_key, si2) not in fac_slots.get(f.id, set())
                                        for si2 in slot_range
                                    )
                                ]
                                if available:
                                    best = min(available, key=lambda f: fac_load.get(f.id, 0))
                                    faculty_id = best.id
                                    fac_load[best.id] = fac_load.get(best.id, 0) + 1
                                    for si2 in slot_range:
                                        fac_slots.setdefault(best.id, set()).add((wk_key, si2))

                                assignment = {
                                    "entry_id": entry.id,
                                    "room_id": room.id,
                                    "time_slot_ids": [time_slots[si2].id for si2 in slot_range],
                                }
                                if faculty_id is not None:
                                    assignment["faculty_id"] = faculty_id
                                entry_assignments.append(assignment)
                                placed = True
                                break
                        if placed:
                            break

                    if not placed:
                        fallback_room = rooms[-1] if rooms else None
                        entry_assignments.append({
                            "entry_id": entry.id,
                            "room_id": fallback_room.id if fallback_room else None,
                            "time_slot_ids": [time_slots[0].id],
                        })

                changes.append({
                    "action": "create_table",
                    "weekday_names": weekday_names,
                    "entry_assignments": entry_assignments,
                })

        total_sections = sum(len(c["entry_assignments"]) for c in changes)
        assigned_faculty = sum(
            1 for c in changes for a in c["entry_assignments"] if a.get("faculty_id")
        )
        return self.propose_schedule_change(
            description=(
                f"Auto-schedule: create {len(changes)} table(s), assign {total_sections} "
                f"section(s) with faculty assigned to {assigned_faculty}/{total_sections}."
            ),
            changes=changes
        )
