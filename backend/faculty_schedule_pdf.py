import io
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import TABLOID
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.lib.utils import ImageReader
from reportlab.platypus import Image, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from sqlalchemy.orm import Session
from svglib.svglib import svg2rlg

import door_tag_assets as assets
import faculty_attribute_assets as attr_assets
from door_tag_pdf import (
    PAGE_WIDTH, PAGE_HEIGHT, MARGIN, TIME_COL_WIDTH, TICK_MINUTES,
    WEEKDAY_ROW_HEIGHT, HEADER_IMAGE_MAX_HEIGHT, FOOTER_IMAGE_MAX_HEIGHT, SECTION_GAP,
    GRID_LINE_COLOR, ENTRY_EDGE_COLOR, EMPTY_BG_COLOR, CELL_INSET, MEETING_COLOR,
    WEEKDAY_FULL, _entry_color, _merge_empty_runs, _term_label, _parse_hhmm, _format_clock,
    _fit_image_band, _make_card,
)
from models import Faculty, Term, TimeSlot, Weekday

RANK_LABELS = {
    "instructor": "Instructor",
    "senior_instructor": "Senior Instructor",
    "assistant_professor": "Assistant Professor",
    "associate_professor": "Associate Professor",
    "professor_of_practice": "Professor of Practice",
    "professor": "Professor",
}

OFFICE_HOURS_COLOR = "#f0c96e"

# Generous fixed budget for the name/rank-office/term-label block above the
# grid — mirrors how door_tag_pdf's TITLE_HEIGHT covers title+subtitle
# together rather than budgeting each paragraph separately.
INFO_BLOCK_HEIGHT = 0.95 * inch
ICON_SIZE = 0.32 * inch
ICON_ROW_HEIGHT = 0.5 * inch


def _requires_department_meeting(faculty: Faculty) -> bool:
    return faculty.is_department_owned and faculty.full_time_or_part_time.value == "full_time"


