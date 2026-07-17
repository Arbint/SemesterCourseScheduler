from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse, Response
from sqlalchemy.orm import Session

import door_tag_assets as assets
from database import get_db
from door_tag_pdf import (
    generate_door_tag_pdf, DEFAULT_LAYOUT, DEFAULT_PAGE_SIZE, DEFAULT_ORIENTATION,
    DEFAULT_HEADER_PADDING_IN, DEFAULT_INFO_PADDING_IN,
)
from models import DoorTagSettings, Room, Term
from schemas import DoorTagSettingsOut, DoorTagSettingsUpdate

router = APIRouter(prefix="/api/door-tags", tags=["door-tags"])

ASSET_KINDS = ("header", "footer")
ASSET_SCOPES = ("room", "faculty")


def _get_or_create_door_tag_settings(db: Session) -> DoorTagSettings:
    settings = db.query(DoorTagSettings).first()
    if not settings:
        settings = DoorTagSettings(id=1, department_empty_label="OPEN", shared_empty_label="OPEN")
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return settings


@router.get("/settings", response_model=DoorTagSettingsOut)
def get_door_tag_settings(db: Session = Depends(get_db)):
    return _get_or_create_door_tag_settings(db)


@router.put("/settings", response_model=DoorTagSettingsOut)
def update_door_tag_settings(data: DoorTagSettingsUpdate, db: Session = Depends(get_db)):
    settings = _get_or_create_door_tag_settings(db)
    settings.department_empty_label = data.department_empty_label
    settings.shared_empty_label = data.shared_empty_label
    db.commit()
    db.refresh(settings)
    return settings


@router.get("/pdf")
def door_tag_pdf(
    term_id: int, room_id: int, empty_label: str = "OPEN",
    header_layout: str = DEFAULT_LAYOUT, info_layout: str = DEFAULT_LAYOUT,
    header_scale: float = 1.0, footer_scale: float = 1.0,
    page_size: str = DEFAULT_PAGE_SIZE, orientation: str = DEFAULT_ORIENTATION,
    custom_width_in: float | None = None, custom_height_in: float | None = None,
    header_padding_in: float = DEFAULT_HEADER_PADDING_IN, info_padding_in: float = DEFAULT_INFO_PADDING_IN,
    name_font_scale: float = 1.0, semester_font_scale: float = 1.0, table_font_scale: float = 1.0,
    time_font_scale: float = 1.0, weekday_font_scale: float = 1.0,
    header_offset_x_in: float = 0.0, header_offset_y_in: float = 0.0,
    footer_offset_x_in: float = 0.0, footer_offset_y_in: float = 0.0,
    inline: bool = False,
    db: Session = Depends(get_db),
):
    term = db.query(Term).filter(Term.id == term_id).first()
    if not term:
        raise HTTPException(404, "Term not found")
    room = db.query(Room).filter(Room.id == room_id).first()
    if not room:
        raise HTTPException(404, "Room not found")

    header_scale = max(0.25, min(3.0, header_scale))
    footer_scale = max(0.25, min(3.0, footer_scale))
    header_padding_in = max(0.0, min(2.0, header_padding_in))
    info_padding_in = max(0.0, min(2.0, info_padding_in))
    name_font_scale = max(0.25, min(3.0, name_font_scale))
    semester_font_scale = max(0.25, min(3.0, semester_font_scale))
    table_font_scale = max(0.25, min(3.0, table_font_scale))
    time_font_scale = max(0.25, min(3.0, time_font_scale))
    weekday_font_scale = max(0.25, min(3.0, weekday_font_scale))
    header_offset_x_in = max(-5.0, min(5.0, header_offset_x_in))
    header_offset_y_in = max(-5.0, min(5.0, header_offset_y_in))
    footer_offset_x_in = max(-5.0, min(5.0, footer_offset_x_in))
    footer_offset_y_in = max(-5.0, min(5.0, footer_offset_y_in))
    content = generate_door_tag_pdf(
        db, term, room, empty_label, header_layout, info_layout, header_scale, footer_scale,
        page_size, orientation, custom_width_in, custom_height_in, header_padding_in, info_padding_in,
        name_font_scale, semester_font_scale, table_font_scale, time_font_scale, weekday_font_scale,
        header_offset_x_in, header_offset_y_in, footer_offset_x_in, footer_offset_y_in,
    )
    filename = f"door_tag_{room.building_code}{room.room_number}_{term.year}.pdf"
    disposition = "inline" if inline else "attachment"
    return Response(
        content=content,
        media_type="application/pdf",
        headers={"Content-Disposition": f"{disposition}; filename={filename}"},
    )


@router.get("/{kind}-image")
def get_asset_image(kind: str, scope: str):
    if kind not in ASSET_KINDS or scope not in ASSET_SCOPES:
        raise HTTPException(404, "Not found")
    path = assets.get_asset_path(kind, scope)
    if not path:
        raise HTTPException(404, "No image uploaded")
    return FileResponse(path, media_type=assets.content_type_for(path))


@router.post("/{kind}-image")
async def upload_asset_image(kind: str, scope: str, file: UploadFile = File(...)):
    if kind not in ASSET_KINDS or scope not in ASSET_SCOPES:
        raise HTTPException(404, "Not found")
    content = await file.read()
    try:
        assets.save_asset(kind, scope, file.filename, content)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {"kind": kind, "scope": scope, "filename": file.filename}


@router.delete("/{kind}-image", status_code=204)
def delete_asset_image(kind: str, scope: str):
    if kind not in ASSET_KINDS or scope not in ASSET_SCOPES:
        raise HTTPException(404, "Not found")
    assets.delete_asset(kind, scope)
