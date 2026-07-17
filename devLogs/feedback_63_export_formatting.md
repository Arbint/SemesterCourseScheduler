Let's alter the formatting of the exported pdf of the room and faculty scheudle better.

# Info Section
Let's call the part that is on the top before the table the info section.

the info section has:

* the header image

* the info area (faculty/room name, faculty rank, attribute, etc)

for the header section, add a Layout dropdown list with a few options that would affect how the header image and the info area is arranged:

* Vertical Center (What we are having now)
* Vertical Left (place all items vertically, and align to the left)
* Vertical Right (place all items vertically, and align to the right)
* Horizontal Center (place all items horizontally, and align to the center)
* Horizontal Left (place all items horizontally, and align to the left)
* Horizontal Right (place all items horizontally, and align to the right)

Note that the info area should be treated as one element when it comes to the layout, the Layout dropdown options only affect how the header image and the info area are layed out, the elements in the info area should always be vertically arranged, with only one exception: the attriute icon of the faculty should be layed out vertically on the right of the other fauclty info.

Add a header section size control to allow the user to scale the vertical size of the header section.

# Table Section

The table part is the table section, we need the following change:

* if a time range is completely empty for whole week for the fauclty table, remove that time range.

* for the office hours, give them a light green background, a welcoming color for student to come.

* for other empty areas in the faculty table, make the background white.

# Footer Section

* add a footer section size control to allow the user to scale the vertical size of the footer section.
