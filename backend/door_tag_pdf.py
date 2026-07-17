import io
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import TABLOID
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.lib.utils import ImageReader
from reportlab.platypus import Image, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from sqlalchemy.orm import Session
from svglib.svglib import svg2rlg

import door_tag_assets as assets
from models import Room, Term, TimeSlot, Weekday

WEEKDAY_FULL = {"mon": "Monday", "tue": "Tuesday", "wed": "Wednesday", "thu": "Thursday", "fri": "Friday"}

PAGE_WIDTH, PAGE_HEIGHT = TABLOID  # portrait 11x17 — vertical door-sign layout
MARGIN = 0.45 * inch
TIME_COL_WIDTH = 0.8 * inch
TICK_MINUTES = 15

TITLE_HEIGHT = 0.55 * inch
WEEKDAY_ROW_HEIGHT = 0.3 * inch
HEADER_IMAGE_MAX_HEIGHT = 1.5 * inch
FOOTER_IMAGE_MAX_HEIGHT = 1.1 * inch
SECTION_GAP = 0.12 * inch

GRID_LINE_COLOR = colors.HexColor("#aaaaaa")
ENTRY_EDGE_COLOR = colors.HexColor("#888888")
EMPTY_BG_COLOR = colors.HexColor("#3a3a3a")

# White gutter kept around every colored block (course/meeting or merged
# empty run) so adjacent blocks never touch — the background, edge, and text
# of a block are all drawn inside this inset, never flush with the outer
# table cell's own boundary.
CELL_INSET = 2.5

# Brighter, more saturated version of the frontend ScheduleGrid PASTEL
# palette (which stays dark, for light-on-dark cards in the app itself) —
# the printed door tag reads better with a bright fill and black text.
PASTEL = [
    "#c9a6f0", "#a6e0b0", "#a6c3f0", "#f0d19a", "#c9a6e0",
    "#9ae0c9", "#f0a6ad", "#a6c9f0", "#f0e29a", "#9adfd0",
    "#f0a6c9", "#c3e09a",
]
MEETING_COLOR = "#8fb8d9"

# --- Info section layout (feedback_63) ---
# The "info section" is the header image + info area (room/faculty name,
# term, etc) that sits above the schedule table. The Layout option only
# changes how these two elements are positioned relative to each other —
# never the info area's own internal structure.
LAYOUT_OPTIONS = [
    "vertical_center", "vertical_left", "vertical_right",
    "horizontal_center", "horizontal_left", "horizontal_right",
]
DEFAULT_LAYOUT = "vertical_center"
INFO_HEADER_GAP = 0.18 * inch

_ALIGN_NAME = {"center": "CENTER", "left": "LEFT", "right": "RIGHT"}
_ALIGN_TA = {"center": TA_CENTER, "left": TA_LEFT, "right": TA_RIGHT}


def parse_layout(layout: str) -> tuple[str, str]:
    """"horizontal_left" -> ("horizontal", "left"); anything unrecognized
    falls back to vertical_center."""
    if layout not in LAYOUT_OPTIONS:
        layout = DEFAULT_LAYOUT
    axis, align = layout.split("_", 1)
    return axis, align


def compose_info_section(header_flowable, header_height: float, header_width: float,
                          info_area, info_area_height: float, layout: str, content_width: float):
    """Arranges the header image and the info area (a single pre-built
    flowable — see _build_*_info_area) per one of the 6 layout options.
    Returns (elements: list, total_height: float)."""
    axis, align = parse_layout(layout)
    ra = _ALIGN_NAME[align]

    if header_flowable is None:
        info_area.hAlign = ra
        return [info_area], info_area_height

    header_flowable.hAlign = ra
    info_area.hAlign = ra

    if axis == "vertical":
        return (
            [header_flowable, Spacer(1, SECTION_GAP), info_area],
            header_height + SECTION_GAP + info_area_height,
        )

    # horizontal — side by side in one row, the row itself positioned via hAlign
    gap = Spacer(INFO_HEADER_GAP, 1)
    row = Table([[header_flowable, gap, info_area]])
    row.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    row.hAlign = ra
    return [row], max(header_height, info_area_height)


def info_area_width(axis: str, header_flowable, header_width: float, content_width: float) -> float:
    """How wide the info area's own content should wrap to: full content
    width when stacked vertically (or when there's no header image to share
    the row with), otherwise whatever's left after the header image."""
    if axis == "vertical" or header_flowable is None:
        return content_width
    return max(2.5 * inch, content_width - header_width - INFO_HEADER_GAP)


