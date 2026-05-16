---
name: feedback-bugs
description: Known bugs encountered during testing and their fixes
metadata:
  type: feedback
---

**`'NoneType' object has no attribute 'weekdays'` on drag-drop**

When dragging a course into a schedule table, the conflict auditors threw AttributeError because `entry.schedule_table` was None despite `schedule_table_id` being set.

**Why:** `_refresh_term` called `expire_all()` then re-queried the Term. SQLAlchemy returned expired entry objects from the identity map; when auditors accessed `entry.schedule_table`, the lazy-load returned the old cached `None` (set before the FK was assigned), not the real table.

**Fix (applied):** `_refresh_term` now uses `selectinload` to eagerly pre-load all relationships auditors need (`schedule_table → weekdays`, `time_slots`, `room`, `faculty`, `course → taught_with_membership`). Defensive `and e.schedule_table` guards were also added to all four auditor filters as a second layer. See `backend/routers/schedule_entries.py` and `backend/conflict/ConflictAuditors.py`.

**How to apply:** Any future auditors that access `entry.schedule_table` or other relationships must either (a) add their needed relationships to `_refresh_term`'s `selectinload` chain, or (b) guard with `and e.schedule_table`.
