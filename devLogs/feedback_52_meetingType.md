To schedule a term, we also need to take into consideration of the faculty meetings.

The faculty meeting have almost the same attribute as a course, and is not allowed to collide with any course.

Faculty meeting needs to be scheduled per term.

# Backend change

Add a meetings table. For each meeting, we should have:

Name, as a String
Duration, same duration schema as the course table.

each term will have an associate list of meetings in their schedule, propose your backend solution to me before implementing.

# Front End

Add a Meetings List, tack it under Course List.

In the Term Schedule tab, add a Term Meetings button, once clicked, a pop up will show asking for the Name, and Duration of the meeting. 

Once added, the meeting apears in the Meetings List.

The user should be able to drag and drop the meeting to the schedule table the say way as a course. and it cannot collide with any course.

add undo support for meeting drag and drops.

This meeting should apear in both Term Schedules and Views.







