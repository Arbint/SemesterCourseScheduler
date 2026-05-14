# Application Design Document

This is a web app that helps the department chair to schedule courses for the semester.

## App Structure

### Backend

The backend has a data base that has the following tables:

* Faculty

    - First Name
    - Last Name
    - Rank (Full Time, Part Time)
    - Tags (list of arbitrary strings)

* Course

    - Instructor (one of the faculty)
    - Department Code (ANGD, CIS..)
    - Course Number (1321, 2321, 3721, 4100)
    - Course Name
    - Duration (1 hour 15 mintues, 2 hour 45 minute)

* Room

    - Room Label (FH 3233, G036)
    - Room Capacity (integer number)

* Schedule Tables

    - 
    