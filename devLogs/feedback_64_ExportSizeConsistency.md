Let's alter the structure of the exported schedule PDFs, and how we control their layout.

For the layouts configurations, let's create a collapsable area called print configuration, and move the Header Image, Footer Image, Head Size, Footer Size the Layout settings, and all addtionaly settings and displays requested inside.

## Orientation:

* Add a orientation setting to allow the pdf to be configured in either horizontal or veritcal orientation for printing. 

## Size:

* Add common sizes:

    * A4
    * Letter
    * Tabloid
    * ... (other common print sizes)
    * Custom Size (width and height in inches)

## Header Section Redefination:

The header section will have these 3 items:

* Header Image.

* Info Text Area. (faculty/room name, faculty rank, semester, etc)

* Attribute Icon Area. (only avaialbe for faculty schedule export)

Let's alter the Layout settings to have 8 options in total:

* Vertical Center (What we are having now)
* Vertical Left (place all items vertically, and align to the left)
* Vertical Right (place all items vertically, and align to the right)
* Vetical Fill (place all items vertically, and span them to fill the entire width)
* Horizontal Center (place all items horizontally, and align to the center)
* Horizontal Left (place all items horizontally, and align to the left)
* Horizontal Right (place all items horizontally, and align to the right)
* Horizonal Fill (place all items horizontally, and span them to fill the entire width)

There should be 2 Layout Dropdown list settings.

* Header Section layouts

    * Controls the layout between the 3 items of the Header section (the overall layout)

* Info Text Area Layout

    * Controls the layout within the elements of the Info Text Area.

## Presets.

* Add a layout preset table to the data base.

* in the front end Add a save layout button on the top of the print configurations section, a pop up will show up to ask for the name of the layout to be saved before saving.

* on the left of the save layout button, add a preset dropdown for the user to select a list of presets saved previously.
