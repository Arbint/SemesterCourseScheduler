---
name: project-build
description: Full build status of the SemesterCourseScheduler app — all 8 phases completed
metadata:
  type: project
---

All 8 phases of the build plan implemented and verified working.

**Why:** User asked to build from the build plan (devLogs/buildPlan.md).

**How to apply:** Backend runs with `cd backend && uv run uvicorn main:app --port 8000 --reload`. Frontend runs with `cd frontend && npm run dev`. Seed data loaded with `cd backend && uv run python seed.py`.

Key implementation notes:
- Backend uses uv (not pip/requirements.txt)
- Static data (semesters, weekdays) auto-seeded on backend startup
- All 6 conflict auditors implemented and auto-discovered
- ScheduleAuditAgent in backend/agents/schedule_audit_agent.py
- Frontend proxies /api to localhost:8000 via vite.config.ts
- dnd-kit drag-and-drop: course_id payload for new entries, entry_id for moves
- Conflict 409 responses return list of {courses, description} objects
