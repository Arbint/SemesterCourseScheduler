import io
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import TABLOID, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import Paragraph, SimpleDocTemplate, Table, TableStyle
from sqlalchemy.orm import Session

from models import Room, Term, TimeSlot, Weekday

WEEKDAY_FULL = {"mon": "Monday", "tue": "Tuesday", "wed": "Wednesday", "thu": "Thursday", "fri": "Friday"}

TIME_COL_WIDTH = 1.1 * inch
PAGE_WIDTH = landscape(TABLOID)[0]
MARGIN = 0.5 * inch


def _term_label(term: Term) -> str:
    label = f"{term.semester.name.value.capitalize()} {term.year}"
    return f"{label} {term.name}" if term.name else label


def build_door_tag_grid(db: Session, term: Term, room: Room):
    """Projects every ScheduleEntry in `room` for `term` onto a
    weekday x time-slot grid. A multi-slot entry occupies the cell at its
    first slot with a 'span' count; the slots it covers are marked
    "COVERED" so the caller can merge/skip them (mirrors the rowSpan
    handling in the frontend's ScheduleTableView).

    Weekdays and time slots are global reference data (not term-scoped), so
    they're pulled directly from those tables rather than from whatever
    happens to be booked — an empty room still gets a full blank template.
    """
    weekdays = db.query(Weekday).order_by(Weekday.display_order).all()
    time_slots = db.query(TimeSlot).order_by(TimeSlot.display_order).all()
    slot_index = {ts.id: i for i, ts in enumerate(time_slots)}

    grid: dict[int, list] = {w.id: [None] * len(time_slots) for w in weekdays}

    for table in term.schedule_tables:
        table_weekday_ids = [w.id for w in table.weekdays]
        for entry in table.entries:
            if entry.room_id != room.id or not entry.time_slots:
                continue
            slot_ids = sorted((ts.id for ts in entry.time_slots), key=lambda sid: slot_index[sid])
            start_idx = slot_index[slot_ids[0]]
            span = len(slot_ids)
            course = entry.course
            faculty = entry.faculty
            display = {
                "title": f"{course.dept_code} {course.course_number} §{entry.section}",
                "name": course.course_name,
                "instructor": f"{faculty.last_name}, {faculty.first_name}" if faculty else "No instructor",
            }
            for wid in table_weekday_ids:
                if wid not in grid:
                    continue
                grid[wid][start_idx] = {"entry": display, "span": span}
                for i in range(start_idx + 1, start_idx + span):
                    if i < len(grid[wid]):
                        grid[wid][i] = "COVERED"

    return weekdays, time_slots, grid


def generate_door_tag_pdf(db: Session, term: Term, room: Room, empty_label: str) -> bytes:
    weekdays, time_slots, grid = build_door_tag_grid(db, term, room)

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=landscape(TABLOID),
        leftMargin=MARGIN, rightMargin=MARGIN, topMargin=MARGIN, bottomMargin=MARGIN,
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle("DoorTagTitle", parent=styles["Title"], alignment=TA_CENTER, fontSize=26)
    subtitle_style = ParagraphStyle(
        "DoorTagSubtitle", parent=styles["Normal"], alignment=TA_CENTER, fontSize=14,
        textColor=colors.HexColor("#444444"), spaceAfter=16,
    )
    header_style = ParagraphStyle(
        "CellHeader", parent=styles["Normal"], fontSize=11, alignment=TA_CENTER,
        textColor=colors.white, fontName="Helvetica-Bold",
    )
    time_style = ParagraphStyle("TimeCell", parent=styles["Normal"], fontSize=10, alignment=TA_CENTER, fontName="Helvetica-Bold")
    cell_body_style = ParagraphStyle("CellBody", parent=styles["Normal"], fontSize=9.5, alignment=TA_CENTER, leading=13)
    empty_style = ParagraphStyle("EmptyCell", parent=styles["Normal"], fontSize=11, alignment=TA_CENTER, textColor=colors.HexColor("#999999"))

    elements = [
        Paragraph(escape(room.display_label), title_style),
        Paragraph(escape(f"{_term_label(term)} Schedule"), subtitle_style),
    ]

    if not weekdays or not time_slots:
        elements.append(Paragraph("No schedule data available for this room/term.", styles["Normal"]))
        doc.build(elements)
        return buf.getvalue()

    header_row = [Paragraph("Time", header_style)] + [
        Paragraph(WEEKDAY_FULL.get(w.name.value, w.name.value), header_style) for w in weekdays
    ]
    data = [header_row]
    span_commands = []
    for r, ts in enumerate(time_slots):
        row = [Paragraph(escape(ts.label), time_style)]
        for c, w in enumerate(weekdays):
            cell = grid[w.id][r]
            if cell == "COVERED":
                row.append("")
                continue
            if cell is None:
                row.append(Paragraph(escape(empty_label), empty_style))
                continue
            entry = cell["entry"]
            span = cell["span"]
            title = escape(entry["title"])
            name = escape(entry["name"])
            instructor = escape(entry["instructor"])
            text = f"<b>{title}</b><br/>{name}<br/>{instructor}"
            row.append(Paragraph(text, cell_body_style))
            if span > 1:
                span_commands.append(("SPAN", (c + 1, r + 1), (c + 1, r + span)))
        data.append(row)

    day_col_width = (PAGE_WIDTH - 2 * MARGIN - TIME_COL_WIDTH) / len(weekdays)
    col_widths = [TIME_COL_WIDTH] + [day_col_width] * len(weekdays)
    table = Table(data, colWidths=col_widths, repeatRows=1)

    style_commands = [
        ("GRID", (0, 0), (-1, -1), 0.75, colors.HexColor("#888888")),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#333333")),
        ("BACKGROUND", (0, 1), (0, -1), colors.HexColor("#eeeeee")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ] + span_commands
    table.setStyle(TableStyle(style_commands))

    elements.append(table)
    doc.build(elements)
    return buf.getvalue()
