from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database import get_db
from models import Semester, Weekday
from schemas import SemesterOut, WeekdayOut

router = APIRouter(tags=["static"])


@router.get("/api/semesters", response_model=list[SemesterOut])
def list_semesters(db: Session = Depends(get_db)):
    return db.query(Semester).all()


@router.get("/api/weekdays", response_model=list[WeekdayOut])
def list_weekdays(db: Session = Depends(get_db)):
    return db.query(Weekday).order_by(Weekday.display_order).all()
