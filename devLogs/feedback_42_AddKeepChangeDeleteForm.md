# The Add-Keep-Change-Delete Table Export

Add a "Change List Generation" Tab.

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

        * Here are some explinations for some of the columns:   

            * for the Start and End column, the time there is the start and end time of the day the corse is offered, in a numbered format where the lowest 2 digits are the mintues, and the higher digits after the lowest 2 are the hours of the day, for example, 1630 means 16:30 or 4:00 PM. 730 means 7:30 AM.

            * Some course title might be shortened, abbreviated, the best way to identify a course is to use it's CRSE# (course number), so the following 2 courses are the same course event their name are slightly different, but they have the same numer:
            
                * ANGD 4340 Business of Animation and Game Design (from our data base)
                * ANGD 4340 Bus of Animation/Game Design (from the excel spreedsheet)

            * CRN this does not exist in our data base, the are unique per section per course, theoritically, course number + section number gives the same level of uniqueness. This is not to be changed.

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

                * Bldg is the building, abbreviated, AD means Admin Building, FH meand Founders Hall, this should match the building code of the data base.
                * RM is the room number of the building

            * Course Comment is used to add comments, most of the time, we simply provide Taught with info. for example, ANGD 2342 Animation II: Animation for Games is taught with ANGD 2355 Animation Pipeline, so in the Course Comment of ANGD 2342 Animation II, we will need to write: Taught with CRN {CRN number of ANGD 2355 Animation Pipeline} ANGD 2355 Animation Pipeline. At the same time, in the Course Comment of ANGD 2355 Animation Pipeline, we will need to write: Taught with CRN {CRN number of ANGD 2342 Animation II: Animation for Games}. The basic rule is, if Course A is Taught with Course B, then in the Course Comment of Course A, We will need to write Taught with Course B (including CRN and then Course Code + Name), and in the Course Comment of Course B, we will need to write Taugth with Course A.

            * Enrollment Max, the max amount of student is allowed in the section, we do not have that attribute in our data base.

            * The prerequisite is not to be changed, they are curriculumn level constants, and can only be changed through proposals to the curriculum committee, the same goes to all the other columns after it.


### Chagne List Generation Process

After the department finished scheduling their course for the new term, they will need to:

* Compare the new schedule with the provided excel spreedsheet (which contains the shedule of the term in the previous year)

* In the first column of the spreedsheet (ADD/KEEP/CHANGE/DELETE), add label based on the difference it has with the old schedule:

    * If the section is offer at the same weekdays, same begin and end time, room, instructor, course comment, label it as Keep, and give the label cell (the first column) a green background.

    * If the section is changed on any of these: weekdays, begin and end time, room, instructor, course comment. label it as changed, only give the label cell (the first column) and the changed cells a yellow background, this is to clearly indicate what is changed.

    * If the section is no longer offered, label it as Delete, and give the entire row a red background (don't delete the row)

    * If there is a new section that does not exist on the sheet, create a new row and populate with the info of the new course, and give the entire row a green background.


## The strcuture and functionality of the Add-Keep-Change-Delete tab:

* The tab should have a verical main layout, which has 3 parts:
    * Stats
        * Shows which spreedsheet / saved configuration is loaded.

    * Contol

        * the control part is a horizonal layout that has:

            * A schedule drop down for the user to pick what term schedule to work with. (the new schedule)

            * an "Import Draft" button, when clicked, it promotes the use to load the excel speedsheet. (the old schedule). Importing another draft will clear the preivously one, discard the old schedule data loaded from the Load Configuration button, and the table shall be re-evaluated based on the data imported from the spreedsheet.

            * a department dropdown, this is available when the spreedsheet is read, and it should be a list of department for the user to pick, based on the sheets in the excel spreedsheet excluding the COMPOSITE one. (ie., ANGD, COMM-FILM)

                * The user should pick one, and the tool should also only work on/change the sheet of that one department.

            * a "Save Configuration" button. this will save the states of the current configuration (what is set in the Table) as a json file (promote the user to specify where to save it), it should have the full record on:

                * the full content of the imported excel spreedsheet. 
                * the changes the user has mannually done in the Table (ie., the Enrollment Max, see Table below).

            * a "Load Configuration" button, allows the user to load the saved configuration and recreated the table to the same state as it was saved. Loading will discared the imported excel spreedsheet if exists, and use the data recorded in the loaded json file as the old schedule.

            * an Export button to export the result as an excel spreedsheet. This excel spreedsheet should be the resulting excel spreedsheet described in the Change List Generation Process.


    * Table

        * This table should be auto populated based on the Change List Generation Process described in the Background section.

        * this table should contain rows:

            * Each row is a course that mimicing the same structure as the origional excel spreedsheet rows, and each cell should be highlighted (or not) based on the rules in the Change List Generation Process (what background color they should have), the highting method should be drawing a colored outline on the cell.

            * Most of the parts should be automatically configured based on the Chagn eList Generation Process, and should not be changed. However, there is one thing the user can ajust here:

                * The Enrollment Max:

                    * Then Enrollment max should be another attribute that determines if a course is a Keep or Changed course. It should be a spin box that the user can click to change the value, and there should be a reset button that the user can click to reset to back to the original value from the imported spreedsheet. If the value is changed and not the same as the original value, this component should be highlighted as yellow. and the first cell should also become Changed if it was Keep. If the value is changed back to the original value, then the first cell should also change back to Keep if there is no other changes in the course. Long story short, always respect the Add/Keep/Change/Delete labeling rule.
