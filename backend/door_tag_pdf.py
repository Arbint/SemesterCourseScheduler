import io
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import letter, legal, TABLOID, A4, A3
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.platypus import Flowable, Image, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from sqlalchemy.orm import Session
from svglib.svglib import svg2rlg

import door_tag_assets as assets
from models import Room, Term, TimeSlot, Weekday

WEEKDAY_FULL = {"mon": "Monday", "tue": "Tuesday", "wed": "Wednesday", "thu": "Thursday", "fri": "Friday"}

# --- Page setup (feedback_64) ---
PAGE_SIZE_OPTIONS = ["letter", "legal", "tabloid", "a4", "a3", "custom"]
DEFAULT_PAGE_SIZE = "tabloid"
ORIENTATION_OPTIONS = ["portrait", "landscape"]
DEFAULT_ORIENTATION = "portrait"
_PAGE_SIZES = {"letter": letter, "legal": legal, "tabloid": TABLOID, "a4": A4, "a3": A3}


def resolve_page_size(
    page_size: str, orientation: str,
    custom_width_in: float | None = None, custom_height_in: float | None = None,
) -> tuple[float, float]:
    """Returns (width, height) in points for one of the common sizes or a
    custom width/height (inches), oriented portrait or landscape regardless
    of how the base size tuple happens to be ordered."""
    if page_size == "custom":
        w = (custom_width_in or 11) * inch
        h = (custom_height_in or 17) * inch
    else:
        w, h = _PAGE_SIZES.get(page_size, TABLOID)
    if orientation == "landscape":
        return max(w, h), min(w, h)
    return min(w, h), max(w, h)


PAGE_WIDTH, PAGE_HEIGHT = TABLOID  # default/legacy fallback — generate_* now resolves its own per-call size
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

# --- Header section layout (feedback_63/64) ---
# The "header section" holds up to 3 items: the header image, the info text
# area (name/term/etc), and — faculty export only — the attribute icon area.
# Two independent 8-option Layout dropdowns control this: one for how these
# top-level items relate to each other (header_layout), and one reused
# internally for how the info text area's own lines (name / rank-office /
# term) relate to each other (info_layout). Same 8 options, same function.
LAYOUT_OPTIONS = [
    "vertical_center", "vertical_left", "vertical_right", "vertical_fill",
    "horizontal_center", "horizontal_left", "horizontal_right", "horizontal_fill",
]
DEFAULT_LAYOUT = "vertical_center"
# Default gap (feedback_65) between items under a non-Fill layout — the user
# can override both via the Header/Info Padding spin boxes, which only show
# up once their layout is set to something other than *_fill.
DEFAULT_HEADER_PADDING_IN = 0.2
DEFAULT_INFO_PADDING_IN = 0.1

_ALIGN_NAME = {"center": "CENTER", "left": "LEFT", "right": "RIGHT", "fill": "CENTER"}
_ALIGN_TA = {"center": TA_CENTER, "left": TA_LEFT, "right": TA_RIGHT, "fill": TA_CENTER}


def parse_layout(layout: str) -> tuple[str, str]:
    """"horizontal_fill" -> ("horizontal", "fill"); anything unrecognized
    falls back to vertical_center."""
    if layout not in LAYOUT_OPTIONS:
        layout = DEFAULT_LAYOUT
    axis, align = layout.split("_", 1)
    return axis, align


def item_width(layout: str, content_width: float, num_items: int) -> float:
    """Width budget for one item under this layout. Fill claims real estate
    up front (full width stacked, or an even split side by side) since it
    has no natural size of its own. Anything else just gets the full
    available width back as an upper bound — non-fill items size themselves
    to their own natural (shrink-to-fit) content width, capped by this, so
    Left/Center/Right/non-fill items sit snugly next to each other instead
    of each claiming an even share of the width."""
    axis, align = parse_layout(layout)
    if align != "fill":
        return content_width
    return content_width if axis == "vertical" else content_width / max(1, num_items)


def _natural_width(text: str, style: ParagraphStyle, cap: float) -> float:
    """Shrink-to-fit width for a single line of plain (unwrapped) text set in
    `style`, capped so it never exceeds the available area — long text still
    falls back to wrapping within `cap` rather than overflowing the page."""
    return min(stringWidth(text, style.fontName, style.fontSize) + 6, cap)


