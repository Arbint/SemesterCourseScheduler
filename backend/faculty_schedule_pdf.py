import io
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.lib.utils import ImageReader
from reportlab.platypus import Image, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from sqlalchemy.orm import Session
from svglib.svglib import svg2rlg

import faculty_attribute_assets as attr_assets
from door_tag_pdf import (
    DEFAULT_MARGIN_IN, TIME_COL_WIDTH, TICK_MINUTES,
    WEEKDAY_ROW_HEIGHT, HEADER_IMAGE_MAX_HEIGHT, FOOTER_IMAGE_MAX_HEIGHT, SECTION_GAP,
    GRID_LINE_COLOR, ENTRY_EDGE_COLOR, CELL_INSET, MEETING_COLOR,
    WEEKDAY_FULL, _entry_color, _merge_empty_runs, _term_label, _parse_hhmm, _format_clock,
    _fit_image_band, _make_card, _text_item, wrap_as_single_flowable, _natural_width, _ALIGN_TA, _OffsetFlowable,
    _entry_cell_content,
    DEFAULT_LAYOUT, DEFAULT_PAGE_SIZE, DEFAULT_ORIENTATION, resolve_page_size,
    DEFAULT_HEADER_PADDING_IN, DEFAULT_INFO_PADDING_IN,
    parse_layout, compose_items, item_width, TITLE_LINE_HEIGHT, SUBLINE_HEIGHT,
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

# Light, welcoming green for office hours — distinct from course pastels and
# the meeting blue.
OFFICE_HOURS_COLOR = "#c3ecc3"

ICON_SIZE = 0.32 * inch
ICON_GAP = 4


def _requires_department_meeting(faculty: Faculty) -> bool:
    return faculty.is_department_owned and faculty.full_time_or_part_time.value == "full_time"


def build_faculty_schedule_grid(db: Session, term: Term, faculty: Faculty):
    """Same tick-grid approach as build_door_tag_grid, scoped to one faculty's
    own courses, their department meeting (only if actually required — see
    _requires_department_meeting), and their office hours (free-form times,
    projected directly onto the tick grid without going through time slots).
    Ticks where every weekday is empty are dropped entirely (feedback_63) so
    the printed table doesn't waste space on hours the faculty never uses."""
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
    all_ticks = [day_start + i * TICK_MINUTES for i in range(num_ticks)]

    raw_grid: dict[int, list] = {w.id: [None] * num_ticks for w in weekdays}

    def place(wid, start_min, end_min, display):
        if wid not in raw_grid:
            return
        start_idx = (start_min - day_start) // TICK_MINUTES
        span = max(1, -(-(end_min - start_min) // TICK_MINUTES))  # ceil div
        if start_idx < 0 or start_idx >= num_ticks:
            return
        if raw_grid[wid][start_idx] is not None:
            return  # already occupied — shouldn't happen given conflict validation
        raw_grid[wid][start_idx] = {"entry": display, "span": span}
        for i in range(start_idx + 1, start_idx + span):
            if i < num_ticks:
                raw_grid[wid][i] = "COVERED"

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
                    "name": "",
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

    # Drop any tick where every weekday is empty. A multi-tick entry's own
    # span is never split up by this — every tick it covers is non-None for
    # at least the weekday(s) it's on, so those rows always survive intact.
    used_idx = [i for i in range(num_ticks) if any(raw_grid[w.id][i] is not None for w in weekdays)]
    ticks = [all_ticks[i] for i in used_idx]
    grid = {w.id: [raw_grid[w.id][i] for i in used_idx] for w in weekdays}

    for wid in grid:
        grid[wid] = _merge_empty_runs(grid[wid])

    return weekdays, ticks, grid


def _attribute_flowable(attribute, pill_style, icon_size: float):
    path = attr_assets.get_asset_path(attribute.id)
    if not path:
        return Paragraph(escape(attribute.name), pill_style)
    if path.suffix.lower() == ".svg":
        drawing = svg2rlg(str(path))
        if not drawing or not drawing.width or not drawing.height:
            return Paragraph(escape(attribute.name), pill_style)
        scale = min(icon_size / drawing.width, icon_size / drawing.height)
        drawing.width *= scale
        drawing.height *= scale
        drawing.scale(scale, scale)
        return drawing
    reader = ImageReader(str(path))
    iw, ih = reader.getSize()
    scale = min(icon_size / iw, icon_size / ih)
    return Image(str(path), width=iw * scale, height=ih * scale)


def _build_faculty_info_area(
    faculty: Faculty, term: Term, info_layout: str, width: float, gap: float,
    name_font_scale: float = 1.0, info_font_scale: float = 1.0, semester_font_scale: float = 1.0,
    show_rank: bool = True, show_office: bool = True, show_tags: bool = True,
):
    """The faculty export's info area — name / rank-office-tags / term lines,
    arranged per the Info Text Area Layout option. Rank/Office/Tags are each
    independently toggleable (Export Configuration checkboxes). Returns
    (flowable, height, width)."""
    axis, align = parse_layout(info_layout)
    ta = _ALIGN_TA[align]
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "FacultyTitle", parent=styles["Title"], alignment=ta,
        fontSize=22 * name_font_scale, leading=25 * name_font_scale,
    )
    info_style = ParagraphStyle(
        "FacultyInfo", parent=styles["Normal"], alignment=ta,
        fontSize=12 * info_font_scale, textColor=colors.HexColor("#444444"),
    )
    subtitle_style = ParagraphStyle(
        "FacultySubtitle", parent=styles["Normal"], alignment=ta,
        fontSize=11 * semester_font_scale, textColor=colors.HexColor("#666666"),
    )

    lines_data = [(f"{faculty.first_name} {faculty.last_name}", title_style, TITLE_LINE_HEIGHT * name_font_scale)]

    info_bits = []
    if show_rank and faculty.rank:
        info_bits.append(RANK_LABELS.get(faculty.rank.value, faculty.rank.value))
    if show_office and faculty.office:
        info_bits.append(f"Office: {faculty.office}")
    if show_tags and faculty.tags:
        info_bits.append(", ".join(faculty.tags))
    if info_bits:
        lines_data.append(("  |  ".join(info_bits), info_style, SUBLINE_HEIGHT * info_font_scale))

    lines_data.append((f"{_term_label(term)} Schedule", subtitle_style, SUBLINE_HEIGHT * semester_font_scale))

    cap = item_width(info_layout, width, len(lines_data))
    widths = [cap if align == "fill" else _natural_width(text, style, cap) for text, style, _h in lines_data]
    line_items = [_text_item(Paragraph(escape(text), style), w, h) for (text, style, h), w in zip(lines_data, widths)]

    elements, height = compose_items(line_items, info_layout, width, gap)
    block_width = cap if align == "fill" else (max(widths) if axis == "vertical" else sum(widths) + gap * (len(widths) - 1))
    return wrap_as_single_flowable(elements, block_width), height, block_width


def _build_attribute_icon_area(faculty: Faculty, icon_scale: float = 1.0):
    """The attribute icon area — a horizontal row of icons (or a text pill
    fallback for attributes with no uploaded icon), independent of the
    Header Section Layout option. Returns (flowable | None, height, width)."""
    attributes = sorted(faculty.attributes, key=lambda a: a.name)
    if not attributes:
        return None, 0, 0

    icon_size = ICON_SIZE * icon_scale
    pill_style = ParagraphStyle(
        "AttributePill", parent=getSampleStyleSheet()["Normal"], alignment=TA_CENTER, fontSize=8,
        textColor=colors.HexColor("#444444"), borderColor=colors.HexColor("#aaaaaa"),
        borderWidth=0.5, borderPadding=3,
    )
    col_width = icon_size + 10
    cells, col_widths = [], []
    for i, a in enumerate(attributes):
        cells.append(_attribute_flowable(a, pill_style, icon_size))
        col_widths.append(col_width)
        if i < len(attributes) - 1:
            cells.append(Spacer(ICON_GAP, 1))
            col_widths.append(ICON_GAP)
    table = Table([cells], colWidths=col_widths)
    table.setStyle(TableStyle([
        ("ALIGN", (0, 0), (-1, -1), "CENTER"), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), ICON_GAP / 2), ("BOTTOMPADDING", (0, 0), (-1, -1), ICON_GAP / 2),
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    width = sum(col_widths)
    height = icon_size + ICON_GAP
    return table, height, width


def generate_faculty_schedule_pdf(
    db: Session, term: Term, faculty: Faculty,
    header_layout: str = DEFAULT_LAYOUT, info_layout: str = DEFAULT_LAYOUT,
    header_scale: float = 1.0, footer_scale: float = 1.0,
    page_size: str = DEFAULT_PAGE_SIZE, orientation: str = DEFAULT_ORIENTATION,
    custom_width_in: float | None = None, custom_height_in: float | None = None,
    header_padding_in: float = DEFAULT_HEADER_PADDING_IN, info_padding_in: float = DEFAULT_INFO_PADDING_IN,
    name_font_scale: float = 1.0, info_font_scale: float = 1.0, semester_font_scale: float = 1.0,
    icon_scale: float = 1.0,
    time_font_scale: float = 1.0, weekday_font_scale: float = 1.0,
    header_offset_x_in: float = 0.0, header_offset_y_in: float = 0.0,
    footer_offset_x_in: float = 0.0, footer_offset_y_in: float = 0.0,
    icon_offset_x_in: float = 0.0, icon_offset_y_in: float = 0.0,
    empty_bg_color: str = "#ffffff",
    entry_name_font_scale: float = 1.0, entry_name_font_color: str = "#000000",
    entry_instructor_font_scale: float = 1.0, entry_instructor_font_color: str = "#000000",
    entry_time_font_scale: float = 1.0, entry_time_font_color: str = "#333333",
    time_font_color: str = "#333333", weekday_font_color: str = "#222222",
    weekday_offset_y_in: float = 0.0,
    entry_name_padding_in: float = 0.0, entry_instructor_padding_in: float = 0.0, entry_time_padding_in: float = 0.0,
    show_rank: bool = True, show_office: bool = True, show_tags: bool = True, show_attributes: bool = True,
    margin_in: float = DEFAULT_MARGIN_IN,
    header_top_padding_in: float = 0.0, footer_top_padding_in: float = 0.0, table_top_padding_in: float = 0.0,
) -> bytes:
    weekdays, ticks, grid = build_faculty_schedule_grid(db, term, faculty)
    page_width, page_height = resolve_page_size(page_size, orientation, custom_width_in, custom_height_in)

    margin = max(0.1, margin_in) * inch
    header_top_pad = max(0.0, header_top_padding_in) * inch
    footer_top_pad = max(0.0, footer_top_padding_in) * inch
    table_top_pad = max(0.0, table_top_padding_in) * inch

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=(page_width, page_height),
        leftMargin=margin, rightMargin=margin, topMargin=margin, bottomMargin=margin,
    )
    content_width = page_width - 2 * margin

    styles = getSampleStyleSheet()
    header_style = ParagraphStyle(
        "CellHeader", parent=styles["Normal"], fontSize=12 * weekday_font_scale, alignment=TA_CENTER,
        textColor=colors.HexColor(weekday_font_color), fontName="Helvetica-Bold",
    )
    time_style = ParagraphStyle(
        "TimeCell", parent=styles["Normal"], fontSize=7 * time_font_scale, alignment=TA_CENTER,
        fontName="Helvetica-Bold", textColor=colors.HexColor(time_font_color), leading=8 * time_font_scale,
    )
    cell_body_style = ParagraphStyle(
        "CellBody", parent=styles["Normal"], fontSize=9.5 * entry_name_font_scale, alignment=TA_LEFT, leading=12 * entry_name_font_scale,
        textColor=colors.HexColor(entry_name_font_color), fontName="Helvetica-Bold",
    )
    instructor_style = ParagraphStyle(
        "CellInstructor", parent=styles["Normal"], fontSize=9.5 * entry_instructor_font_scale, alignment=TA_LEFT, leading=12 * entry_instructor_font_scale,
        textColor=colors.HexColor(entry_instructor_font_color), fontName="Helvetica-Bold",
    )
    cell_time_style = ParagraphStyle(
        "CellTime", parent=styles["Normal"], fontSize=8 * entry_time_font_scale, alignment=TA_LEFT, leading=10 * entry_time_font_scale,
        textColor=colors.HexColor(entry_time_font_color),
    )
    EMPTY_PAD = (2, 2, 3, 3)
    empty_bg = colors.HexColor(empty_bg_color)

    header_flowable, header_height, header_width = _fit_image_band("header", "faculty", content_width, HEADER_IMAGE_MAX_HEIGHT * header_scale)
    if header_flowable is not None:
        header_flowable = _OffsetFlowable(header_flowable, header_offset_x_in * inch, header_offset_y_in * inch)
    footer_band, footer_height, _ = _fit_image_band("footer", "faculty", content_width, FOOTER_IMAGE_MAX_HEIGHT * footer_scale)
    if footer_band is not None:
        footer_band = _OffsetFlowable(footer_band, footer_offset_x_in * inch, footer_offset_y_in * inch)
        footer_band.hAlign = "CENTER"

    icon_flowable, icon_height, icon_width = _build_attribute_icon_area(faculty, icon_scale) if show_attributes else (None, 0, 0)
    if icon_flowable is not None:
        icon_flowable = _OffsetFlowable(icon_flowable, icon_offset_x_in * inch, icon_offset_y_in * inch)

    header_gap = max(0.0, header_padding_in) * inch
    info_gap = max(0.0, info_padding_in) * inch
    name_pad = max(0.0, entry_name_padding_in) * inch
    instructor_pad = max(0.0, entry_instructor_padding_in) * inch
    time_pad = max(0.0, entry_time_padding_in) * inch

    num_header_items = (1 if header_flowable else 0) + 1 + (1 if icon_flowable else 0)
    info_width = item_width(header_layout, content_width, num_header_items)
    info_area, info_height, info_block_width = _build_faculty_info_area(
        faculty, term, info_layout, info_width, info_gap, name_font_scale, info_font_scale, semester_font_scale,
        show_rank, show_office, show_tags,
    )

    header_items = [
        {"flowable": header_flowable, "height": header_height, "width": header_width},
        {"flowable": info_area, "height": info_height, "width": info_block_width},
        {"flowable": icon_flowable, "height": icon_height, "width": icon_width},
    ]
    info_elements, info_section_height = compose_items(header_items, header_layout, content_width, header_gap)

    elements = []
    if header_top_pad:
        elements.append(Spacer(1, header_top_pad))
    elements.extend(info_elements)
    elements.append(Spacer(1, SECTION_GAP))
    if table_top_pad:
        elements.append(Spacer(1, table_top_pad))

    if not weekdays or not ticks:
        elements.append(Paragraph("No schedule data available for this faculty/term.", styles["Normal"]))
        if footer_band:
            elements.append(Spacer(1, SECTION_GAP))
            if footer_top_pad:
                elements.append(Spacer(1, footer_top_pad))
            elements.append(footer_band)
        doc.build(elements)
        return buf.getvalue()

    num_ticks = len(ticks)
    footer_reserved = (SECTION_GAP + footer_top_pad + footer_height) if footer_band else 0
    usable_height = (
        page_height - 2 * margin - info_section_height - SECTION_GAP - header_top_pad - table_top_pad
        - WEEKDAY_ROW_HEIGHT - footer_reserved
    )
    tick_height = max(6, usable_height / num_ticks * 0.94)

    day_col_width = (content_width - TIME_COL_WIDTH) / len(weekdays)

    header_row = [""] + [
        _OffsetFlowable(Paragraph(WEEKDAY_FULL.get(w.name.value, w.name.value), header_style), 0, weekday_offset_y_in * inch)
        for w in weekdays
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
                row.append(_make_card("", day_col_width, block_height, empty_bg, None, "MIDDLE", "CENTER", pad=EMPTY_PAD))
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
            cell_content = _entry_cell_content(
                title, name, instructor, time_range, cell_body_style, instructor_style, cell_time_style,
                name_pad, instructor_pad, time_pad,
            )
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
        if footer_top_pad:
            elements.append(Spacer(1, footer_top_pad))
        elements.append(footer_band)

    doc.build(elements)
    return buf.getvalue()
