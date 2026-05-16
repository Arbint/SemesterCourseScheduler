# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A single-user web app that helps a department chair schedule courses for academic semesters. Core workflow: manage the catalog of faculty, courses, rooms, and time slots → build term schedules by dragging courses into grid tables → detect conflicts in real time → audit and auto-schedule via an AI agent.

The authoritative specification is `DesignDocuments/ApplicationDesignDocument.md`. Read it before making significant design decisions.

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | FastAPI (Python) |
| ORM | SQLAlchemy + Alembic |
| Database | SQLite (single-file, no Docker) |
| Frontend | React + TypeScript |
| Drag-and-drop | dnd-kit |
| Excel export | openpyxl |
| AI integration | Anthropic Claude API via `src/agents/agent.py` |

## Architecture

### Backend layers

**Database → Conflict Detection → REST API**

- `ConflictAudit.py` — base classes `ConflictReport` and `ConflictAuditor` (do not modify; this is the interface contract)
- `ConflictAuditors.py` — concrete implementations; the backend auto-discovers all `ConflictAuditor` subclasses in this file
- `ConflictAuditor.isCritical = True` means a non-empty report must block the operation (HTTP error); `False` means it populates the Warning List only
- Required auditors: Faculty Time Conflict (critical), Co-Requisite Time Conflict (critical), Room Capacity (critical), Room Conflict (critical), Frequency Conflict (critical), Faculty Load (non-critical)
- Conflict checking runs on every schedule modification and must span all tables within the same term

**AI Agent**

- Base class: `src/agents/agent.py` — `Agent` handles tool use, sub-agents, and message history against the Anthropic API
- Sub-agents are registered via `AddSubAgent()` and exposed to the parent as tools automatically
- Extend `Agent` into `ScheduleAuditAgent` for: long-day detection, big-gap detection, unbalanced load detection, and full auto-scheduling
- The agent must expose tools to apply approved changes back to the database

### Data model highlights

- `ScheduleTable` — weekday selection + list of `ScheduleEntry` rows; all selected weekdays are **identical** (single grid, not one per day)
- `ScheduleEntry` — one course section: `(course_id, schedule_table_id, section, room_id, time_slot_ids[], faculty_id)`
- Course sections are `ScheduleEntry` rows, not a field on `Course`; section numbering starts at 1
- Course number encoding: digit 1 = level, digit 2 = credit hours, digit 3 = category, digit 4 = index (e.g., 3371 → junior, 3 credits, category 7, index 1)
- `TaughtWith` and `CoReq` both use a two-table group/member pattern; a course may only belong to one `TaughtWith` group
- Term creation auto-populates one `ScheduleEntry` per course offered in that semester

### Frontend structure

Six tabs: Faculty, Course Catalog, Rooms, Time Slots, Constraints, **Term Schedules** (primary working area).

Term Schedules layout:
- Top bar: term dropdown (last option creates new term) + Export button
- Four resizable columns: Course List | Tables List | Warning List | AI Audit

Key drag-and-drop rules:
- Dropping a course onto a table **creates** a new `ScheduleEntry`; the course stays in Course List
- Each subsequent drop of the same course creates the next section (1, 2, 3…)
- Courses can be moved between time slots and between tables
- Every drop triggers all conflict auditors; critical failures reject the drop with a top-right toast; non-critical failures update the Warning List
- Course components show a red border (no sections scheduled) or orange border (not all needed sections scheduled)
- Scheduled sections show an instructor dropdown filtered by `FacultyTeachingCapability`; sections are color-coded by instructor

Theme: One Dark Pro style; centralized CSS file. Icon/favicon: `./assets/icon.png`.

## Existing Code

```
src/agents/
  agent.py        # Base Agent class — do not break this interface
  utilities.py    # GetAPIKey() reads CLAUDE_API_KEY from environment
examples/
  agentExample/   # Reference implementation showing agent + sub-agent pattern
DesignDocuments/
  ApplicationDesignDocument.md
devLogs/          # Design Q&A and clarifications (useful context)
assets/
  icon.png
```

## Environment Setup

No build files exist yet. When implementing:

```bash
# Backend
pip install fastapi sqlalchemy alembic openpyxl anthropic uvicorn
export CLAUDE_API_KEY=<your key>
uvicorn main:app --reload

# Frontend
npm install
npm start
```
