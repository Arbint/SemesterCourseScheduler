import json
import uuid
import statistics
from agents.agent import Agent


class ScheduleAuditAgent(Agent):
    def __init__(self, db, term_id: int):
        super().__init__(
            name="ScheduleAuditAgent",
            description="Audit and auto-schedule a semester term",
            properties={
                "message": {"type": "string", "description": "User message"}
            },
            system="""You are an expert academic schedule auditor and planner.
You help department chairs build and optimize semester schedules.

You can:
- Summarize the current schedule
- Audit for issues (long days, big gaps, unbalanced load, conflicts)
- Highlight specific courses the user should pay attention to
- Propose schedule changes for user approval
- Auto-schedule an entire semester

When auditing, always check for:
1. Long days: faculty teaching 3+ classes on same weekday
2. Big gaps: faculty with 3+ empty time slots between classes on same day
3. Unbalanced load: std deviation of faculty section counts > 1.5

When proposing changes, always use propose_schedule_change() and wait for user approval before applying.
Always highlight relevant courses using highlight_courses().
""",
        )
        self.db = db
        self.term_id = term_id
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
                "description": "Propose a set of schedule changes for user approval",
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
                "description": "Automatically schedule all unscheduled entries in the term",
                "input_schema": {"type": "object", "properties": {}}
            },
        ]

    def get_schedule_summary(self):
        from models import Term, TimeSlot, Room
        self.db.expire_all()
        term = self.db.query(Term).filter_by(id=self.term_id).first()
        if not term:
            return {"error": "Term not found"}

        result = {
            "term": f"{term.semester.name.value} {term.year}",
            "tables": [],
            "unscheduled_entries": []
        }

        for table in term.schedule_tables:
            weekdays = [w.name.value for w in sorted(table.weekdays, key=lambda w: w.display_order)]
            entries_data = []
            for entry in table.entries:
                entries_data.append({
                    "entry_id": entry.id,
                    "course": f"{entry.course.dept_code}{entry.course.course_number} {entry.course.course_name}",
                    "course_id": entry.course_id,
                    "section": entry.section,
                    "room": entry.room.label if entry.room else None,
                    "faculty": f"{entry.faculty.first_name} {entry.faculty.last_name}" if entry.faculty else None,
                    "faculty_id": entry.faculty_id,
                    "time_slots": [ts.label for ts in sorted(entry.time_slots, key=lambda ts: ts.display_order)]
                })
            result["tables"].append({"weekdays": weekdays, "entries": entries_data})

        for entry in term.schedule_entries:
            if not entry.schedule_table_id:
                result["unscheduled_entries"].append({
                    "entry_id": entry.id,
                    "course": f"{entry.course.dept_code}{entry.course.course_number} {entry.course.course_name}",
                    "course_id": entry.course_id,
                    "section": entry.section
                })

        return result

    def get_faculty_load(self):
        from models import Term, Faculty
        term = self.db.query(Term).filter_by(id=self.term_id).first()
        if not term:
            return {"error": "Term not found"}

        load_map: dict[int, int] = {}
        faculty_map: dict[int, object] = {}

        for entry in term.schedule_entries:
            if entry.faculty_id:
                load_map[entry.faculty_id] = load_map.get(entry.faculty_id, 0) + 1
                faculty_map[entry.faculty_id] = entry.faculty

        result = []
        for fid, count in load_map.items():
            f = faculty_map[fid]
            result.append({
                "faculty_id": fid,
                "name": f"{f.first_name} {f.last_name}",
                "sections": count,
                "full_load": f.full_load,
                "overloaded": count > f.full_load,
                "underloaded": count < f.full_load,
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

    def auto_schedule(self):
        from models import Term, TimeSlot, Room, ScheduleEntry, CourseOffering
        term = self.db.query(Term).filter_by(id=self.term_id).first()
        if not term:
            return {"error": "Term not found"}

        # Expire cached relationships so we read the latest DB state.
        self.db.expire(term)

        # Restore placeholder entries for courses offered in this semester that
        # have no entry at all (can happen if all sections were deleted manually).
        offered = self.db.query(CourseOffering).filter_by(semester_id=term.semester_id).all()
        entry_course_ids = {e.course_id for e in self.db.query(ScheduleEntry).filter_by(term_id=self.term_id).all()}
        for offering in offered:
            if offering.course_id not in entry_course_ids:
                self.db.add(ScheduleEntry(term_id=self.term_id, course_id=offering.course_id, section=1))
        self.db.flush()

        unscheduled = self.db.query(ScheduleEntry).filter(
            ScheduleEntry.term_id == self.term_id,
            ScheduleEntry.schedule_table_id.is_(None),
        ).all()

        if not unscheduled:
            # Double-check: count scheduled sections to give an accurate message
            total = self.db.query(ScheduleEntry).filter_by(term_id=self.term_id).count()
            if total == 0:
                return {"message": "No courses are offered in this term. Add courses to the catalog and mark them as offered first."}
            return {"message": "All course sections are already scheduled in tables. Nothing left to auto-schedule."}

        rooms = self.db.query(Room).order_by(Room.capacity.desc()).all()
        time_slots = self.db.query(TimeSlot).order_by(TimeSlot.display_order).all()

        # Group entries by frequency
        by_freq: dict[int, list] = {}
        for e in unscheduled:
            by_freq.setdefault(e.course.frequency, []).append(e)

        # Build create_table actions — NO DB objects are created here.
        # Tables are created atomically inside apply_approved_proposal so that
        # nothing is written to the DB until the user actually approves.
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
                entry_assignments = []
                slot_idx = 0
                for entry in batch:
                    needed_slots = max(1, entry.course.duration_minutes // 75)
                    if slot_idx + needed_slots > len(time_slots):
                        slot_idx = 0
                    slots = time_slots[slot_idx:slot_idx + needed_slots]
                    slot_idx += needed_slots
                    room = next(
                        (r for r in rooms if r.capacity >= entry.course.capacity),
                        rooms[0] if rooms else None
                    )
                    entry_assignments.append({
                        "entry_id": entry.id,
                        "room_id": room.id if room else None,
                        "time_slot_ids": [s.id for s in slots],
                    })
                changes.append({
                    "action": "create_table",
                    "weekday_names": weekday_names,
                    "entry_assignments": entry_assignments,
                })

        total_sections = sum(len(c["entry_assignments"]) for c in changes)
        return self.propose_schedule_change(
            description=f"Auto-schedule: create {len(changes)} schedule table(s) and assign {total_sections} course section(s)",
            changes=changes
        )

    def Run(self):
        result = super().Run()
        return result

    def ProcessNewUserInput(self, userInput: str):
        self.messages.append({"role": "user", "content": userInput})
        return self.Run()
