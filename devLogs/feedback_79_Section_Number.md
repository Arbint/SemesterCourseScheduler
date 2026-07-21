If you look at the sections in the schedule with the name: Spring 2027 V2

You will realize that Both sections of ANGD 1312 Hardsurface Modeling is labeled as section 2.

That is really confusing.

Let's fix that so that if a course has many sections scheduled, their section numbers should be unique and starts with 1.

Also, allow the user to change the section number to any number they want.

Add a section auditor that will throw out the following error in the Issues list:

* An Error when there are more sections scheduled than needed

* An Error if schedued section numbers are not:

    * starting from 1
    * has gaps (if we scheduled section 1, 3, 4, but missing 2)

* An Error if a section number is used by more than 1 sections.
