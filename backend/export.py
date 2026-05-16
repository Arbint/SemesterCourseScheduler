import io
from openpyxl import Workbook
from openpyxl.styles import PatternFill, Font, Alignment, Border, Side
from openpyxl.utils import get_column_letter

PASTEL_COLORS = [
    "FFB3BA", "FFDFBA", "FFFFBA", "BAFFC9", "BAE1FF",
    "E8BAFF", "FFBAF3", "BAF7FF", "D4FFBA", "FFD9BA",
    "C9BAFF", "FFBAD9",
]

LIGHT_GRAY = "D3D3D3"
HEADER_GRAY = "A0A0A0"


def _faculty_color(faculty_id: int | None) -> str:
    if faculty_id is None:
        return "E0E0E0"
    return PASTEL_COLORS[faculty_id % len(PASTEL_COLORS)]


def generate_excel(db, term_id: int) -> bytes:
    from models import Term, TimeSlot, Room

    term = db.query(Term).filter(Term.id == term_id).first()
    if not term:
        raise ValueError("Term not found")

    wb = Workbook()
    ws = wb.active
    ws.title = "Schedule"

    time_slots = db.query(TimeSlot).order_by(TimeSlot.display_order).all()
    rooms = db.query(Room).order_by(Room.label).all()

    if not time_slots or not rooms:
        ws["A1"] = "No data"
        buf = io.BytesIO()
        wb.save(buf)
        return buf.getvalue()

    row = 1

    # Term header
    term_label = f"Term: {term.semester.name.value.capitalize()} {term.year}"
    ws.merge_cells(start_row=row, start_column=1, end_row=row, end_column=len(rooms) + 1)
    cell = ws.cell(row=row, column=1, value=term_label)
    cell.font = Font(bold=True, size=14)
    cell.alignment = Alignment(horizontal="center")
    row += 1

    for table in term.schedule_tables:
        row += 1  # empty row between tables

        # Weekday header row
        weekday_names = " / ".join(w.name.value.capitalize() for w in sorted(table.weekdays, key=lambda w: w.display_order))
        ws.merge_cells(start_row=row, start_column=1, end_row=row, end_column=len(rooms) + 1)
        wd_cell = ws.cell(row=row, column=1, value=weekday_names)
        wd_cell.fill = PatternFill(fill_type="solid", fgColor=LIGHT_GRAY)
        wd_cell.font = Font(bold=True)
        wd_cell.alignment = Alignment(horizontal="center")
        row += 1

        # Column headers: Time Slot | Room1 | Room2 | ...
        ws.cell(row=row, column=1, value="Time Slot").font = Font(bold=True)
        for col_idx, room in enumerate(rooms, start=2):
            ws.cell(row=row, column=col_idx, value=room.label).font = Font(bold=True)
        row += 1

        table_start_row = row

        # Map time_slot_id -> row index within this table
        slot_row_map = {ts.id: table_start_row + i for i, ts in enumerate(time_slots)}

        # Write time slot labels
        for i, ts in enumerate(time_slots):
            ws.cell(row=table_start_row + i, column=1, value=ts.label)

        # Write entries
        room_col_map = {r.id: col_idx for col_idx, r in enumerate(rooms, start=2)}

        for entry in table.entries:
            if not entry.room_id or not entry.time_slots:
                continue
            col = room_col_map.get(entry.room_id)
            if col is None:
                continue

            entry_slots = sorted(entry.time_slots, key=lambda ts: ts.display_order)
            if not entry_slots:
                continue

            first_slot = entry_slots[0]
            last_slot = entry_slots[-1]
            start_r = slot_row_map.get(first_slot.id)
            end_r = slot_row_map.get(last_slot.id)
            if start_r is None or end_r is None:
                continue

            course = entry.course
            text = f"{course.dept_code} {course.course_number}\n{course.course_name}"
            if entry.faculty:
                text += f"\n{entry.faculty.last_name}"

            fill_color = _faculty_color(entry.faculty_id)
            fill = PatternFill(fill_type="solid", fgColor=fill_color)

            if start_r == end_r:
                c = ws.cell(row=start_r, column=col, value=text)
                c.fill = fill
                c.alignment = Alignment(wrap_text=True, vertical="center")
            else:
                ws.merge_cells(start_row=start_r, start_column=col, end_row=end_r, end_column=col)
                c = ws.cell(row=start_r, column=col, value=text)
                c.fill = fill
                c.alignment = Alignment(wrap_text=True, vertical="center")

        row = table_start_row + len(time_slots)

    # Auto-size columns
    ws.column_dimensions["A"].width = 22
    for col_idx in range(2, len(rooms) + 2):
        ws.column_dimensions[get_column_letter(col_idx)].width = 20

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()
