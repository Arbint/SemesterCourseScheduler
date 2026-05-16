# Build Plan — SemesterCourseScheduler

## Overview

Eight phases, backend-first. Each phase ends with a clear testable state before moving on. The design spec is the authority; this plan is the execution sequence.

```
Phase 1 — Project Scaffolding
Phase 2 — Database Models
Phase 3 — Core REST API
Phase 4 — Conflict Detection
Phase 5 — Excel Export
Phase 6 — AI Agent (ScheduleAuditAgent)
Phase 7 — Frontend Foundation + Management Tabs
Phase 8 — Term Schedules Tab (Drag-and-Drop)
```

---

## Phase 1 — Project Scaffolding

### Goal
Runnable skeleton: FastAPI says hello, React renders a blank page, SQLite file is created.

### Steps

**1.1 Directory layout**
```
backend/
  main.py              # FastAPI app entry point
  database.py          # SQLAlchemy engine + session
  models.py            # All ORM models
  schemas.py           # Pydantic request/response schemas
  routers/             # One file per resource group
  conflict/
    ConflictAudit.py
    ConflictAuditors.py
  agents/              # Symlink or copy of src/agents/
  export.py            # Excel export logic
  requirements.txt
frontend/
  (Vite + React + TS scaffold)
```

**1.2 Backend**
- `requirements.txt`: `fastapi uvicorn sqlalchemy alembic openpyxl anthropic python-multipart`
- `database.py`: create SQLite engine at `./scheduler.db`, `SessionLocal`, `Base`
- `main.py`: create FastAPI app, include CORS middleware (allow `localhost:5173`), mount routers, call `Base.metadata.create_all()` on startup
- Health check route: `GET /health → {"status": "ok"}`

**1.3 Frontend**
- Scaffold with Vite: `npm create vite@latest frontend -- --template react-ts`
- Install: `npm install axios dnd-kit` (specifically `@dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities`)
- Proxy `/api` to `http://localhost:8000` in `vite.config.ts` so fetch calls don't need the port

**1.4 Theme CSS**
- Create `frontend/src/theme.css` with One Dark Pro palette variables:
  - Background: `#282c34`, surface: `#21252b`, border: `#3e4451`
  - Text: `#abb2bf`, accent: `#61afef`, warning: `#e5c07b`, error: `#e06c75`, success: `#98c379`
- Import in `main.tsx`

### Tests
- `uvicorn backend.main:app --reload` starts without error
- `curl localhost:8000/health` returns `{"status":"ok"}`
- `npm run dev` in `frontend/` loads a blank page at `localhost:5173` with dark background
- `scheduler.db` is created on first backend startup

---

## Phase 2 — Database Models

### Goal
All tables defined in SQLAlchemy, database auto-created with correct schema.

### Steps

**2.1 Models in `backend/models.py`**

Define all models with correct relationships:

```
Faculty           id, first_name, last_name, rank (enum: full_time/part_time),
                  tags (JSON list), full_load (int)

Semester          id, name (enum: fall/spring/summer)

Weekday           id, name (enum: mon/tue/wed/thu/fri), display_order

TimeSlot          id, label (e.g. "7:30 AM - 8:45 AM"), start_time, end_time,
                  display_order

Room              id, label, capacity

Course            id, dept_code, course_number (int), course_name,
                  duration_minutes (int), capacity (int), frequency (int)

CourseOffering    course_id FK, semester_id FK  [composite PK]

FacultyTeaching   faculty_id FK, course_id FK   [composite PK]

TaughtWithGroup   id (PK)
TaughtWithMember  group_id FK, course_id FK (unique on course_id)  [composite PK]

CoReqGroup        id (PK)
CoReqMember       group_id FK, course_id FK     [composite PK]

Term              id, semester_id FK, year (int)
                  [unique constraint on (semester_id, year)]

ScheduleTable     id, term_id FK
                  weekdays: many-to-many with Weekday via schedule_table_weekdays

ScheduleEntry     id, schedule_table_id FK, course_id FK, section (int),
                  room_id FK (nullable), faculty_id FK (nullable)
                  time_slots: many-to-many with TimeSlot via schedule_entry_timeslots
```