def compose_items(items: list[dict], layout: str, available_width: float, gap: float):
    """Arranges 1-3 pre-built {"flowable", "height", "width"} items per one
    of the 8 layout options, spaced `gap` points apart when the layout isn't
    Fill. "width" (each item's own natural, already shrink-to-fit size) is
    only required for a non-Fill horizontal row — a reportlab Table column
    left as `None` doesn't shrink-wrap to its content the way one might
    expect, it stretches to fill whatever width the Table is wrapped at, so
    every column needs its real width spelled out explicitly to sit snugly
    next to its neighbors instead of spreading out. Used for both the header
    section (image / info text area / icon area) and, recursively, the info
    text area's own lines. Returns (elements: list, total_height: float)."""
    items = [it for it in items if it.get("flowable") is not None]
    if not items:
        return [], 0

    axis, align = parse_layout(layout)
    ra = _ALIGN_NAME[align]

    if len(items) == 1:
        items[0]["flowable"].hAlign = ra
        return [items[0]["flowable"]], items[0]["height"]

    if axis == "vertical":
        elements = []
        total_h = 0.0
        for i, it in enumerate(items):
            it["flowable"].hAlign = ra
            elements.append(it["flowable"])
            total_h += it["height"]
            if i < len(items) - 1:
                elements.append(Spacer(1, gap))
                total_h += gap
        return elements, total_h

    # horizontal — one row, either evenly split (fill) or each item at its
    # own natural size with `gap` between them
    if align == "fill":
        col_w = available_width / len(items)
        row = Table([[it["flowable"] for it in items]], colWidths=[col_w] * len(items))
    else:
        cells, col_widths = [], []
        for i, it in enumerate(items):
            cells.append(it["flowable"])
            col_widths.append(it["width"])
            if i < len(items) - 1:
                cells.append(Spacer(gap, 1))
                col_widths.append(gap)
        row = Table([cells], colWidths=col_widths)
    row.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    row.hAlign = ra
    return [row], max(it["height"] for it in items)


