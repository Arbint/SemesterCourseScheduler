Create another tab called faculty schedule.

This is the schedule that reads from the data base and list out the schedule tables for each faculty.

## Backend Change Required

To have a complete configuration of the faculty schedule, we needs to alter the backend:

The faculty schedule includes:

* Courses

* Office Hours

* Meetings

We only have courses and meetings currently scheduled, but we don't have office hours, so our database needs an update to add it.

Office hours are unique each semester, a faculty is required to have at least 4 office hours/week but they can distribute to any time during the weekdays.

Add a minumum office hour variable to the data base. allow the user to change it in the constaints tab.

add an office hours table that links to a faculty and term.

The table should know have record on the office hours of a faculty in each term.

## Faculty Schedule Frontend:

The faculty schedule should have the same setup as Classroom Schedule, but this time, instead of a table for each room, it should have a table for each faculty.

The table of the Faculty Schedule should have the same type of rows and columns, for each cell. The cell can be occupied by a, course, a meeting, and an empty cell can be configured to be office hours.

right click on any empty cell to add an office hour, disallow the creation of the office hour if the cell has a course or meetin already.

The user can drag the top or bottom edge of the office hour to change it's start and end time. prevent the duration of the office hour from overlaping with any existing courses, office hours, or meetings.
