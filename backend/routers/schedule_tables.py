from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import ScheduleTable, Weekday, Term
from schemas import ScheduleTableCreate, ScheduleTableUpdate, ScheduleTableOut

router = APIRouter(tags=["schedule_tables"])


@router.get("/api/terms/{term_id}/tables", response_model=list[ScheduleTableOut])
def list_tables(term_id: int, db: Session = Depends(get_db)):
    tables = db.query(ScheduleTable).filter(ScheduleTable.term_id == term_id).all()
    return [ScheduleTableOut.from_orm(t) for t in tables]


@router.post("/api/terms/{term_id}/tables", response_model=ScheduleTableOut, status_code=201)
def create_table(term_id: int, data: ScheduleTableCreate, db: Session = Depends(get_db)):
    term = db.query(Term).filter(Term.id == term_id).first()
    if not term:
        raise HTTPException(404, "Term not found")

    table = ScheduleTable(term_id=term_id)
    db.add(table)
    db.flush()

    weekdays = db.query(Weekday).filter(Weekday.id.in_(data.weekday_ids)).all()
    table.weekdays = weekdays

    db.commit()
    db.refresh(table)
    return ScheduleTableOut.from_orm(table)


@router.put("/api/tables/{table_id}", response_model=ScheduleTableOut)
def update_table(table_id: int, data: ScheduleTableUpdate, db: Session = Depends(get_db)):
    table = db.query(ScheduleTable).filter(ScheduleTable.id == table_id).first()
    if not table:
        raise HTTPException(404, "Table not found")

    weekdays = db.query(Weekday).filter(Weekday.id.in_(data.weekday_ids)).all()
    table.weekdays = weekdays

    db.commit()
    db.refresh(table)
    return ScheduleTableOut.from_orm(table)


@router.delete("/api/tables/{table_id}", status_code=204)
def delete_table(table_id: int, db: Session = Depends(get_db)):
    table = db.query(ScheduleTable).filter(ScheduleTable.id == table_id).first()
    if not table:
        raise HTTPException(404, "Table not found")
    db.delete(table)
    db.commit()