def _text_item(paragraph, width: float, height: float) -> dict:
    """Wraps a single Paragraph as one compose_items() line item — every
    item needs an explicit width to wrap to, and its own reserved height."""
    table = Table([[paragraph]], colWidths=[width])
    table.setStyle(TableStyle([
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    return {"flowable": table, "height": height, "width": width}


TITLE_LINE_HEIGHT = 0.42 * inch
SUBLINE_HEIGHT = 0.26 * inch


def wrap_as_single_flowable(elements: list, width: float):
    """compose_items() returns a *list* of flowables (e.g. [line1, Spacer,
    line2] for a vertical arrangement) — wraps that list into ONE flowable so
    the caller can treat it as a single composable item (set .hAlign on it,
    pass it into another compose_items() call as one item, etc)."""
    if len(elements) == 1:
        return elements[0]
    rows = [[e] for e in elements]
    table = Table(rows, colWidths=[width])
    table.setStyle(TableStyle([
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    return table


def _build_room_info_area(
    room: Room, term: Term, info_layout: str, width: float, gap: float,
    name_font_scale: float = 1.0, semester_font_scale: float = 1.0,
):
    """The room export's info area — a title + subtitle line, arranged per
    the Info Text Area Layout option. Returns (flowable, height, width)."""
    axis, align = parse_layout(info_layout)
    ta = _ALIGN_TA[align]
    title_style = ParagraphStyle(
        "DoorTagTitle", parent=getSampleStyleSheet()["Title"], alignment=ta,
        fontSize=22 * name_font_scale, leading=25 * name_font_scale,
    )
    subtitle_style = ParagraphStyle(
        "DoorTagSubtitle", parent=getSampleStyleSheet()["Normal"], alignment=ta,
        fontSize=12 * semester_font_scale, textColor=colors.HexColor("#444444"),
    )
    raw_lines = [
        (room.display_label, title_style, TITLE_LINE_HEIGHT * name_font_scale),
        (f"{_term_label(term)} Schedule", subtitle_style, SUBLINE_HEIGHT * semester_font_scale),
    ]
    cap = item_width(info_layout, width, len(raw_lines))
    widths = [cap if align == "fill" else _natural_width(raw, style, cap) for raw, style, _h in raw_lines]
    lines = [_text_item(Paragraph(escape(raw), style), w, h) for (raw, style, h), w in zip(raw_lines, widths)]
    elements, height = compose_items(lines, info_layout, width, gap)
    block_width = cap if align == "fill" else (max(widths) if axis == "vertical" else sum(widths) + gap * (len(widths) - 1))
    return wrap_as_single_flowable(elements, block_width), height, block_width


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


class _OffsetFlowable(Flowable):
    """Wraps another flowable to nudge only its *drawn* position by (dx, dy)
    points — the footprint (width/height) it reserves in the surrounding
    layout is unchanged, so offsetting the header image (feedback_67) can't
    disturb the header row's own spacing/alignment math. dx positive moves
    right, dy positive moves up (reportlab's own canvas convention)."""
    def __init__(self, inner, dx: float = 0.0, dy: float = 0.0):
        Flowable.__init__(self)
        self.inner = inner
        self.dx = dx
        self.dy = dy
        self.width = getattr(inner, "width", 0)
        self.height = getattr(inner, "height", 0)
        self.hAlign = getattr(inner, "hAlign", "CENTER")

    def wrap(self, availWidth, availHeight):
        self.width, self.height = self.inner.wrap(availWidth, availHeight)
        return self.width, self.height

    def draw(self):
        self.canv.saveState()
        self.canv.translate(self.dx, self.dy)
        self.inner.drawOn(self.canv, 0, 0)
        self.canv.restoreState()


def _fit_image_band(kind: str, scope: str, content_width: float, max_height: float):
    """Loads the uploaded header/footer asset (if any) and returns
    (flowable, actual_height, actual_width) scaled to fit within
    content_width x max_height while preserving aspect ratio. Returns
    (None, 0, 0) if nothing is uploaded. The flowable is returned bare (not
    wrapped in a full-width centering Table) so callers can position it via
    its own .hAlign — defaults to CENTER, matching the old always-centered
    behavior, until a caller (see compose_info_section) overrides it. The
    caller needs the *actual* height up front to budget the rest of the page
    precisely enough to stay on one sheet. `scope` ("room" or "faculty",
    feedback_69) picks which export's own independently-uploaded asset to use."""
    path = assets.get_asset_path(kind, scope)
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
    header_layout: str = DEFAULT_LAYOUT, info_layout: str = DEFAULT_LAYOUT,
    header_scale: float = 1.0, footer_scale: float = 1.0,
    page_size: str = DEFAULT_PAGE_SIZE, orientation: str = DEFAULT_ORIENTATION,
    custom_width_in: float | None = None, custom_height_in: float | None = None,
    header_padding_in: float = DEFAULT_HEADER_PADDING_IN, info_padding_in: float = DEFAULT_INFO_PADDING_IN,
    name_font_scale: float = 1.0, semester_font_scale: float = 1.0, table_font_scale: float = 1.0,
    time_font_scale: float = 1.0, weekday_font_scale: float = 1.0,
    header_offset_x_in: float = 0.0, header_offset_y_in: float = 0.0,
    footer_offset_x_in: float = 0.0, footer_offset_y_in: float = 0.0,
) -> bytes:
    weekdays, ticks, grid = build_door_tag_grid(db, term, room)
    page_width, page_height = resolve_page_size(page_size, orientation, custom_width_in, custom_height_in)

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=(page_width, page_height),
        leftMargin=MARGIN, rightMargin=MARGIN, topMargin=MARGIN, bottomMargin=MARGIN,
    )
    content_width = page_width - 2 * MARGIN

    tfs = table_font_scale
    styles = getSampleStyleSheet()
    header_style = ParagraphStyle(
        "CellHeader", parent=styles["Normal"], fontSize=12 * weekday_font_scale, alignment=TA_CENTER,
        textColor=colors.HexColor("#222222"), fontName="Helvetica-Bold",
    )
    time_style = ParagraphStyle(
        "TimeCell", parent=styles["Normal"], fontSize=7 * time_font_scale, alignment=TA_CENTER,
        fontName="Helvetica-Bold", textColor=colors.HexColor("#333333"), leading=8 * time_font_scale,
    )
    cell_body_style = ParagraphStyle(
        "CellBody", parent=styles["Normal"], fontSize=9.5 * tfs, alignment=TA_LEFT, leading=12 * tfs,
        textColor=colors.black, fontName="Helvetica-Bold",
    )
    cell_time_style = ParagraphStyle(
        "CellTime", parent=styles["Normal"], fontSize=8 * tfs, alignment=TA_LEFT, leading=10 * tfs,
        textColor=colors.HexColor("#333333"),
    )
    empty_style = ParagraphStyle(
        "EmptyCell", parent=styles["Normal"], fontSize=8 * tfs, leading=9 * tfs, alignment=TA_CENTER,
        textColor=colors.white, fontName="Helvetica-Bold",
    )
    empty_time_style = ParagraphStyle(
        "EmptyCellTime", parent=styles["Normal"], fontSize=6.5 * tfs, leading=7.5 * tfs, alignment=TA_CENTER,
        textColor=colors.HexColor("#dddddd"),
    )
    EMPTY_PAD = (2, 2, 3, 3)  # top, bottom, left, right — tighter than the course card's

    header_flowable, header_height, header_width = _fit_image_band("header", "room", content_width, HEADER_IMAGE_MAX_HEIGHT * header_scale)
    if header_flowable is not None:
        header_flowable = _OffsetFlowable(header_flowable, header_offset_x_in * inch, header_offset_y_in * inch)
    footer_band, footer_height, _ = _fit_image_band("footer", "room", content_width, FOOTER_IMAGE_MAX_HEIGHT * footer_scale)
    if footer_band is not None:
        footer_band = _OffsetFlowable(footer_band, footer_offset_x_in * inch, footer_offset_y_in * inch)
        footer_band.hAlign = "CENTER"  # footer is never affected by the Layout option

    header_gap = max(0.0, header_padding_in) * inch
    info_gap = max(0.0, info_padding_in) * inch

    num_header_items = 1 + (1 if header_flowable else 0)
    info_width = item_width(header_layout, content_width, num_header_items)
    info_area, info_height, info_block_width = _build_room_info_area(
        room, term, info_layout, info_width, info_gap, name_font_scale, semester_font_scale,
    )

    header_items = [
        {"flowable": header_flowable, "height": header_height, "width": header_width},
        {"flowable": info_area, "height": info_height, "width": info_block_width},
    ]
    info_elements, info_section_height = compose_items(header_items, header_layout, content_width, header_gap)

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
        page_height - 2 * MARGIN - info_section_height - SECTION_GAP
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
