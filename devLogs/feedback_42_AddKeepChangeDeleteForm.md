# The Add Keep Change Delete Table Export

Add a Generate Change List button next to the Export Button in the Term Schedules table. When the button clicked, it will generate a change list in a form of xlsx.

## Background:
This feature is required to interface with the university system.

Every year, when each department is asked to schedule their courses for a new term, the registrar send out an excel spreedsheet to the school, the excel spreedsheet contains the list of the courses offered in the term of the previous year, for example, if I am asked to schedule for spring 2027, the excel will contain the courses offered in spring 2026.

An example of such excel spreedsheet drafted for spring 2027 (which contains the scheduled courses in spring 2026) is located at:

srcData/Spring2027Draft.xlsx

The structure of this spreedsheet is:

* There are multiple sheet in the file, each one represent a department, like ANGD, COMM-FILM, FMGT, and also a COMPOSITE that contains every ones.

    * Each sheet contains the list of courses scheduled in the preivous year. 

        * Each row in the sheet represent one scheduled section of a course.

        * Each column is one attribute of a course. (note, even the start and end dates are label as 2027, the data is pulled from 2026, under the asumption that 2027 will have the same courses)

        * Some explainations for abbreviatrions:   

            * for the Start and End column, the time there is the start and end time of the day the corse is offered, in a numbered format where the lowest 2 digits are the mintues, and the higher digits after the lowest 2 are the hours of the day, for example, 1630 means 16:30 or 4:00 PM. 730 means 7:30 AM.

            * Some course title might be shortened, abbreviated, the best way to identify a course is to use it's CRSE# (course number), so the following 2 courses are the same course event their name are slightly different, but they have the same numer:
            
                * ANGD 4340 Business of Animation and Game Design (from our data base)
                * ANGD 4340 Bus of Animation/Game Design (from the excel spreedsheet)

            * Days column is the weekdays the section is offered, one letter means it is offered only in one of the weekdays, if it has n letters, it means it's offered in n days throughout the week, for example:

                - M means Mondays
                - T means Tuesdays
                - W means Wednesdays
                - R means Thursdays
                - F means Fridays
                - S means Saturdays
                - U means Sundays
                - TR means Tuesdays and Thrusdays
                - MW means Mondays and Wednesdays
                - TF means Tuesdays and Fridays
                - MWF means Monday, Wednesdays and Fridays.

            * Rooms, the room info of the schedule is broken down to 2 pieces:

                * Bldg is the building, abbreviated, AD means Admin Building, FH meand Founders Hall

                * RM is the room number of the building


After the department finished scheduling their course for the new term, they will need to:

* Compare the new schedule with the provided excel spreedsheet (which contains the shedule of the term in the previous year)

* In the first column of the spreedsheet (ADD/KEEP/CHANGE/DELETE), add label based on the difference it has with the old schedule:

    * If the section is offer at the weekdays, same begin and end time, room, instructor, 