**2.2 Alembic**
- `alembic init backend/alembic`
- Set `sqlalchemy.url` in `alembic.ini`
- Generate initial migration: `alembic revision --autogenerate -m "initial"`
- Apply: `alembic upgrade head`

**2.3 Seed data**
- Create `backend/seed.py` with sample data: 3 faculty, 5 courses, 3 rooms, standard time slots (7:30–8:45, 9:00–10:15, 10:30–11:45, 12:00–1:15, 1:30–2:45, 3:00–4:15, 4:30–5:45), all 3 semesters, all 5 weekdays

### Tests
- Delete `scheduler.db`, restart backend — schema is recreated cleanly
- `python backend/seed.py` — runs without error, DB contains expected row counts
- SQLite browser (or `sqlite3 scheduler.db .tables`) shows all expected tables
- Alembic `alembic current` shows `head`

---

## Phase 3 — Core REST API

### Goal
Full CRUD for every entity, accessible via HTTP. Frontend can read and write everything.

### Steps

One router file per resource group. All routes prefixed under `/api/`.

**3.1 `routers/faculty.py`**
```
GET    /api/faculty            → list all
POST   /api/faculty            → create
GET    /api/faculty/{id}       → get one
PUT    /api/faculty/{id}       → update
DELETE /api/faculty/{id}       → delete

GET    /api/faculty/{id}/courses           → courses they can teach
POST   /api/faculty/{id}/courses/{course_id}  → add teaching capability
DELETE /api/faculty/{id}/courses/{course_id}  → remove teaching capability
```

**3.2 `routers/courses.py`**
```
GET    /api/courses            → list all, optional ?semester= filter
POST   /api/courses            → create
GET    /api/courses/{id}       → get one
PUT    /api/courses/{id}       → update
DELETE /api/courses/{id}       → delete

POST   /api/courses/{id}/semesters/{semester_id}   → add offering
DELETE /api/courses/{id}/semesters/{semester_id}   → remove offering
```

**3.3 `routers/rooms.py`**
```
GET/POST /api/rooms
GET/PUT/DELETE /api/rooms/{id}
```

**3.4 `routers/timeslots.py`**
```
GET/POST /api/timeslots
GET/PUT/DELETE /api/timeslots/{id}
```

**3.5 `routers/constraints.py`**
```
GET/POST   /api/taughtwith                        → list/create groups
DELETE     /api/taughtwith/{group_id}             → delete group
POST       /api/taughtwith/{group_id}/courses/{course_id}
DELETE     /api/taughtwith/{group_id}/courses/{course_id}

GET/POST   /api/coreq                             → list/create groups
DELETE     /api/coreq/{group_id}
POST       /api/coreq/{group_id}/courses/{course_id}
DELETE     /api/coreq/{group_id}/courses/{course_id}
```

**3.6 `routers/terms.py`**
```
GET    /api/terms              → list all (include semester + year)
POST   /api/terms              → create term; auto-create one ScheduleEntry per
                                  course offered in that semester
GET    /api/terms/{id}         → get with schedule tables and entries
DELETE /api/terms/{id}
```

**3.7 `routers/schedule_tables.py`**
```
GET    /api/terms/{term_id}/tables          → list tables for a term
POST   /api/terms/{term_id}/tables          → create table with weekday list
PUT    /api/tables/{id}                     → update weekdays
DELETE /api/tables/{id}
```

**3.8 `routers/schedule_entries.py`**
This is the most critical router — all mutations run conflict checking.

```
GET    /api/terms/{term_id}/entries         → all entries for a term (flat list)
GET    /api/tables/{table_id}/entries       → entries for one table

POST   /api/tables/{table_id}/entries       → place a course section
                                              body: {course_id, room_id, time_slot_ids, faculty_id?}
                                              auto-assigns next section number
                                              runs ALL ConflictAuditors
                                              → 409 if any critical conflict
                                              → 201 + {entry, warnings: [...]} on success

PUT    /api/entries/{id}                    → move (update room/time_slots/table)
                                              runs ALL ConflictAuditors
                                              → 409 if critical, 200 + warnings on success

PATCH  /api/entries/{id}/faculty            → assign instructor only (no conflict re-check needed)

DELETE /api/entries/{id}                    → remove section
```

