To schedule a term, we also need to take into consideration of the faculty meetings.

The faculty meeting have almost the same attribute as a course, and is not allowed to collide with any course.

Faculty meeting needs to be scheduled per term.

# Backend change

Add a meetings table. For each meeting, we should have:

Name, String
Duration, same duration schema as the course table.

In the terms table, add another meettings attribute for the term.




