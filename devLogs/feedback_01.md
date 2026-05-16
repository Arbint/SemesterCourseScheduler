Here are the feedbacks for the question you bring up after reading the Applcation Design document.

## Critical Gaps

1. Missing ScheduleEntries table

    Answer: I have added one.

2. Weekday pattern missing from Courses

    Answer: the courses table should be more like a course catalog, they may offer in different workdays, there for the course themselves should not have weekdays, the schedule table determines their weekday for the specific term they are scheduled. 

3. Term/Year dropdown inside each Schedule Table is redundant

    Answer: I have removed it.


4. Tech stack is unspecified
No framework choices for backend (FastAPI? Django? Flask?) or frontend (React? Vue? plain JS?). These decisions affect everything — file structure, tooling, drag-and-drop library selection, ORM, database engine.

    Answer: I am unfamiliar with the teck stack of an web app, use the one that makes the most sence. I want to use claude code ai agent to help me audit the schedule table too, I have implement a base Agent class in src/agents/agent.py, that is using python, I am guess a python backend would work out the best, please give your honesty opinion.

## Data Model Issues

5. Faculty has no availability or max-load field
Faculty only have name, rank, and tags. Real scheduling requires at minimum: days available, max courses per semester. Without this, the auditor can't detect overload conflicts.

    Answer: I have added a max course load to faculty

6. Section model is ambiguous
The doc says sections "are essentially a different course from the scheduling point of view" but puts section as a field on the same Courses row. Should each section be its own row? If so, the unique key for a course is (dept_code, course_number, section) — this should be stated explicitly.

    Answer: Section has been removed, it is now a schedule table entry property.

7. Taught With and Co-Req groups are global
These constraints have no term/semester scope. A "Taught With" pairing might only apply in specific semesters. Should these be term-scoped?

    Answer: conflict should only be checked within a term, that is why the Audit function takes in a term.

8. Courses.semester is a list
A list field in a relational table is a code smell. This should be a CourseOfferings join table: (course_id, semester_id).

    Answer: Yes, I have made the adjustment.

## Backend Code Issues

9. Missing Room Conflict auditor
The two listed auditors catch faculty and co-req conflicts, but there's no auditor for two courses assigned to the same room at the same time. This is arguably the most fundamental conflict to detect.

    Answre: I have added that defination


10. Audit(term) is ambiguous
A term can have multiple schedule tables. Does the auditor check all tables in the term simultaneously, or one at a time? Cross-table conflicts (e.g., a faculty member double-booked across two tables) need clarification.

    Answer: the audit should be per term, and cross-table conflicts should be deteced, I have added note to the ApplicationDesignDocument to address that issue.

11. No REST API spec
"Rest API access" is mentioned but no endpoints, request/response schemas, auth mechanism, or pagination strategy are defined. At minimum, CRUD endpoints per entity need to be enumerated.

    Answer: I am not familar with REST api, please implement minimum CRUD for the app to handle properly.

## Frontend Issues

12. Copy-paste error in Faculty tab

    Answer: Addressed

13. Course List in Term Schedules should filter by term's semester
Currently it shows all courses. A Fall term should only show courses offered in Fall. Otherwise the list is cluttered with irrelevant entries.

    Answer: I have addressed the issue


14. Placed vs. unplaced courses need visual distinction
The Course List has no mention of differentiating courses already placed in the current schedule from those that aren't. Without this, the user can't tell what's still unscheduled.

    Answer: I have added decription of the behavior

15. Conflict detection trigger is unspecified
Is conflict detection run on every drag-and-drop, on a manual "run audit" button, or periodically? Real-time is better UX but more complex to wire up.

    Answer: I have added specification

16. CSV export format is undefined
What columns does the export have? How are multi-day meetings represented? Does it export one table or all tables in the term?

    Ansser: I have added the specification


