# Application Design Document

This is a web app that helps the department chair to schedule courses for the semester.

## Recommended Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Backend framework | FastAPI (Python) | Async, auto-generates OpenAPI docs, integrates cleanly with the existing Python agent code |
| ORM | SQLAlchemy | Standard Python ORM; pairs with Alembic for database migrations |
| Database | SQLite | Zero-config, single-file, sufficient for a single-user scheduling tool |
| Frontend framework | React + TypeScript | Best ecosystem for complex interactive UIs |
| Drag-and-drop | dnd-kit | Modern, accessible, flexible — well-suited for custom table grids |
| Excel export | openpyxl | Required for `.xlsx` output with cell colors, merged cells, and formatting |
| AI integration | Anthropic Claude API | Via the existing `src/agents/agent.py` base class; Python backend calls it directly |

Please don't do docker container yet.

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
    - full load (an int representing how many course counted as full load, faculty can have overloads, it is not a hard limit, if they have lower than full load, they are under load, also not a hard limit, but worth a warning)

* Semesters

    There are 3 semseters:

    * Fall
    * Spring
    * Summer

* Weekdays

    - Monday to Friday

* Time Slots

    - a list of time slots (7:30 AM - 8:45 AM, 9:00 AM - 10:15 AM, ...), a time slot is a peorid of time during the day.

* Rooms

    - Room Label (FH 3233, G036)
    - Room Capacity (integer number)


* Courses Catalog

    - Department Code (ANGD, CIS..)

    - Course Number (1312, 2321, 3371, 4100)
        * The highest digit of the course number is their level, for example, 1321 is a freshman level and 3371 is junior year.
        * The next digit is how many credit hours it has, so 1321 has 3 credit hours, and 4100 has 1 credit hours.
        * The third one is the category id, for example, in 1312, the third digit 1 means freshman generalist courses. The 7 in 3371 means the programming concentration course.
        * the last digit is an index for courses in the same course category. for example, 3371 is Game Programming III, 3372 is Game Programming IV.

    - Course Name (a String that is the name of the course, like Game Programming III)

    - Duration (1 hour 15 mintues, 2 hour 45 minute, course are usually in either 1 hour 15 mintues or 2 hour 45 minutes, but can have unique durations)

    - Capacity (int value for the max amount of student allowed in the course)

    - Frequency (How many meetings per week, int value, if there are N meetings a week, then the meetings has to be on N different days offered at the same time of the day, prefer even the meetings out from Mon-Thur, and not Friday or weekends. For example, if a course is offered twice a week, then we can schedule it on Monday & Tuesday at 10:30 AM to 1:15 PM)

* Course Offserings

    This is the join table that stores which course(s) are offered in which semester(s)


* Faculty Teaching Capability

    This is the join table that stores which course(s) can be taught by by which instructor(s). Instructor and faculty are the same in this context.


* Taught With

    Some courses are taught with each other, meaning the 2 courses are taught by the same instructor, at the same room and same time. They are essentially the same course but might be for students from different backgrounds. This is modeled using two tables:

    - TaughtWithGroups: each row is a group, identified by a unique group_id (PK).
    - TaughtWithMembers: each row links one course to one group, with group_id (FK) and course_id (FK) forming a composite PK.
    - A course may only belong to one TaughtWith group (unique constraint on course_id in TaughtWithMembers).

* Co-Requisites

    Some courses are meant to be taken by a student in the same semester, for example, a student in Animation III should also take Mo-Cap Animation. These courses should not be scheduled at the same time. This is modeled using two tables:

    - CoReqGroups: each row is a group, identified by a unique group_id (PK).
    - CoReqMembers: each row links one course to one group, with group_id (FK) and course_id (FK) forming a composite PK.

* Terms

    Each term is composed with four components

    * Semseter
    * Year (2025, 2026 ...)
    * Schedule Tables (see schedule tables below)
    * Schedule Entries (see Schedule Entries)
        * When a term is created, it should auto populate a schedule entire for each of the course that is supose to be offered in the semster the term is at. a course might need more sections, and that is added by the frontend (see Course List in Frontend)

