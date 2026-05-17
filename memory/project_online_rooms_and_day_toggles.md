---
name: online-rooms-and-day-toggles
description: Feature: per-entry day toggles when table has more days than course frequency; online room type with unlimited capacity and no room conflicts
metadata:
  type: project
---

## Implemented features (feedback_18)

**Day toggles**: Added `schedule_entry_active_weekdays` junction table in `models.py`. When a table has more weekdays than a course's `frequency`, the `ScheduledSectionCard` shows letter buttons (M, T, W, Th, F) the user must toggle to exactly `frequency` days. A `FrequencyToggleWarning` (non-critical) fires if the count is wrong. `FrequencyConflict` (critical) now only fires when table has *fewer* days than frequency. All conflict auditors use `_get_effective_weekdays()` which returns per-entry active days if set, else table weekdays.

**Online room**: Added `is_online: Boolean` column to `Room` (migrated via `_migrate_db()` in `main.py`). Online rooms appear as last columns in the schedule grid (sorted in `ScheduleTableView`), display `(∞)` capacity, use horizontal card layout in cells, and skip `RoomCapacity` and `RoomConflict` checks.

**Why:** User feedback to allow flexible scheduling across MWF tables for 2x/week courses, and to support online courses without physical room constraints.

**How to apply:** When extending conflict detection, call `_get_effective_weekdays(entry)` instead of reading `entry.schedule_table.weekdays` directly. New `active_weekday_ids` field is on `ScheduleEntry` in both backend and frontend types.
