from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse, Response
from sqlalchemy.orm import Session

import door_tag_assets as assets
from database import get_db
from door_tag_pdf import generate_door_tag_pdf
from models import Room, Term

router = APIRouter(prefix="/api/door-tags", tags=["door-tags"])

ASSET_KINDS = ("header", "footer")


@router.get("/pdf")
def door_tag_pdf(term_id: int, room_id: int, empty_label: str = "OPEN", db: Session = Depends(get_db)):
    term = db.query(Term).filter(Term.id == term_id).first()
    if not term:
        raise HTTPException(404, "Term not found")
    room = db.query(Room).filter(Room.id == room_id).first()
    if not room:
        raise HTTPException(404, "Room not found")

    content = generate_door_tag_pdf(db, term, room, empty_label)
    filename = f"door_tag_{room.building_code}{room.room_number}_{term.year}.pdf"
    return Response(
        content=content,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get("/{kind}-image")
def get_asset_image(kind: str):
    if kind not in ASSET_KINDS:
        raise HTTPException(404, "Not found")
    path = assets.get_asset_path(kind)
    if not path:
        raise HTTPException(404, "No image uploaded")
    return FileResponse(path, media_type=assets.content_type_for(path))


@router.post("/{kind}-image")
async def upload_asset_image(kind: str, file: UploadFile = File(...)):
    if kind not in ASSET_KINDS:
        raise HTTPException(404, "Not found")
    content = await file.read()
    try:
        assets.save_asset(kind, file.filename, content)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {"kind": kind, "filename": file.filename}


@router.delete("/{kind}-image", status_code=204)
def delete_asset_image(kind: str):
    if kind not in ASSET_KINDS:
        raise HTTPException(404, "Not found")
    assets.delete_asset(kind)
