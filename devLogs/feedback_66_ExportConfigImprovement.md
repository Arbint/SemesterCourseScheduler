## Font Size

Add controls to the size of the font for exporting.

This should have:

* Name Font Size: The font size for the door/faculty Name
* Info Font Size: The font size for the info like professor rank.
* Semester Font Size: The font size for the semester.
* Table font size: The font size of the table.

## Always Horizontal Fill
For each of the items in the header section:

* Header Image
* Header Text Area
* Attribute Icon (if exists)

make sure they are scale uniformly to fill the header areas ssize defined in Header Size. The attribute Icon for example, is too small. For the text, the font size should be overritten propotionally to each other to fill the horizontal size of the header section exactly. for example, if the Name Font is 2, and the info Font is 1, but their conbined horizontal size is twice as big as the horizontal size, then the Name Font will be scaled down to 1, and the info font size will be scaled down to 0.5.


## Preview.

Add a preview section nested inside and at the bottom of the Export Configuration Section, this preview section should be collapsable.

The preivew section has the following components:

* a drop down list to allow the user to select which table to preivew. (add search capability)

* A preview of how the pdf looks like. 

What ever that is changed in the Export Configuration should trigger the preview to update.




