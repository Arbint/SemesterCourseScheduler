# Add-Keep-Change-Delete Change List Tab (feedback_42) — Build Plan

## Context

Every year the registrar sends the department a draft Excel spreadsheet containing last year's
schedule for the new term (see `devLogs/feedback_42_AddKeepChangeDeleteForm.md` and the real
sample at `srcData/Spring2027Draft.xlsx`). Before submitting the new term's schedule back to the
registrar, the chair must annotate each row as ADD/KEEP/CHANGE/DELETE relative to what's now
scheduled in the app, color-code the differences, and export a spreadsheet in the same format.
Doing this by hand is exactly the kind of comparison the app should automate. This adds a new
"Change List" tab that imports the registrar's draft, diffs it against a chosen term's live
schedule, lets the chair adjust Enrollment Max (the one DB-unmodeled, editable field), and
exports the annotated spreadsheet — plus save/load of the working state as JSON since there's no
DB persistence for this feature.

Confirmed with the user:
- **Course Comment / Taught-With**: compare *semantically* (same taught-with partner course
  present or not), not as raw text — old CRNs can never match a not-yet-issued new CRN. Generate
  new comment text as `Taught with CRN [TBD] {DEPT} {NUM} {NAME}`.
- **Save/Load Configuration**: plain browser download (`Blob` + `<a download>`) and a standard
  `<input type=file>` picker. No File System Access API / native save dialog.
- **Unmapped columns on Add rows** (Type, Inst. Method, Secondary Instructor, Waitlist Cap, Fee
  Detail, Fee Amount, Signature Restriction Code/Required, Prerequisite): left blank. Term#,
  Start Date, End Date are copied from any sibling row in the same department sheet (constant
  per term/sheet).

Real test data lines up nicely: `srcData/Spring2027Draft.xlsx` sheet `ANGD` (labeled 2027 but
holding 2026's actual schedule per the doc's convention) should be diffed against DB `Term` id 2
("spring 2027", 37 scheduled entries) — this is the real chair workflow and what I'll use to
verify end-to-end.

## Backend

### `backend/change_list.py` (new — business logic, mirrors `export.py`'s style)

