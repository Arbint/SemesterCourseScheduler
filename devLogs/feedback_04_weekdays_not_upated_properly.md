## UI and Data Base inconsistency.

Looks like there are many inconsistencies between the UI and the data base.

After some testing, we noticed

* Looks like the weekdays of a schedule table is not updated when the user checks on or off the checkboxes in the frontend UI 

* The course in the course list also may not represent the course they are displaying.


For example:
After checking on both Mon and Wed in the table, dragging any course to the schedule table says: ANGD 2321 requires 2 day(s), but tabe has 1 day(s), both course and weekdays are wrong (inconsistent with what the user sees in the frontend UI)

There might be other parts that is wrong.

Suggest changes:

1, flush the data base, there might be corrupted data in the database produced by testing.

2, check if the code actually updated the backend and front end consistently.


