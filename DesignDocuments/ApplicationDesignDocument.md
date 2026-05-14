# Application Design Document

This is a web app that helps the department chair to schedule courses for the semester.

## App Structure
----------------------------
### Backend

#### Database structure:
The backend has a data base that has the following tables:

* Faculty

    - First Name
    - Last Name
    - Rank (Full Time, Part Time)
    - Tags (list of arbitrary strings)

* Courses

    - Instructor (one of the faculty)

    - Department Code (ANGD, CIS..)

    - Course Number (1312, 2321, 3371, 4100)
        * The highest digit of the course number is their level, for example, 1321 is a freshman level and 3371 is junior year.
        * The next digit is how many credit hours it has, so 1321 has 3 credit hours, and 4100 has 1 credit hours.
        * The third one is the category id, for example, in 1312, the third digit 1 means freshman generalist courses. The 7 in 3371 means the programming concentration course.
        * the last digit is an index for courses in the same course category. for example, 3371 is Game Programming III, 3372 is Game Programming IV.

    - Course Name (a String that is the name of the course, like Game Programming III)

    - Duration (1 hour 15 mintues, 2 hour 45 minute, course are usually in either 1 hour 15 mintues or 2 hour 45 minutes, but can have unique durations)

    - Capacity (int value for the max amount of student allowed in the course)

    - Section (int value, some course has multiple sections, they are the same course taught by different instrutors at different times,they are essentailly a different course from the scheduling point of view)

* Taught With

    Some courses are taught with each other, meaning the 2 courses are taught by the same instructor, at the same room and same time. They are essentially the same course but might be for students from different backgrounds. This is modeled using two tables:

    - TaughtWithGroups: each row is a group, identified by a unique group_id (PK).
    - TaughtWithMembers: each row links one course to one group, with group_id (FK) and course_id (FK) forming a composite PK.
    - A course may only belong to one TaughtWith group (unique constraint on course_id in TaughtWithMembers).

* Co-Requisites

    Some courses are meant to be taken by a student in the same semester, for example, a student in Animation III should also take Mo-Cap Animation. These courses should not be scheduled at the same time. This is modeled using two tables:

    - CoReqGroups: each row is a group, identified by a unique group_id (PK).
    - CoReqMembers: each row links one course to one group, with group_id (FK) and course_id (FK) forming a composite PK.


* Rooms

    - Room Label (FH 3233, G036)
    - Room Capacity (integer number)

* Time Slots
    - a list of time slots (7:30 AM - 8:45 AM, 9:00 AM - 10:15 AM, ...)

* Weekdays

    - Monday to Friday

* Schedule Tables:
    to schedule a semester, the user will create multiple schedule tables, a schedule table would have:
    * Week days (what weekdays the schedule is planned)
    a table with:
        * rows: time slots from the Time Slots table. 
        * columns: rooms from the Rooms table.
        * a course could occupy 1 or more cells in the table based on the duration, for example if a course is in Room FH 3059 and the time is from 7:30 AM - 10:15 AM, it will occupy both the cell on 7:30 AM - 8:45 AM, and 9:00 AM - 10:15 AM.


* Semester:
    A semester is a list of schedule tables. 

#### Backend code:
On top of the Rest API access to backend database. the backend code should have the following features:

* Conflict Detection 

    These are conflicts the backend should detect:

    * Faculty time conflict, a faculty cannot teach 2 courses at the same time unless they are taught with eachother.

    * Co-requisite courses that are scheduled at the same time is not allowed.

---------------

### Frontend

#### Theme
Create a centralized .css file to define the theme of the front end, we prefer a theme that is similar to One Dark Pro that you would found in VS Code.

#### Icon and Favicon
The Icon and Favicon are the same is is located at: ./assets/icon.png

#### Frontend Structure

The front end in composed with multiple tabs:

* Faculty:

    This tab allows the user to add and remove courses, define their properties as described in the data base.

* Courses:

    This tab allows the user to add and remove courses, define their properties as decribed in the data base.

* Rooms:

    This tab allows the user to add and remove rooms, define their properties as decribed in the data base.

* Time Slots:

    This tab allows the user to add and remove time slots, define their properties as decribed in the data base.

* Constraints:

    This tab has 2 parts: 

    * Taught with: allows the user to add, remove, and configure taught with groups.

    * Co-Requisite: allows the user to add, remove, and configure co-requisites groups.

* Schedule Tables:

    This tab is the primary working area for doing the schedule, it is broken down to 3 columns

    * Course List

        this is a list of courses that shows the courses in the Courses table in the data base. each course is a component that has 4 row:

        * Code Row: composed of {Department Code} {Course Number}-{Section Number}
        * Name Row: Course Name
        * Instructor: Instructor of the course
        * Capacity: The capacity of the course

    * Tables List

        This is the place for the user to added in tables, each table has a 
    * Error List