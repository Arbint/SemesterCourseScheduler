Some of the courses are taught with each other, 2 courses that are taught with each other just need to be scheduled in the same slot. See ApplicationDesignDocument.md for detail.

The current issue is that.

* if one course is scheduled, the corresponding taught with course is still not showing as scheduled in the term.
* It's unknown what happens if draging 2 taught with courses in the table, would it double schedule them.

Alter the app to:

* For a course that is already in the schedule tables, if a course has a taught with course, add a label to indicate that to the course.
* For a pair of taught with coursese, dragging any course to the schedule table would mark both courses scheduled.
* Dragging any course of a pair of taught courses to the table with reschedule the existing one(if exist) to the new slot, never double schedule the taught with pair.

