The Agent might need more context, here is one of our conversation:
hi
Hi there! 👋 I'm your academic schedule assistant. I can help you:

📋 Summarize the current semester schedule
🔍 Audit for issues like long days, big gaps, or unbalanced faculty loads
✏️ Propose changes like reassigning faculty or moving courses
🤖 Auto-schedule an entire semester automatically
What would you like to do today?

any problems with my spring 2027 schedule?
Here's a full audit of your Spring 2027 schedule. I found several issues across four categories:

🔴 Unscheduled Courses
Two courses have no time, room, or faculty assigned and won't appear in the student schedule:

Course	Section
ANGD3315 Visual Narrative Conventions	1
ANGD4305 Senior Portfolio	1
🔴 Overloaded Faculty
Faculty	Sections	Full Load
Emily Sidler	5	4
Emily is teaching ANGD1315 Principles of Animation (×2), ANGD2342 Animation II, ANGD2355 Animation Pipeline, and ANGD4140 Senior Thesis Workshop — one section over her full load.

⚠️ Additionally, on Tuesday/Thursday, Emily has three sections back-to-back (12:00 PM, 1:30 PM, and 1:30 PM simultaneously) — ANGD2342 and ANGD2355 are scheduled at the exact same time (1:30–4:15 PM on Tue/Thu). This appears to be a direct conflict for Emily.

🟡 Underloaded Faculty
Several instructors are significantly below their full load:

Faculty	Sections	Full Load	Gap
Justin Gallardo	3	5	−2
Randall Rudd	2	4	−2
Adam Blair	3	4	−1
Isaac Herrera	1	3	−2
Alessandro Dady	1	3	−2
Adam Watkins	1	2	−1
Nathan Sumsion	1	2	−1
William Watkins	1	2	−1
Michael Choi	1	2	−1
Joshua Starrett	1	2	−1
This is likely connected to the two unscheduled courses and Emily's overload — some of these instructors could absorb those sections.

🟡 Unbalanced Load
The standard deviation of section counts across faculty is high, driven by the overload/underload spread above. Reassigning Emily's extra section and scheduling the two missing courses to underloaded faculty would help significantly.

✅ No Long Days or Big Gaps Detected
No faculty appear to have 3+ classes on the same weekday or 3+ empty slots between classes.

Recommended Next Steps
Schedule ANGD3315 and ANGD4305 immediately — would you like me to auto-schedule just those, or assign them manually?
Resolve Emily Sidler's conflict — ANGD2342 and ANGD2355 overlap on Tue/Thu. One should be moved or reassigned.
Reassign one of Emily's sections to an underloaded instructor (e.g., Isaac Herrera or Alessandro Dady).
Would you like me to propose any of these fixes?

interesting, the Visual Narrative Conventions and Senior Portfolio are fall semester classes, I am asking about spring 2027
That's a fair clarification! Those two courses being fall-only explains why they're unscheduled — no action needed there.

That said, the other issues I found are still valid for Spring 2027:

🔴 Emily Sidler — Overloaded + Scheduling Conflict
5 sections vs. full load of 4
ANGD2342 Animation II and ANGD2355 Animation Pipeline are scheduled at the exact same time (Tue/Thu 1:30–4:15 PM) — she cannot teach both simultaneously.
🟡 Underloaded Faculty
Many instructors are below their full load (Justin Gallardo −2, Randall Rudd −2, Isaac Herrera −2, Alessandro Dady −2, etc.), which could absorb a reassignment from Emily.

🟡 Unbalanced Load
The wide spread between Emily (5) and several single-section instructors drives a high standard deviation.

Would you like me to:

Propose a fix for Emily's time conflict (move one of her two overlapping courses)?
Reassign one of Emily's sections to an underloaded instructor?
Both?

Looks like the AI is not aware of:

* Course has assigned semesters, not need to worry about scheduling them if they are not in the semester in question.
* Taught with courses are counted as 1 course, not counted as 2 loads.
* Load Rules
    * Full time faculty has a standard 3 loads as full load.
    * Part time don't have under load, but they can teach up to 2 courses maximum.

Please create an agent/context/context.md file that contains these infomation, and be sure that the info in that file is loaded in the system prompt to the AI agent.