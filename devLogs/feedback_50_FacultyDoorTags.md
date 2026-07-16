Seems like we also need to create door tags for the faculty. but instead of tags, it's better that we name them schedules.

Let's rename the Door Tags tab to Room Schedule.

Create another tab called faculty schedule.

To configure the faculty schedule, we needs to alter the backend.

The faculty schedule includes:

* Courses

* Office Hours

* Meetings

We only have courses, but we dont have meetings, or office hours, so our database needs an update to add the two:

* Meetings

This should be an indenpendent data, it should have the following attribute:

Weekdays (can be one day or multiple days)
Duration (same as the course)
Location (should be associate to a room)

The faculty schedule should have the same setup as Classroom Schedule, but this time, instead of the the Term dropdown list, change it to Faculty dropdown list, add a search feature for the faculty dropdown list too. The faculty dropdown list should also be a multi selection dropdown list, each selected faculty 

The table of the Faculty Schedule should have the same type of rows and columns, for each cell. 