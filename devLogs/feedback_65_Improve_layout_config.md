it looks like the layout setting is still not working as intended.


## Layout alignment issue:

for the info text area, if the layout for it is set to vertical left, the user are expecting it the layout the name, rank|office, term vertcially, but they all align to the left (first character aligned to the left of the whole area)


for the info text area, if the layout for it is set to vertical left, the user are expecting it the layout the name, rank|office, term vertcially, but they all align to the left (first character aligned to the left of the whole area)


for the info text area, if the layout for it is set to vertical right, the user are expecting it the layout the name, rank|office, term vertcially, but they all align to the right (first character aligned to the right of the whole area)

for now, both of the above settings leads to the same as the vertical center.


## Layout fill vs not fill:

If the layout is not Horizontal Fill or Vertical Fill, the elements area suppose to be next to each other, not evenly spreed across the wdith, the gap between them should be determined by the padding settings (see below)

## Add padding settings

For both the Header Section Layout and Info Text Area Layout, if the layout is not Horizontal or Vertical Fill, show a padding settings to define the gap between the element. for example, if the layout of the Header Section Layout is not Horizontal Fill, a padding spin box should apear below the dropdown list, allowing the user to set a value, the value determines the fixed gap between the Header Image, Info Text Area, and Attributes (if exists). If the Info Text Area Layout is not Vertical Fill, the a padding spin box should apear below the dropdown list, allowing the user to set a value, and the value dtermines the fixed gab between the lines in the text info area.

