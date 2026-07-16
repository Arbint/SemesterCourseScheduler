I will want to create multiple versions of the schedule.

Let's alter the data base so that each Term has one additional Name attribute.

This should allow me to create multiple versions of a term, for example, for the Spring 2027 term, I should be able to create:

Spring 2027 V1 (the V1 part is the name)
Spring 2027 V2-BetterLoads (the V2-Better loads is the name)

## Backend Change:

I am not sure what the current strucutre of a term in the data base is, but the ApplicationDesignDocument says:

Each term is composed with four components

* Semseter
* Year (2025, 2026 ...)
* Schedule Tables (see schedule tables below)
* Schedule Entries (see Schedule Entries)
    * When a term is created, it should auto populate a schedule entire for each of the course that is supose to be offered in the semster the term is at. a course might need more sections, and that is added by the frontend (see Course List in Frontend)


If they have a unique ID keys (please verify that), then all I am asking is adding one more string attribute called Name. I

The Name attribute can be empty, all the existing ones would be empty at the moment.

If they are identitfied with composit keys from the Semeseter and Year, then you will need to alter that because the combination of the 2 wouldn't be unique, and maybe a unique key for them would be better.

Whatever you do, don't destroy existing term schedules!!!


## Frontend.

On the front end, add the following features to the Term Schedules tab:

* When creating a new term, in the pop up. add:

    * Name field for the user to define the name of the new field.

    * Duplicate From, this one should be a dropdown list that the user can pick an existing schedule, or None. If an exisitng schedule is set in the Duplicate from dropdown list, the newly created term will duplicate the data from it so the user can use that as the starting point.

    * Add a rename button brefore the Export Button allowing the user to change the name of the term.


```IMPORTANT``` always keep the existing terms, don't destroy them, if you are not sure, backup the database before making the change.