- `DAY_LETTERS = {"mon":"M","tue":"T","wed":"W","thu":"R","fri":"F"}` and the reverse map (`S`/`U`
  aren't in our `WeekdayEnum` — parsed but never produced; unmatched letters are ignored on parse).
- `parse_workbook(file_bytes) -> dict[str, list[dict]]`: open with openpyxl (`data_only=True`),
  iterate `wb.sheetnames` excluding `COMPOSITE`, skip the 2 header rows, read each non-empty row
  into a dict keyed by the column schema below. Stop at first fully-blank row. Each row gets a
  stable `row_key` = `str(crn)` (CRN is always present in real data; fall back to a synthetic key
  if absent so the feature never crashes on odd input).
- Row field schema (also `OldRowOut`/`ComputedRowOut.values` shape in schemas.py):
  `term_num, start_date, end_date, crn, subject, course_number, section, course_title, type,
  inst_method, instructor, secondary_instructor, hours, enrollment_max, waitlist_cap, begin, end,
  days, bldg, rm, course_comments, prerequisite, fee_detail, fee_amount, sig_code, sig_required`.
  Dates stored as ISO strings; `begin`/`end` stay numeric HHMM.
- `entry_days(entry, table) -> list[Weekday]`: reuse the same subset rule `export.py` already
  uses (active_weekdays if non-empty & subset of table.weekdays, else table.weekdays); build the
  `days` string in fixed M/T/W/R/F order.
- `time_to_hhmm(time_str) -> int`: `int(time_str.replace(":", ""))` (TimeSlot stores `"07:30"`).
- `taught_with_partners(db, term_id, course_id) -> list[Course]`: query
  `TermTaughtWithGroup`/`TermTaughtWithMember` for this term+course, return co-members.
- `extract_taughtwith_ref(old_comment: str) -> tuple[str,int] | None`: best-effort regex
  `r'([A-Z]{2,10}[- ]?[A-Z]*)\s+(\d{3,4})'` search over the free-text old comment to pull out a
  `(dept, number)` pair for semantic comparison against the new partner course.
- `build_new_rows(db, term, department) -> list[dict]`: query `ScheduleEntry` joined `Course`
  where `dept_code == department`, `term_id == term.id`, `schedule_table_id IS NOT NULL`,
  `room_id IS NOT NULL`, has `time_slots`. Derive every field from the DB (course, section,
  room, entry_days, begin/end from first/last time slot by `display_order`, instructor as
  `"last, first"` or blank, `hours` from the course-number digit like `export.py`'s
  `_credit_hours`, taught-with comment via `taught_with_partners`). `enrollment_max` is NOT set
  here — it's resolved during diffing (see below), since its default source differs for
  matched vs. new rows.
- `diff(old_rows, new_rows, overrides: dict[str,int]) -> list[ComputedRow]`:
  - Match by `(course_number, section)`.
  - Matched pair → status `keep` or `changed`; compare `days`, `begin`, `end`, `(bldg,rm)`,
    `instructor`, taught-with semantic ref (old regex-extracted ref vs new partner's
    `(dept_code, course_number)`), and `enrollment_max` (effective = `overrides[row_key]` if
    present else the **old row's** enrollment_max — never DB-derived for matched rows). Any
    difference → `changed`, populate `changed_fields`.
  - Unmatched old row → status `delete`, values = old row untouched, `changed_fields = []`.
  - Unmatched new row → status `add`, `row_key = f"add:{course_id}:{section}"`, values from new
    row, unmapped fields blank, Term#/Start/End Date copied from any old row in the same sheet
    (or blank if the sheet was empty), `enrollment_max` effective = `overrides[row_key]` if
    present else `course.capacity`. `original_enrollment_max` in the response = that same
    default, so the reset button has something to return to.
- `to_excel(computed_rows, department, term) -> bytes`: rebuild the original template — title
  row (`"{SEMESTER} {YEAR}"` upper), the same 27-column header row, one data row per computed
  row with column A holding the literal status label (`KEEP`/`CHANGE`/`DELETE`/`ADD`). Fills per
  the doc's rule: label cell green for `keep`, label cell **and** each `changed_fields` cell
  yellow for `changed`, entire row red for `delete`, entire row green for `add`. Column widths
  sized like `export.py` already does for its sheets.

### `backend/schemas.py` (add)

- `ChangeListRowOut` — the field schema above, `model_config` allows extra-tolerant roundtrip.
- `ChangeListComputeRequest { term_id: int, department: str, old_rows: list[ChangeListRowOut],
  enrollment_overrides: dict[str, int] = {} }` (also reused as the export request body).
- `ChangeListComputedRowOut { row_key: str, status: Literal["keep","changed","delete","add"],
  changed_fields: list[str], values: ChangeListRowOut, original_enrollment_max: int | None }`.

### `backend/routers/change_list.py` (new)

- `POST /api/change-list/parse` — `UploadFile` (.xlsx) → `parse_workbook` →
  `{ departments: list[str], sheets: dict[str, list[ChangeListRowOut]] }`. Departments = sheet
  names minus `COMPOSITE`, in file order.
- `POST /api/change-list/compute` — body `ChangeListComputeRequest` → `build_new_rows` +
  `diff` → `{ rows: list[ChangeListComputedRowOut] }`. Fully stateless: the frontend always
  round-trips the old rows it's holding (from import or from a loaded config file) plus its
  current overrides map; nothing is persisted server-side.
- `POST /api/change-list/export` — same request body → `to_excel` → `Response` with
  `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` and
  `Content-Disposition: attachment` (same pattern as `chat.py`'s `/api/terms/{id}/export`).

### `backend/main.py`

- Import and `app.include_router(change_list.router)`.

## Frontend

### `frontend/src/api.ts` (add)

- Types: `ChangeListRow` (mirrors `ChangeListRowOut`), `ComputedChangeListRow`.
- `changeListApi`:
  - `parseDraft(file: File)` — `FormData` POST to `/change-list/parse`.
  - `compute(payload)` — POST `/change-list/compute`.
  - `exportXlsx(payload)` — POST `/change-list/export` with `responseType: 'blob'`, then trigger
    download via `URL.createObjectURL` + a temporary `<a>` (no existing blob-download helper in
    this codebase — the current export button just does `window.open` on a GET link, which can't
    carry a JSON body, so this is a small new but standard pattern).

### `frontend/src/tabs/ChangeListTab.tsx` (new)

State: `terms`, `selectedTermId`, `sheets: Record<string, ChangeListRow[]> | null`,
`department: string | null`, `overrides: Record<string, Record<string, number>>` (keyed by
department, then row_key), `computedRows: ComputedChangeListRow[]`, `sourceLabel` (for the Status
line — filename imported, or "Loaded config: x.json", or "No data loaded").

Layout — vertical, 3 parts per the spec, following existing tab conventions
(`page-header`/`page-content`/`card` classes from `theme.css`, dropdown patterns from
`LoadTab.tsx`):

1. **Status** — one line showing `sourceLabel`.
2. **Control bar** (horizontal, like the toolbar in `LoadTab.tsx`):
   - Term `<select>` (reuse `termsApi.list()`).
   - "Import Draft" button → hidden `<input type=file accept=.xlsx>` → `changeListApi.parseDraft`
     → sets `sheets`, resets `department` to first key, clears `overrides`, updates `sourceLabel`.
   - Department `<select>` — only rendered once `sheets` is set; options = `Object.keys(sheets)`.
   - "Save Configuration" → `Blob` of `{ department, sheets, overrides }` as JSON, download via
     `<a download="change-list-config.json">`.
   - "Load Configuration" → hidden `<input type=file accept=.json>` → parse, replace `sheets` /
     `department` / `overrides` wholesale, update `sourceLabel`.
   - "Export" button → `changeListApi.exportXlsx({ term_id, department, old_rows: sheets[department],
     enrollment_overrides: overrides[department] ?? {} })`.
3. **Table** — a `useEffect` on `[selectedTermId, department, sheets, overrides]` calls
   `changeListApi.compute(...)` (debounced ~250ms) and stores `computedRows`. Renders one
   `<table>` inside an `overflow-x:auto` wrapper, one column per field in the row schema.
   - **Highlighting rule** (reconciling the doc's two descriptions — "give the label cell a
     green/red background" under the Excel process vs. "highlighting method should be drawing a
     colored outline on the cell" under the Table UI section): on screen, every place the process
     description says a cell/row gets a *background* color, the Table instead gives that cell a
     colored *outline* (border), so the underlying values stay legible while the chair is working.
     Concretely: `keep` → outline the label cell green; `changed` → outline the label cell **and**
     each cell named in `changed_fields` yellow; `delete` → outline every cell in the row red;
     `add` → outline every cell in the row green.
   - Enrollment Max column: a number `<input type=number>` (spin box) bound to the effective value
     from `computedRows[i].values.enrollment_max`, plus a small reset button enabled only when
     `overrides[department]?.[row_key]` is set, resetting by deleting that override key (falls
     back to `original_enrollment_max`). Editing updates `overrides` state → triggers recompute →
     row flips keep⇄changed automatically since the backend owns that logic.
   - Every other cell is read-only display.

### `frontend/src/App.tsx`

- Add `{ id: 'changelist', label: 'Change List' }` to `TABS`.
- Add `{tab === 'changelist' && <ChangeListTab />}` in the render block (simple mount/unmount is
  fine here, unlike the schedules tab — no chat history to preserve).

## Verification

1. Backend: start uvicorn, `curl -F file=@srcData/Spring2027Draft.xlsx` to `/api/change-list/parse`,
   confirm `ANGD` appears with ~20 rows; POST `/api/change-list/compute` with `term_id=2,
   department=ANGD` (DB term id 2 = "spring 2027", the one with 37 scheduled ANGD-heavy entries)
   and eyeball a mix of `keep`/`changed`/`delete`/`add` in the response; hit `/export` and open
   the resulting `.xlsx` to confirm the label column and fills look right.
2. Frontend: run both dev servers, open the new "Change List" tab, import
   `srcData/Spring2027Draft.xlsx`, pick term "Spring 2027" and department `ANGD`, confirm the
   table populates with colored outlines; edit an Enrollment Max spin box and watch a `keep` row
   flip to `changed` (and back on reset); Save Configuration, reload, Load Configuration and
   confirm identical state restores; click Export and open the downloaded file.
