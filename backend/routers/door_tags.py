from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session

from database import get_db
from door_tag_pdf import generate_door_tag_pdf
from models import Room, Term

router = APIRouter(prefix="/api/door-tags", tags=["door-tags"])


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