* Schedule Tables:

    Schedule tables are the schedules build for a specific term, the user will create multiple schedule tables for a term, a schedule table would have:

    * Weekdays (what weekdays the schedule is planned)

        Note: some courses are offered on both Tuesday and Thursday, and some others are offered on Thursdays only, if that is the case, a user would have to create 2 tables, one has Tuesday and Thursday, and the other one has only Thursday. This also means conflict checking should be across all tables in the term.(see conflict detection), the schedule for each of the weekday in the weekdays in the scheudle table should be identical, which means if a course is scheduled on Monday & Wednesday, then it should be offered on both days at the same time.
        
    conceptually, a schedule table is a table that has:

    * rows: time slots from the Time Slots table. 

    * columns: rooms from the Rooms table.

    * a course could occupy 1 or more cells in the table based on the duration, for example if a course is in Room FH 3059 and the time is from 7:30 AM - 10:15 AM, it will occupy both the cell on 7:30 AM - 8:45 AM, and 9:00 AM - 10:15 AM.

    the table is modeled by the Schedule Entries (see below)

* Schedule Entries:

    * A Schedule Table should be modeled with a list os schedule entires, each entry represent a section of a course being offered, it contains:

        * course_id
        * schedule_table_id
        * section (int value, some course has multiple sections, they are the same course taught (by the same or different isntructors) at different times, they are essentailly a different course from the scheduling point of view, based on enrollment, more or less sections might be needed)
        * room_id
        * time_slot_ids: list of time slots, could be one or more based on how many time slot this course occupy.
        * faculty_id


#### Backend code:
On top of the Rest API access to backend database. the backend code should have the following features:

* Conflict Detection

    * The pattern of conflict detection is based on a base class called ConflictAuditor that takes in the database in it's constructor, and the conflict detection is done by calling the Audit method, the Audit method takes in the term and will check across all tables in the term and look for conflicts/warnings. The Audit method returns a list of ConlifctReport (there is no conflict detected if the list is empty):

        ```py
        class ConflictReport:
            def __init__(self, courses, descrpiton):
                self.courses = courses
                self.description = description

        class ConflictAuditor:
            def __init__(self, dataBase, isCritical): 
                self.dataBase = dataBase

                # if a critical auditor returns a none empty ConflictReport list, the operation should fail, for non-critical auditor, a warning would apear in the Warning List (See front end)
                self.isCritical = isCritical

            def Audit(self, term)->list[ConflictReport]:
                return []
        ```

        Put these 2 base classes in a file called ConflictAutdit.py, and implement the concrete ConflictAuditors in a different file called ConflictAuditors.py

        * The back end should automatically find all child classes of ConflictAuditors in ConflictAuditors.py and use them to find conflicts.

    * To start with, these are the conflicts the backend should implement:

        * Faculty time conflict, a faculty cannot teach 2 courses at the same time unless they are taught with eachother. this should be a critical auditor

        * Co-requisite courses that are scheduled at the same time is not allowed. however, if there are multiple sections, then it will be an error if all sections are colliding. This one should also be a critcial auditor

        * room capacity auditor, critical

        * room conflict auditor, critictal

        * frequency conflict auditor, critical (if a course is offered only once a week, but it is being dragged in to a schedule table that has a weekdays of Mon & Wed, it should fail.)

        * Faculty load auditor, none critical


* AI Agent

    The app supports AI Agent to audit the the schedule, and give suggestions, There is a base class called Agent under src/agents/agent.py, it uses API to talk to the Anthropic LLM, and it has the basic framework to have tools and SubAgents (behave like toos of the parent agent), an example is in examples/agentExample/exampleAgent.py.
    
    The backend should have a sublcass of Agent called ScheduleAuditAgent that should be able to detect the following issues: 
    
    * A long day - if a faculty is teaching 3 classes in a single day, or a student has to take 3 classes in a single day, this should be based on the co-requisites.

    * Big gap - if a faculty is teaching 2 classes, but one is in the morning, and the other is in the evening of the same day.

    * Unbalanced load - some faculty has way more load than others

    * Auto Schedule - the AI should be able to automatically schedule and entire semester. It should take care of:

        * create the correct amount of schedule tables needed so there is a place for all course section to be scheduled. for example, if the majority of the courses offered twice a day, and one or two are schedule once a day, the angent could create 3 tables.

            * Monday & Wednesday table to shedule half of the courses that are offered twice a week
            * Tuesday & Thursday table to schedule the other half of the courses taht are offered twice a week.
            * Thurday only table to schedule the courses that are offered only in one day.

        * evenly distribute faculty load.

        * prefer faculty to teach mutliple sections of the same course than multiple different courses.

    The Agent should be able to promote solutions to the user, and tools to apply the changes if the user approves.
    
---------------

### Frontend

#### Theme

Create a centralized .css file to define the theme of the front end, we prefer a theme that is similar to One Dark Pro that you would found in VS Code.

#### Icon and Favicon

The Icon and Favicon are the same is is located at: ./assets/icon.png