**3.9 `routers/sections.py`** — section count management
```
GET    /api/terms/{term_id}/sections        → list all entries grouped by course
PATCH  /api/terms/{term_id}/courses/{course_id}/section-count
       body: {count: int}
       Adds or removes ScheduleEntry rows (removing last section first).
       Removing a scheduled section also removes it from the schedule table.
```

**3.10 `routers/export.py`** — placeholder, implemented in Phase 5
```
GET    /api/terms/{term_id}/export          → returns .xlsx file
```

**3.11 Pydantic schemas**
- Define request/response schemas in `schemas.py` for every model
- Use `model_config = ConfigDict(from_attributes=True)` for ORM mode

### Tests
- Use the FastAPI auto-generated docs at `localhost:8000/docs` to exercise every endpoint manually
- Create a faculty member, verify it appears in GET list
- Create a course with offerings, filter `GET /api/courses?semester=fall`
- Create a term → verify ScheduleEntries are auto-created for offered courses
- Place a ScheduleEntry → verify section number is 1
- Place the same course again → section number is 2
- DELETE the second entry → verify section 2 is gone, section 1 remains

---

## Phase 4 — Conflict Detection

### Goal
All six auditors implemented, auto-discovered, and wired into schedule entry mutations.

### Steps

**4.1 `backend/conflict/ConflictAudit.py`**
```python
class ConflictReport:
    def __init__(self, courses: list[int], description: str): ...

class ConflictAuditor:
    def __init__(self, db, isCritical: bool): ...
    def Audit(self, term) -> list[ConflictReport]: ...
```

**4.2 `backend/conflict/ConflictAuditors.py`**

Implement each auditor. Each must override `Audit(term)` and call `super().__init__(db, isCritical)`.

*FacultyTimeConflict (critical)*
- For every pair of ScheduleEntries in the term that share a faculty and have overlapping time slots on the same weekday
- Exception: entries in the same TaughtWith group are not a conflict

*CoReqTimeConflict (critical)*
- For every CoReq group: if ALL sections of each member course overlap in time (on the same weekday), that is a conflict
- If even one section of each member avoids overlap, no conflict

*RoomConflict (critical)*
- Two entries sharing the same room with overlapping time slots on the same weekday

*RoomCapacity (critical)*
- Entry's course capacity > room capacity

*FrequencyConflict (critical)*
- Entry's course frequency ≠ number of weekdays on the schedule table it belongs to

*FacultyLoad (non-critical)*
- Faculty assigned sections across the term: count sections, if count > full_load, warn

**4.3 Auto-discovery**
In `backend/conflict/runner.py`:
```python
import inspect, sys
from conflict.ConflictAuditors import *
from conflict.ConflictAudit import ConflictAuditor

def get_all_auditors(db) -> list[ConflictAuditor]:
    return [
        cls(db) for name, cls in inspect.getmembers(sys.modules[__name__], inspect.isclass)
        if issubclass(cls, ConflictAuditor) and cls is not ConflictAuditor
    ]

def run_audits(db, term) -> tuple[list, list]:
    """Returns (critical_conflicts, warnings)"""
```

