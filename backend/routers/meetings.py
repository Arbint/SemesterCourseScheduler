from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import Meeting, ScheduleEntry, Term
from schemas import MeetingCreate, MeetingUpdate, MeetingOut

router = APIRouter(prefix="/api", tags=["meetings"])


@router.get("/terms/{term_id}/meetings", response_model=list[MeetingOut])
def list_meetings(term_id: int, db: Session = Depends(get_db)):
    return db.query(Meeting).filter(Meeting.term_id == term_id).all()


@router.post("/terms/{term_id}/meetings", response_model=MeetingOut, status_code=201)
def create_meeting(term_id: int, data: MeetingCreate, db: Session = Depends(get_db)):
    term = db.query(Term).filter(Term.id == term_id).first()
    if not term:
        raise HTTPException(404, "Term not found")
    if not data.name.strip():
        raise HTTPException(400, "Name is required")

    meeting = Meeting(term_id=term_id, name=data.name.strip(), duration_minutes=data.duration_minutes, frequency=data.frequency)
    db.add(meeting)
    db.flush()

    # One unscheduled placeholder entry, same idea as a course's auto-populated
    # section — this is what makes the meeting show up as a draggable card.
    db.add(ScheduleEntry(term_id=term_id, meeting_id=meeting.id, section=1))

    db.commit()
    db.refresh(meeting)
    return meeting


@router.put("/meetings/{meeting_id}", response_model=MeetingOut)
def update_meeting(meeting_id: int, data: MeetingUpdate, db: Session = Depends(get_db)):
    meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
    if not meeting:
        raise HTTPException(404, "Meeting not found")
    if not data.name.strip():
        raise HTTPException(400, "Name is required")

    meeting.name = data.name.strip()
    meeting.duration_minutes = data.duration_minutes
    meeting.frequency = data.frequency
    db.commit()
    db.refresh(meeting)
    return meeting


@router.delete("/meetings/{meeting_id}", status_code=204)
def delete_meeting(meeting_id: int, db: Session = Depends(get_db)):
    meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
    if not meeting:
        raise HTTPException(404, "Meeting not found")
    db.delete(meeting)
    db.commit()
