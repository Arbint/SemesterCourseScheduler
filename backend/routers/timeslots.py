from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import TimeSlot
from schemas import TimeSlotCreate, TimeSlotUpdate, TimeSlotOut

router = APIRouter(prefix="/api/timeslots", tags=["timeslots"])


@router.get("", response_model=list[TimeSlotOut])
def list_timeslots(db: Session = Depends(get_db)):
    return db.query(TimeSlot).order_by(TimeSlot.display_order).all()


@router.post("", response_model=TimeSlotOut, status_code=201)
def create_timeslot(data: TimeSlotCreate, db: Session = Depends(get_db)):
    ts = TimeSlot(**data.model_dump())
    db.add(ts)
    db.commit()
    db.refresh(ts)
    return ts


@router.get("/{ts_id}", response_model=TimeSlotOut)
def get_timeslot(ts_id: int, db: Session = Depends(get_db)):
    ts = db.query(TimeSlot).filter(TimeSlot.id == ts_id).first()
    if not ts:
        raise HTTPException(404, "Time slot not found")
    return ts


@router.put("/{ts_id}", response_model=TimeSlotOut)
def update_timeslot(ts_id: int, data: TimeSlotUpdate, db: Session = Depends(get_db)):
    ts = db.query(TimeSlot).filter(TimeSlot.id == ts_id).first()
    if not ts:
        raise HTTPException(404, "Time slot not found")
    for k, v in data.model_dump().items():
        setattr(ts, k, v)
    db.commit()
    db.refresh(ts)
    return ts


@router.delete("/{ts_id}", status_code=204)
def delete_timeslot(ts_id: int, db: Session = Depends(get_db)):
    ts = db.query(TimeSlot).filter(TimeSlot.id == ts_id).first()
    if not ts:
        raise HTTPException(404, "Time slot not found")
    db.delete(ts)
    db.commit()