**4.4 Wire into schedule entry routes**
In POST and PUT entry routes:
1. Apply the change to the session (but don't commit)
2. Run `run_audits(db, term)`
3. If any critical conflicts → rollback, return 409 with conflict descriptions
4. If only warnings → commit, return 201/200 with warnings list

### Tests
- Seed two courses with the same faculty, place them in overlapping time slots → expect 409
- Place those same two courses in non-overlapping slots → expect 201
- Create a TaughtWith group for those two courses, place them in the same slot → expect 201 (not a conflict)
- Place a course with frequency=2 in a Thursday-only table → expect 409
- Place a course in a room smaller than the course capacity → expect 409
- Assign a faculty 4 courses when full_load=3 → expect 201 + warning in response
- Test CoReq: 2 co-req courses, only 1 section each, placed at same time → expect 409
- Test CoReq: 2 co-req courses, 2 sections each, one non-overlapping section each → expect 201

---

## Phase 5 — Excel Export

### Goal
`GET /api/terms/{term_id}/export` returns a well-formatted `.xlsx` file.

### Steps

**5.1 `backend/export.py`**

Layout per the design spec:
1. Row 1: "Term: {semester} {year}" merged across all columns
2. For each ScheduleTable in the term (separated by one empty row):
   - Row: merged cell with weekday names (e.g. "Monday / Wednesday"), filled light gray (`#D3D3D3`)
   - Header row: time slot label | room1 | room2 | ...
   - Data rows: one per time slot; cells contain course code + name if a course occupies that slot
   - Multi-time-slot courses: merge the cells vertically in that column
   - Color-code by instructor: assign a unique pastel fill color per faculty; no instructor → neutral gray
3. Write with `openpyxl`, stream as bytes response with `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`

**5.2 Color palette**
Define a list of 12 pastel hex colors for instructor coding. Assign deterministically by faculty ID mod 12.

**5.3 Route**
```python
@router.get("/api/terms/{term_id}/export")
async def export_term(term_id: int, db: Session = Depends(get_db)):
    content = generate_excel(db, term_id)
    return Response(content, media_type="application/vnd.openxmlformats...")
```

### Tests
- Call the export endpoint on a seeded term → file downloads without error
- Open in Excel/LibreOffice Calc → verify term header, table headers, and course placements
- Verify multi-slot courses span multiple rows (merged cells)
- Verify each instructor's sections share the same background color
- Unscheduled courses do not appear in the spreadsheet

---

## Phase 6 — AI Agent (ScheduleAuditAgent)

### Goal
`POST /api/terms/{term_id}/chat` accepts a user message, returns agent response with optional course highlights and proposed changes.

### Steps

**6.1 `backend/agents/schedule_audit_agent.py`**

Subclass `Agent` from `src/agents/agent.py`.

Constructor takes `db` and `term_id`. System prompt explains the agent's role and tool set.

**Tools the agent exposes (implement as methods):**

```python
def get_schedule_summary(self) -> dict:
    """Returns full term: tables, entries, faculty assignments."""

def get_faculty_load(self) -> list[dict]:
    """Returns each faculty member's section count and full_load."""

def get_coreq_groups(self) -> list[dict]:
    """Returns all co-req groups with their course lists."""

def highlight_courses(self, course_ids: list[int]) -> dict:
    """Returns {highlighted_course_ids: [...]} — frontend reads this to draw borders."""

def propose_schedule_change(self, description: str, changes: list[dict]) -> dict:
    """
    Proposes a set of changes for user approval.
    changes: [{action: "move"|"assign_faculty"|"create_entry"|"delete_entry", ...}]
    Returns proposal_id stored in memory.
    """

def apply_approved_proposal(self, proposal_id: str) -> dict:
    """Applies a previously proposed change set to the DB."""
```

**Audit logic (called on `get_schedule_summary` or explicit audit):**
- Long day: any faculty teaching ≥3 sections on the same weekday → flag
- Big gap: faculty has two sessions on the same day with a gap ≥3 time slots between them → flag
- Unbalanced load: standard deviation of faculty section counts > 1.5 → flag overloaded/underloaded faculty

**Auto-schedule:**
- Tool: `auto_schedule()` — reads all unscheduled ScheduleEntries, available rooms, time slots, faculty; uses constraint satisfaction heuristics (frequency matching, faculty preference for same-course multi-section) to propose a full schedule via `propose_schedule_change`

**6.2 Chat API route**
```python
POST /api/terms/{term_id}/chat
body: {message: str, session_id: str}
response: {
  text: str,
  highlighted_course_ids: list[int],
  proposal: {id: str, description: str, changes: list} | null
}
```

Keep a per-session dict of `ScheduleAuditAgent` instances (keyed by `session_id`) to preserve message history across calls.

**6.3 Approve proposal route**
```python
POST /api/chat/proposals/{proposal_id}/approve
POST /api/chat/proposals/{proposal_id}/reject
```

### Tests
- Send "What is the current schedule?" → agent returns a summary of the term
- Seed a faculty with 3 classes on the same day → send "Audit the schedule" → agent flags the long day
- Seed two faculty with very different loads → agent flags unbalanced load
- Send "Auto-schedule this term" → agent returns a proposal; approve it → entries appear in DB
- Verify `highlighted_course_ids` in the response matches courses mentioned in agent text

---

## Phase 7 — Frontend Foundation + Management Tabs

### Goal
All six tabs are functional: user can fully manage faculty, courses, rooms, time slots, and constraints via the UI.

### Steps

**7.1 API client `frontend/src/api.ts`**
- `axios` instance with `baseURL: '/api'`
- Typed functions for every backend endpoint (return typed interfaces matching Pydantic schemas)

**7.2 Tab layout**
- `App.tsx`: horizontal tab bar (Faculty | Course Catalog | Rooms | Time Slots | Constraints | Term Schedules)
- Active tab rendered below; all others unmounted (not just hidden — avoid stale state)
- Tabs styled with the One Dark Pro theme

**7.3 Reusable components**
- `<DataTable>` — generic table with column definitions, row actions (edit/delete)
- `<FormModal>` — modal dialog with a form, Cancel / Save buttons
- `<TagInput>` — comma-separated string tag editor (used for Faculty tags)
- `<MultiSelect>` — dropdown with checkboxes (used for teaching capabilities, offerings)

**7.4 Faculty tab**
- Table: Last Name, First Name, Rank, Full Load, Tags
- Add / Edit modal: all fields, plus a multi-select for courses they can teach
- Delete with confirmation

**7.5 Course Catalog tab**
- Table: Dept Code, Course Number, Name, Duration, Capacity, Frequency
- Add / Edit modal: all course fields, plus multi-select for which semesters it's offered
- Show course number breakdown tooltip (level, credits, category, index)

**7.6 Rooms tab**
- Table: Label, Capacity
- Add / Edit / Delete

**7.7 Time Slots tab**
- Table: Label, Start Time, End Time, Display Order
- Add / Edit / Delete
- Always display sorted by display_order

**7.8 Constraints tab**
Two panels side-by-side:
- Taught With panel: list groups, each showing member courses; add/remove groups and members
- Co-Requisite panel: same structure

### Tests
- Add a faculty member with tags and 2 teaching capabilities → appears in table, reload persists
- Edit a faculty's full_load → updated in DB
- Delete a room → gone from table, page does not crash
- Add a course with Frequency=2 offered in Fall and Spring → appears with correct semester badges
- Add a TaughtWith group with 2 courses; attempt to add a third course already in another group → backend returns error (unique constraint), UI shows toast
- Add a time slot out of order, verify display sorts by display_order

---

## Phase 8 — Term Schedules Tab (Drag-and-Drop)

### Goal
Full scheduling workflow: create terms, drag courses into tables, see conflicts, chat with AI agent.

### Steps

**8.1 Term selector**
- Dropdown listing existing terms (e.g. "Fall 2026"); last option: "+ New Term"
- Creating a new term: two-field modal (semester, year) → POST → auto-created entries appear

**8.2 Course List component**
- Filtered by the term's semester
- Each `CourseCard`:
  - Code row: `{DEPT} {courseNumber}-{section}`
  - Name, Capacity, and a spin box for "sections needed"
  - Spin box change → PATCH section-count → updates entry list
  - Border: red if 0 scheduled sections, orange if scheduled < needed, none if fully scheduled
- Each `CourseCard` is a dnd-kit `Draggable` — drag payload: `{course_id}`

**8.3 Schedule Table component**
- Header: weekday checkboxes (Mon–Fri); change → PUT table weekdays
- Body: a CSS grid — rows = time slots (sorted), columns = rooms (sorted by label)
- Cells are dnd-kit `Droppable` with payload `{time_slot_id, room_id}`
- Each cell may contain a `ScheduledSection` card (see 8.4)
- [+] button after last table in list; [+] alone if no tables exist

**8.4 ScheduledSection card**
Displayed inside a table cell. Contains:
- Course code + name
- Instructor dropdown (filtered by teaching capability for that course)
  - On change → PATCH /entries/{id}/faculty
- Delete button → DELETE /entries/{id}
- Background color based on assigned instructor (same palette as Excel export)
- Spans multiple cell rows if course occupies multiple time slots (CSS grid row-span)
- Is itself a dnd-kit `Draggable` — drag payload: `{entry_id}` (for moves)

**8.5 Drag-and-drop logic**
Use dnd-kit's `DndContext` wrapping the entire Term Schedules tab.

On `onDragEnd`:
```
if payload has course_id (from Course List):
    POST /api/tables/{table_id}/entries
    → 409: show toast with error description, do not update UI
    → 201: add entry to local state, update course card border, refresh warning list

if payload has entry_id (move existing section):
    PUT /api/entries/{entry_id}  (new room_id, time_slot_ids, table_id)
    → 409: revert optimistic UI, show toast
    → 200: update local state, refresh warning list
```

Optimistic UI: briefly show the card in the new position with a loading state; revert on error.

**8.6 Warning List**
- Rendered from the `warnings` array returned by the last successful POST/PUT entry
- Each warning: course names, table name, description
- Refreshes on every successful drag; cleared when term changes

**8.7 AI Audit panel**
- Chat message list (user messages right-aligned, agent left-aligned)
- Text input + Send button
- On send → POST /api/terms/{term_id}/chat → append agent text to chat
- If response has `highlighted_course_ids`: add a CSS class to matching CourseCards showing a blue glow border
- If response has a `proposal`: render a "Proposed Changes" card below agent message with Approve / Reject buttons
  - Approve → POST /api/chat/proposals/{id}/approve → refresh all entries
  - Reject → POST /api/chat/proposals/{id}/reject → no UI change

**8.8 Export button**
- Click → `window.open('/api/terms/{term_id}/export')` — browser downloads the file directly

### Tests

*Drag-and-drop happy path:*
- Drag a course from Course List to a table cell → card appears in cell, CourseCard border updates
- Drag same course again → section 2 appears, each has independent instructor dropdown
- Drag section 1 from one cell to another in same table → card moves
- Drag section across tables (different table in same term) → card moves
- Delete a section → card removed, section count in Course List decrements

*Conflict rejection:*
- Assign same faculty to two sections overlapping in time → drag fails, toast appears, card stays in original position
- Drag a frequency=2 course into a Thursday-only table → drag fails with correct error message
- Drag a course into a room too small for it → drag fails

*Warning flow:*
- Assign a faculty 4 sections when full_load=3 → drag succeeds, warning appears in Warning List

*AI Agent:*
- Type "Which courses aren't scheduled yet?" → agent response names the unscheduled courses, their CourseCards glow blue
- Type "Schedule everything automatically" → proposal card appears; approve → all entries populated; reject → no change

*Export:*
- Click Export on a partially filled term → .xlsx downloads, opens correctly in spreadsheet app

---

## Cross-Cutting Concerns

### Error handling
- Backend: unhandled exceptions → 500 with `{"detail": "..."}` using FastAPI exception handler
- Frontend: axios interceptor logs 4xx/5xx, shows a toast for unexpected errors

### State management
- Use React's `useState` / `useReducer` locally per tab; no global store needed
- Re-fetch from API after any mutation (keep it simple over optimistic-only)

### Dependency on `src/agents/`
When implementing the backend, copy `src/agents/agent.py` and `src/agents/utilities.py` into `backend/agents/` so the backend has its own copy with no relative import issues. `CLAUDE_API_KEY` must be set in the environment.

### No auth
This is a single-user local tool; no authentication is needed.

### No Docker
Run backend and frontend in separate terminal processes during development.
