# Schedule Domain Context

## Course–Semester Assignment

Every course in the catalog is assigned to one or more semesters (Fall, Spring, Summer).
When a term is created, **only** courses offered in that semester are auto-populated as schedule entries.
This means every entry you see in `get_schedule_summary()` — scheduled or unscheduled — belongs to the current semester.
Do **not** question whether a course belongs in the current term; if it shows up in the data, it does.

## TaughtWith Courses

Two courses may be designated "TaughtWith" — they are taught simultaneously in the same room by the same instructor.
A TaughtWith pair counts as **one (1) load unit** for the assigned faculty member, not two.
When computing or reporting faculty load, treat a TaughtWith pair as a single section.
This applies to both global TaughtWith groups (set in the Constraints tab) and per-term TaughtWith groups.

## Faculty Load Rules

### Full-Time Faculty
- Have a `full_load` value (typically 3 sections per semester, but check the stored value per faculty).
- Being **over** full_load is a critical problem — flag it.
- Being **under** full_load is a warning worth reporting, as it means available capacity is unused.

### Part-Time Faculty
- Have a `rank` of `part_time`.
- **Do not flag part-time faculty for being underloaded** — they are not expected to fill a full load.
- Part-time faculty may teach at most 2 courses. Flag it if they exceed 2 sections.

## Identifying Part-Time vs Full-Time

The faculty data includes a `rank` field: `full_time` or `part_time`.
Use this to determine which load rules apply when auditing or assigning sections.
Always call `get_faculty()` to retrieve rank alongside load data before auditing.
