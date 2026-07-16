Create another tab called door tags.

This part should just be reading the database, and generate a room schedule.

It's structure is:

On the top, a configure row that has the following settings layed out horizontally:

* Term selection, be sure to add a search functionality.
* Room Selection, be sure to add a search functionality.
* A text field with the label: Empty Slot Label.
* An Export button that would export the result as a well formated pdf that can be printed out on a tabloids sized paper.

Below the configure row, show a table that displays the schedule of the selected room in the selected term:

    * The rows are time slots, using the same time slot defined in the data base.
    * The colums are weekdays (Mon - Sun)

    Each cell should contain:

        * The schedule course if exist in the data base.
        * If no course is scheduled in a cell, mark it with what is in the Empty Slot Label text field.
    