def _build_room_info_area(room: Room, term: Term, align: str, width: float):
    """The room export's info area — just a title + subtitle stack, text
    alignment following the chosen Layout option. Returns (flowable, height)."""
    ta = _ALIGN_TA[align]
    title_style = ParagraphStyle("DoorTagTitle", parent=getSampleStyleSheet()["Title"], alignment=ta, fontSize=22, leading=25)
    subtitle_style = ParagraphStyle(
        "DoorTagSubtitle", parent=getSampleStyleSheet()["Normal"], alignment=ta, fontSize=12,
        textColor=colors.HexColor("#444444"),
    )
    rows = [
        [Paragraph(escape(room.display_label), title_style)],
        [Paragraph(escape(f"{_term_label(term)} Schedule"), subtitle_style)],
    ]
    table = Table(rows, colWidths=[width])
    table.setStyle(TableStyle([
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    return table, TITLE_HEIGHT


def _entry_color(course_id: int | None) -> colors.HexColor:
    if course_id is None:
        return colors.HexColor(MEETING_COLOR)
    return colors.HexColor(PASTEL[course_id % len(PASTEL)])


def _merge_empty_runs(column: list) -> list:
    """Collapses consecutive empty (None) cells in a weekday column into one
    merged block: the first cell becomes {"empty_span": run_length} and the
    rest become "COVERED", mirroring how a multi-tick entry already occupies
    one cell with its continuation ticks marked COVERED."""
    result = list(column)
    i, n = 0, len(result)
    while i < n:
        if result[i] is None:
            j = i
            while j < n and result[j] is None:
                j += 1
            result[i] = {"empty_span": j - i}
            for k in range(i + 1, j):
                result[k] = "COVERED"
            i = j
        else:
            i += 1
    return result


def _term_label(term: Term) -> str:
    label = f"{term.semester.name.value.capitalize()} {term.year}"
    return f"{label} {term.name}" if term.name else label


def _parse_hhmm(s: str) -> int:
    h, m = s.split(":")
    return int(h) * 60 + int(m)


def _format_clock(total_minutes: int) -> str:
    h, m = divmod(total_minutes, 60)
    period = "AM" if h < 12 else "PM"
    h12 = h % 12 or 12
    return f"{h12}:{m:02d} {period}"


def build_door_tag_grid(db: Session, term: Term, room: Room):
    """Projects every ScheduleEntry in `room` for `term` onto a weekday x
    15-minute-tick grid, using each entry's actual clock start/end (derived
    from its time slots' start_time/end_time) rather than slot indices, so a
    multi-slot entry renders as one continuous block spanning real minutes —
    including the passing period between two back-to-back slots — instead of
    stopping and resuming at each slot boundary.

    Weekdays are global reference data (not term-scoped), so an empty room
    still gets a full blank template.
    """
    weekdays = db.query(Weekday).order_by(Weekday.display_order).all()
    time_slots = db.query(TimeSlot).order_by(TimeSlot.display_order).all()

    if not time_slots:
        return weekdays, [], {}

    day_start = min(_parse_hhmm(ts.start_time) for ts in time_slots)
    day_end = max(_parse_hhmm(ts.end_time) for ts in time_slots)
    day_start -= day_start % TICK_MINUTES
    if day_end % TICK_MINUTES:
        day_end += TICK_MINUTES - day_end % TICK_MINUTES
    num_ticks = (day_end - day_start) // TICK_MINUTES
    ticks = [day_start + i * TICK_MINUTES for i in range(num_ticks)]

    grid: dict[int, list] = {w.id: [None] * num_ticks for w in weekdays}

    for table in term.schedule_tables:
        table_weekday_ids = [w.id for w in table.weekdays]
        for entry in table.entries:
            if entry.room_id != room.id or not entry.time_slots:
                continue
            entry_start = min(_parse_hhmm(ts.start_time) for ts in entry.time_slots)
            entry_end = max(_parse_hhmm(ts.end_time) for ts in entry.time_slots)
            start_idx = (entry_start - day_start) // TICK_MINUTES
            span = max(1, (entry_end - entry_start) // TICK_MINUTES)
            if start_idx < 0 or start_idx >= num_ticks:
                continue
            faculty = entry.faculty
            time_range = f"{_format_clock(entry_start)} to {_format_clock(entry_end)}"
            if entry.course_id:
                course = entry.course
                display = {
                    "title": f"{course.dept_code} {course.course_number} Sec {entry.section}",
                    "name": course.course_name,
                    "instructor": f"{faculty.last_name}, {faculty.first_name}" if faculty else "No instructor",
                    "course_id": course.id,
                    "time_range": time_range,
                }
            else:
                display = {
                    "title": entry.meeting.name,
                    "name": "Meeting",
                    "instructor": f"{faculty.last_name}, {faculty.first_name}" if faculty else "No instructor",
                    "course_id": None,
                    "time_range": time_range,
                }
            for wid in table_weekday_ids:
                if wid not in grid:
                    continue
                grid[wid][start_idx] = {"entry": display, "span": span}
                for i in range(start_idx + 1, start_idx + span):
                    if i < num_ticks:
                        grid[wid][i] = "COVERED"

    for wid in grid:
        grid[wid] = _merge_empty_runs(grid[wid])

    return weekdays, ticks, grid


def _fit_image_band(kind: str, content_width: float, max_height: float):
    """Loads the uploaded header/footer asset (if any) and returns
    (flowable, actual_height, actual_width) scaled to fit within
    content_width x max_height while preserving aspect ratio. Returns
    (None, 0, 0) if nothing is uploaded. The flowable is returned bare (not
    wrapped in a full-width centering Table) so callers can position it via
    its own .hAlign — defaults to CENTER, matching the old always-centered
    behavior, until a caller (see compose_info_section) overrides it. The
    caller needs the *actual* height up front to budget the rest of the page
    precisely enough to stay on one sheet."""
    path = assets.get_asset_path(kind)
    if not path:
        return None, 0, 0

    if path.suffix.lower() == ".svg":
        drawing = svg2rlg(str(path))
        if not drawing or not drawing.width or not drawing.height:
            return None, 0, 0
        scale = min(content_width / drawing.width, max_height / drawing.height)
        drawing.width *= scale
        drawing.height *= scale
        drawing.scale(scale, scale)
        flowable, height, width = drawing, drawing.height, drawing.width
    else:
        reader = ImageReader(str(path))
        iw, ih = reader.getSize()
        scale = min(content_width / iw, max_height / ih)
        w, h = iw * scale, ih * scale
        flowable, height, width = Image(str(path), width=w, height=h), h, w

    flowable.hAlign = "CENTER"
    return flowable, height, width


def _make_card(content, width: float, height: float, bg_color, edge_color, valign: str, halign: str, pad=(4, 3, 5, 5)):
    """A single-cell nested Table sized `CELL_INSET` smaller than the outer
    grid cell on every side, so when centered inside that cell it leaves a
    white margin — background, edge, and text all render within that inset,
    never touching the outer cell's own boundary."""
    inner_w = max(1.0, width - 2 * CELL_INSET)
    inner_h = max(1.0, height - 2 * CELL_INSET)
    pad_top, pad_bottom, pad_left, pad_right = pad
    style = [
        ("BACKGROUND", (0, 0), (-1, -1), bg_color),
        ("VALIGN", (0, 0), (-1, -1), valign),
        ("ALIGN", (0, 0), (-1, -1), halign),
        ("TOPPADDING", (0, 0), (-1, -1), pad_top),
        ("BOTTOMPADDING", (0, 0), (-1, -1), pad_bottom),
        ("LEFTPADDING", (0, 0), (-1, -1), pad_left),
        ("RIGHTPADDING", (0, 0), (-1, -1), pad_right),
    ]
    if edge_color is not None:
        style.append(("BOX", (0, 0), (-1, -1), 0.75, edge_color))
    card = Table([[content]], colWidths=[inner_w], rowHeights=[inner_h])
    card.setStyle(TableStyle(style))
    return card


def generate_door_tag_pdf(
    db: Session, term: Term, room: Room, empty_label: str,
    layout: str = DEFAULT_LAYOUT, header_scale: float = 1.0, footer_scale: float = 1.0,
) -> bytes:
    weekdays, ticks, grid = build_door_tag_grid(db, term, room)
    axis, align = parse_layout(layout)

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=TABLOID,
        leftMargin=MARGIN, rightMargin=MARGIN, topMargin=MARGIN, bottomMargin=MARGIN,
    )
    content_width = PAGE_WIDTH - 2 * MARGIN

    styles = getSampleStyleSheet()
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
    empty_style = ParagraphStyle(
        "EmptyCell", parent=styles["Normal"], fontSize=8, leading=9, alignment=TA_CENTER,
        textColor=colors.white, fontName="Helvetica-Bold",
    )
    empty_time_style = ParagraphStyle(
        "EmptyCellTime", parent=styles["Normal"], fontSize=6.5, leading=7.5, alignment=TA_CENTER,
        textColor=colors.HexColor("#dddddd"),
    )
    EMPTY_PAD = (2, 2, 3, 3)  # top, bottom, left, right — tighter than the course card's

    header_flowable, header_height, header_width = _fit_image_band("header", content_width, HEADER_IMAGE_MAX_HEIGHT * header_scale)
    footer_band, footer_height, _ = _fit_image_band("footer", content_width, FOOTER_IMAGE_MAX_HEIGHT * footer_scale)
    if footer_band:
        footer_band.hAlign = "CENTER"  # footer is never affected by the Layout option

    info_width = info_area_width(axis, header_flowable, header_width, content_width)
    info_area, info_height = _build_room_info_area(room, term, align, info_width)
    info_elements, info_section_height = compose_info_section(
        header_flowable, header_height, header_width, info_area, info_height, layout, content_width
    )

    elements = []
    elements.extend(info_elements)
    elements.append(Spacer(1, SECTION_GAP))

    if not weekdays or not ticks:
        elements.append(Paragraph("No schedule data available for this room/term.", styles["Normal"]))
        if footer_band:
            elements.append(Spacer(1, SECTION_GAP))
            elements.append(footer_band)
        doc.build(elements)
        return buf.getvalue()

    num_ticks = len(ticks)
    footer_reserved = (SECTION_GAP + footer_height) if footer_band else 0
    usable_height = (
        PAGE_HEIGHT - 2 * MARGIN - info_section_height - SECTION_GAP
        - WEEKDAY_ROW_HEIGHT - footer_reserved
    )
    # 0.94 safety factor: reportlab treats explicit rowHeights as targets, not
    # hard caps — a row can grow a fraction of a point beyond it to fit a
    # Paragraph's font metrics, and with 50+ tick rows that rounding adds up
    # to enough overflow to push content onto a second page. Shaving a small
    # margin off every row keeps the whole table safely on one sheet.
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
                end_row = r + span
                block_height = span * tick_height
                # A bare 15-minute tick (a single passing period) is too
                # small to usefully label at all — leave it blank. Longer
                # runs still adapt their label/time-range to available
                # height so text never overflows the card.
                content = ""
                if span > 1 and empty_label.strip():
                    avail = block_height - 2 * CELL_INSET - EMPTY_PAD[0] - EMPTY_PAD[1]
                    if avail >= empty_style.leading + empty_time_style.leading:
                        end_min = tick_min + span * TICK_MINUTES
                        time_range = f"{_format_clock(tick_min)} to {_format_clock(end_min)}"
                        content = [Paragraph(escape(empty_label), empty_style), Paragraph(time_range, empty_time_style)]
                    elif avail >= empty_style.leading:
                        content = Paragraph(escape(empty_label), empty_style)
                row.append(_make_card(content, day_col_width, block_height, EMPTY_BG_COLOR, None, "MIDDLE", "CENTER", pad=EMPTY_PAD))
                if span > 1:
                    span_commands.append(("SPAN", (c + 1, r + 1), (c + 1, end_row)))
                continue
            entry = cell["entry"]
            span = cell["span"]
            end_row = r + span if span > 1 else r + 1
            block_height = span * tick_height
            title = escape(entry["title"])
            name = escape(entry["name"])
            instructor = escape(entry["instructor"])
            time_range = escape(entry["time_range"])
            text = f"<b>{title}</b><br/>{name}<br/>{instructor}"
            cell_content = [Paragraph(text, cell_body_style), Paragraph(time_range, cell_time_style)]
            card = _make_card(cell_content, day_col_width, block_height, _entry_color(entry["course_id"]), ENTRY_EDGE_COLOR, "TOP", "LEFT")
            row.append(card)
            if span > 1:
                span_commands.append(("SPAN", (c + 1, r + 1), (c + 1, end_row)))
        data.append(row)

    col_widths = [TIME_COL_WIDTH] + [day_col_width] * len(weekdays)
    row_heights = [WEEKDAY_ROW_HEIGHT] + [tick_height] * num_ticks
    table = Table(data, colWidths=col_widths, rowHeights=row_heights, repeatRows=0)

    style_commands = [
        # Weekday header row: plain white, no border of any kind — it reads
        # as a floating label strip rather than another bordered cell.
        ("BACKGROUND", (0, 0), (-1, 0), colors.white),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        # Course/meeting and empty-run cells are nested "card" tables (see
        # _make_card) sized smaller than the outer grid cell — centering the
        # card within the outer cell is what produces the white gutter
        # around it. No outer padding, so the card's own inset math (against
        # the full col width / block height) lines up exactly.
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
        # Grid lines and the outer box only wrap the time-tick body (row 1+),
        # leaving the weekday header row edge-free.
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