#### Frontend Structure

The front end in composed with multiple tabs:

* Faculty:

    This tab allows the user to add and remove faculty, define their properties as described in the data base. this part should also allow user to define the teaching capability.

* Course Catalog:

    This tab allows the user to add and remove courses, define their properties as decribed in the data base. this part should also allow the user to define the course offering.

* Rooms:

    This tab allows the user to add and remove rooms, define their properties as decribed in the data base.

* Time Slots:

    This tab allows the user to add and remove time slots, define their properties as decribed in the data base.

* Constraints:

    This tab has 2 parts: 

    * Taught with: allows the user to add, remove, and configure taught with groups.

    * Co-Requisite: allows the user to add, remove, and configure co-requisites groups.

* Term Schedules:

    This tab is the primary working area for doing the schedule for a term, it starts with a master vetical layout of 2 areas:

    * The top is a small area that is the configuration areas, it has a horizontal layout that contains:

        * A Dropdown list to select existing terms to edit them, the last option in the drop down list allows the user to create a new term.

        * A Export button to download the schedules of the term to a well formated excel spreedsheet file that contains:

            Term info: semester and year

            Schedule tables, seperated by an empty row, for each table:
            
            a merged cell that has the text of weekday(s) it is scheduled on, the cell should be filled with a light gray color, and under that:

            * rooms as columns

            * time slots as rows

            * courses in cell

                * a course occupy multiple cells in a column if they occupy multiple time slots
                * color coded by instructor

    
    * The bottom area is the main area, it is broken down to 4 columns that the user can drag their edge to change their width.

        * Course List

            this is a list of courses that shows the courses in the Courses table in the data base filtered by the semester of the term. each course is a component (Let's call it Course Component) that has 4 row:

            * Code Row: composed of {Department Code} {Course Number}-{Section Number}

            * Name Row: Course Name

            * Capacity: The capacity of the course

            * Number of Sections: how many sections are needed for this term, a spin box, when the number changes, the Schedule Entries in the Term in the data base should change, and the last section in the schedule table should also be removed from the data base and front end Tables List.

            * The Course Component should be able to show a hightlight box around it, A red hightlight box should appear around the course if it has no section scheduled yet, and an orange one if not all sections needed are scheduled. The AI Agent should be able to use this highlight box when giving response to indicate which courses it is talking about (see AI Audit)

        * Tables List

            This is the place for the user to added in tables, there should be a big [+] button following the existing tables to add new ones, if there is no table in the list yet, the button naturally apears at the top of the list.
            
            each table has: 

            * Weekday check boxes

            * the table that allows the user to drag classes from the Course List to the cells of the table to schedule a course section to a room and time range. The length of the course determines how many cells it should occupy, if there is not enough time slots left or time slot is occupied by another course, the drop should fail. Each weekday in the weekdays of the table should be identitcal, meaning that there is only one table for all the weekdays in the scheduel table.

            * When a course is dropped to the table, it should not disapear from the course list, what really happens is we created a schedule table entry, and a section of a course is added, the user can drag the same course again from the course list to another slot in the same table or another schedule table to schedule another section. section starts with section 1, and then 2, 3.

            * A section that is scheduled (successfully dropped on the table) should have an instructor dropdown list that the user can assign an instructor to the course, this should be filtered by the Faculty Teaching Capability join table. Once a faculty is assigned, the section should be color coded by instructor, if no instructor is assigned yet, use a neutral color.

            * The user can also drag a course from one time slot to another in the same schedule table, or drag it from one to another scedule box.

            * The user can also press the delete button to delete a scheduled section (schedule table entry)

            * Auditor Auditing should be triggered on every drag and drop, a drag and drop that triggers a ctitical issue should fail, and a pop up on the upper right corner will show what the error is, if it is a non-critical, the issue should only apear in the warning list.

            It is imporant that the drap and drop feature is robust, be sure to keep the feature in mind since the beginning. The content of the course dragged into the table should have the same strcture as the Course Component + a instructor dropdown list.

        * Warning List

            the list of warning it founds in the current schedule by the auditors. what courses, which table, and what is the issue. this list refreshes every time a drag and drop operaion is done successfully.

        * AI Audit

            This is the fron end of the AI Agent feature which has a chat component that allows the user to chat with the Agent, it has the also the following feature:

            * the response of the agent should apear in the chat just like ChatGPT or Claude.

            * on top of the response, the agent should be able to highlight the courses it is talking about in its response.

            * the agent should be able to promote changes and ask the user to approve or not and apply the changes when approved.

