# Let's alter the structure of room data.

## Important, please make sure that changing the structure of the room data will not destory the existing schedules, if you are no sure, back up the scheduler.db before you do this.

The label of the room should actually be broken down to 2 parts, the first part is the building, second is the room number.

For example, BSH 129 means the BSH building, room 129. FH 3056 means the FH building, room 3056.

Also, the building part of the label is an abbreviation, we will need to also provide a full name.

Long story short, remove the Label Attribute, and add the 3 attributes:

* Full Name (Required)
* Room Number (Required)
* Abbreviation (Can be Null)

It makes sense to use the Full Name and Room Number attributes as compositie key to ensure uniqueness (let me know if you don't think it is a good idea and why). but be sure when doing so, don't destory the existing schedule table.

In the schedule table, use the format {Abbreviation} {Room Number} as the label of the room, but if there is no Abbreviation, use the Full Name.

The existing table has all abbreviations, when you update to the new schema, use the abbreviation as the Full Name.

Change the Add and Edit UI widget to allow altering all of the 3 new attributes.