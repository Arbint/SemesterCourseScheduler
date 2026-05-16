## Remaining Questions

1. How does the Schedule Table grid actually work with multiple weekdays?
When a user creates a table with "MWF" checked and drops a course into the "9:00 AM / FH3059" cell — does that course meet on Monday, Wednesday, and Friday? Is the table a single grid representing a repeating daily pattern, or does it have separate columns per day?

    Ansser: I have addreed the issue, same layout on all selected days.

2. Frequency on courses vs. weekdays on tables — how do they interact?
A course with Frequency=2 dropped into a MWF table — is that a conflict? Does the UI prevent it? Does a conflict auditor catch it? The design needs to state what Frequency is used for during scheduling.

    Answer: yes, that would be a conflict, I have updated the app design doc.

3. CSV export with color-coding requires .xlsx, not .csv
CSV is plain text — it has no cell colors. To do "color coded by instructor" and "merged cells filled with gray," you need an Excel file (.xlsx) via a library like openpyxl. Recommend changing the export format to .xlsx.

    Answer: yes, I have addressed the issue in the app design doc.

4. Course Component instructor assignment with multiple sections
The Course Component (in the Course List) has an Instructor dropdown. But if a course has 2 sections with different instructors, the single Course Component can't represent both. Should there be one draggable item per section (so 2 draggable cards for a 2-section course), each with its own instructor dropdown?

    Answer: I have addressed the issue in the app design doc.

5. Auto Schedule is very ambitious — worth scoping early
Auto-scheduling is essentially a constraint satisfaction problem. Before implementation, it's worth defining: does it generate a complete schedule from scratch, or does it fill in unscheduled courses around existing ones? The answer significantly affects the AI agent design.

    Answser: An entire semester. I have updated the app design doc.


## Tech Stack Recommnedation:

Answer: Agreed, can you add the Recommended Tech Stack to the top of the ApplcationDesignDocument? 