def build_faculty_schedule_grid(db: Session, term: Term, faculty: Faculty):
    """Same tick-grid approach as build_door_tag_grid, scoped to one faculty's
    own courses, their department meeting (only if actually required — see
    _requires_department_meeting), and their office hours (free-form times,
    projected directly onto the tick grid without going through time slots)."""
    weekdays = db.query(Weekday).order_by(Weekday.display_order).all()
    time_slots = db.query(TimeSlot).order_by(TimeSlot.display_order).all()

    office_hours = [oh for oh in term.office_hours if oh.faculty_id == faculty.id]

    day_bounds = [(_parse_hhmm(ts.start_time), _parse_hhmm(ts.end_time)) for ts in time_slots]
    day_bounds += [(_parse_hhmm(oh.start_time), _parse_hhmm(oh.end_time)) for oh in office_hours]
    if not day_bounds:
        return weekdays, [], {}

    day_start = min(b[0] for b in day_bounds)
    day_end = max(b[1] for b in day_bounds)
    day_start -= day_start % TICK_MINUTES
    if day_end % TICK_MINUTES:
        day_end += TICK_MINUTES - day_end % TICK_MINUTES
    num_ticks = (day_end - day_start) // TICK_MINUTES
    ticks = [day_start + i * TICK_MINUTES for i in range(num_ticks)]

    grid: dict[int, list] = {w.id: [None] * num_ticks for w in weekdays}

    def place(wid, start_min, end_min, display):
        if wid not in grid:
            return
        start_idx = (start_min - day_start) // TICK_MINUTES
        span = max(1, -(-(end_min - start_min) // TICK_MINUTES))  # ceil div
        if start_idx < 0 or start_idx >= num_ticks:
            return
        if grid[wid][start_idx] is not None:
            return  # already occupied — shouldn't happen given conflict validation
        grid[wid][start_idx] = {"entry": display, "span": span}
        for i in range(start_idx + 1, start_idx + span):
            if i < num_ticks:
                grid[wid][i] = "COVERED"

    requires_meeting = _requires_department_meeting(faculty)

    for table in term.schedule_tables:
        table_weekday_ids = [w.id for w in table.weekdays]
        for entry in table.entries:
            if not entry.time_slots:
                continue
            is_own_course = entry.course_id and entry.faculty_id == faculty.id
            is_required_meeting = entry.meeting_id and requires_meeting
            if not is_own_course and not is_required_meeting:
                continue
            entry_start = min(_parse_hhmm(ts.start_time) for ts in entry.time_slots)
            entry_end = max(_parse_hhmm(ts.end_time) for ts in entry.time_slots)
            time_range = f"{_format_clock(entry_start)} to {_format_clock(entry_end)}"
            if entry.course_id:
                course = entry.course
                display = {
                    "title": f"{course.dept_code} {course.course_number} Sec {entry.section}",
                    "name": course.course_name,
                    "instructor": "",
                    "time_range": time_range,
                    "color": _entry_color(course.id),
                }
            else:
                display = {
                    "title": entry.meeting.name,
                    "name": "Meeting",
                    "instructor": "",
                    "time_range": time_range,
                    "color": colors.HexColor(MEETING_COLOR),
                }
            active_wids = [w.id for w in entry.active_weekdays] or table_weekday_ids
            for wid in active_wids:
                place(wid, entry_start, entry_end, display)

    for oh in office_hours:
        start_min = _parse_hhmm(oh.start_time)
        end_min = _parse_hhmm(oh.end_time)
        display = {
            "title": "Office Hours",
            "name": "",
            "instructor": "",
            "time_range": f"{_format_clock(start_min)} to {_format_clock(end_min)}",
            "color": colors.HexColor(OFFICE_HOURS_COLOR),
        }
        place(oh.weekday_id, start_min, end_min, display)

    for wid in grid:
        grid[wid] = _merge_empty_runs(grid[wid])

    return weekdays, ticks, grid


def _attribute_flowable(attribute, pill_style):
    path = attr_assets.get_asset_path(attribute.id)
    if not path:
        return Paragraph(escape(attribute.name), pill_style)
    if path.suffix.lower() == ".svg":
        drawing = svg2rlg(str(path))
        if not drawing or not drawing.width or not drawing.height:
            return Paragraph(escape(attribute.name), pill_style)
        scale = min(ICON_SIZE / drawing.width, ICON_SIZE / drawing.height)
        drawing.width *= scale
        drawing.height *= scale
        drawing.scale(scale, scale)
        return drawing
    reader = ImageReader(str(path))
    iw, ih = reader.getSize()
    scale = min(ICON_SIZE / iw, ICON_SIZE / ih)
    return Image(str(path), width=iw * scale, height=ih * scale)


def generate_faculty_schedule_pdf(db: Session, term: Term, faculty: Faculty) -> bytes:
    weekdays, ticks, grid = build_faculty_schedule_grid(db, term, faculty)

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=TABLOID,
        leftMargin=MARGIN, rightMargin=MARGIN, topMargin=MARGIN, bottomMargin=MARGIN,
    )
    content_width = PAGE_WIDTH - 2 * MARGIN

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle("FacultyTitle", parent=styles["Title"], alignment=TA_CENTER, fontSize=22, leading=25)
    info_style = ParagraphStyle(
        "FacultyInfo", parent=styles["Normal"], alignment=TA_CENTER, fontSize=12,
        textColor=colors.HexColor("#444444"),
    )
    subtitle_style = ParagraphStyle(
        "FacultySubtitle", parent=styles["Normal"], alignment=TA_CENTER, fontSize=11,
        textColor=colors.HexColor("#666666"),
    )
    pill_style = ParagraphStyle(
        "AttributePill", parent=styles["Normal"], alignment=TA_CENTER, fontSize=8,
        textColor=colors.HexColor("#444444"), borderColor=colors.HexColor("#aaaaaa"),
        borderWidth=0.5, borderPadding=3,
    )
    header_style = ParagraphStyle(
        "CellHeader", parent=styles["Normal"], fontSize=12, alignment=TA_CENTER,
        textColor=colors.HexColor("#222222"), fontName="Helvetica-Bold",
    )
    time_style = ParagraphStyle(
        "TimeCell", parent=styles["Normal"], fontSize=7, alignment=TA_CENTER,
        fontName="Helvetica-Bold", textColor=colors.HexColor("#333333"), leading=8,
    )
    cell_body_style = ParagraphStyle(
        "CellBody", parent=styles["Normal"], fontSize=9.5, alignment=TA_LEFT, leading=12,
        textColor=colors.black, fontName="Helvetica-Bold",
    )
    cell_time_style = ParagraphStyle(
        "CellTime", parent=styles["Normal"], fontSize=8, alignment=TA_LEFT, leading=10,
        textColor=colors.HexColor("#333333"),
    )
    EMPTY_PAD = (2, 2, 3, 3)

    header_band, header_height = _fit_image_band("header", content_width, HEADER_IMAGE_MAX_HEIGHT)
    footer_band, footer_height = _fit_image_band("footer", content_width, FOOTER_IMAGE_MAX_HEIGHT)

    elements = []
    if header_band:
        elements.append(header_band)
        elements.append(Spacer(1, SECTION_GAP))

    full_name = f"{faculty.first_name} {faculty.last_name}"
    elements.append(Paragraph(escape(full_name), title_style))

    info_bits = []
    if faculty.rank:
        info_bits.append(RANK_LABELS.get(faculty.rank.value, faculty.rank.value))
    if faculty.office:
        info_bits.append(f"Office: {faculty.office}")
    if info_bits:
        elements.append(Paragraph(escape("  |  ".join(info_bits)), info_style))

    icon_row_height = 0
    if faculty.attributes:
        cells = [_attribute_flowable(a, pill_style) for a in sorted(faculty.attributes, key=lambda a: a.name)]
        col_w = content_width / len(cells)
        icon_table = Table([cells], colWidths=[col_w] * len(cells))
        icon_table.setStyle(TableStyle([
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 2),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ]))
        elements.append(Spacer(1, 3))
        elements.append(icon_table)
        icon_row_height = ICON_ROW_HEIGHT

    elements.append(Paragraph(escape(f"{_term_label(term)} Schedule"), subtitle_style))
    elements.append(Spacer(1, SECTION_GAP))

    if not weekdays or not ticks:
        elements.append(Paragraph("No schedule data available for this faculty/term.", styles["Normal"]))
        if footer_band:
            elements.append(Spacer(1, SECTION_GAP))
            elements.append(footer_band)
        doc.build(elements)
        return buf.getvalue()

    num_ticks = len(ticks)
    header_reserved = (SECTION_GAP + header_height) if header_band else 0
    footer_reserved = (SECTION_GAP + footer_height) if footer_band else 0
    usable_height = (
        PAGE_HEIGHT - 2 * MARGIN - header_reserved - INFO_BLOCK_HEIGHT - icon_row_height - SECTION_GAP
        - WEEKDAY_ROW_HEIGHT - footer_reserved
    )
    tick_height = max(6, usable_height / num_ticks * 0.94)

    day_col_width = (content_width - TIME_COL_WIDTH) / len(weekdays)

    header_row = [""] + [
        Paragraph(WEEKDAY_FULL.get(w.name.value, w.name.value), header_style) for w in weekdays
    ]
    data = [header_row]
    span_commands = []
    for r, tick_min in enumerate(ticks):
        row = [Paragraph(_format_clock(tick_min), time_style)]
        for c, w in enumerate(weekdays):
            cell = grid[w.id][r]
            if cell == "COVERED":
                row.append("")
                continue
            if "empty_span" in cell:
                span = cell["empty_span"]
                block_height = span * tick_height
                row.append(_make_card("", day_col_width, block_height, EMPTY_BG_COLOR, None, "MIDDLE", "CENTER", pad=EMPTY_PAD))
                if span > 1:
                    span_commands.append(("SPAN", (c + 1, r + 1), (c + 1, r + span)))
                continue
            entry = cell["entry"]
            span = cell["span"]
            block_height = span * tick_height
            title = escape(entry["title"])
            name = escape(entry["name"])
            instructor = escape(entry["instructor"])
            time_range = escape(entry["time_range"])
            lines = "<br/>".join(x for x in [f"<b>{title}</b>", name, instructor] if x)
            cell_content = [Paragraph(lines, cell_body_style), Paragraph(time_range, cell_time_style)]
            card = _make_card(cell_content, day_col_width, block_height, entry["color"], ENTRY_EDGE_COLOR, "TOP", "LEFT")
            row.append(card)
            if span > 1:
                span_commands.append(("SPAN", (c + 1, r + 1), (c + 1, r + span)))
        data.append(row)

    col_widths = [TIME_COL_WIDTH] + [day_col_width] * len(weekdays)
    row_heights = [WEEKDAY_ROW_HEIGHT] + [tick_height] * num_ticks
    table = Table(data, colWidths=col_widths, rowHeights=row_heights, repeatRows=0)

    style_commands = [
        ("BACKGROUND", (0, 0), (-1, 0), colors.white),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (1, 1), (-1, -1), "CENTER"),
        ("VALIGN", (1, 1), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (1, 1), (-1, -1), 0),
        ("BOTTOMPADDING", (1, 1), (-1, -1), 0),
        ("LEFTPADDING", (1, 1), (-1, -1), 0),
        ("RIGHTPADDING", (1, 1), (-1, -1), 0),
        ("TOPPADDING", (0, 1), (0, -1), 1),
        ("BOTTOMPADDING", (0, 1), (0, -1), 1),
        ("LEFTPADDING", (0, 1), (0, -1), 2),
        ("RIGHTPADDING", (0, 1), (0, -1), 2),
        ("LINEAFTER", (0, 1), (-2, -1), 0.5, GRID_LINE_COLOR),
        ("BOX", (0, 1), (-1, -1), 0.75, GRID_LINE_COLOR),
    ] + span_commands
    table.setStyle(TableStyle(style_commands))

    elements.append(table)

    if footer_band:
        elements.append(Spacer(1, SECTION_GAP))
        elements.append(footer_band)

    doc.build(elements)
    return buf.getvalue()
