from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session
from database import get_db
from models import TaughtWithGroup, TaughtWithMember, CoReqGroup, CoReqMember
from schemas import TaughtWithGroupOut, CoReqGroupOut

router = APIRouter(prefix="/api", tags=["constraints"])


# --- TaughtWith ---

@router.get("/taughtwith", response_model=list[TaughtWithGroupOut])
def list_taughtwith(db: Session = Depends(get_db)):
    groups = db.query(TaughtWithGroup).all()
    return [TaughtWithGroupOut.from_orm(g) for g in groups]


@router.post("/taughtwith", response_model=TaughtWithGroupOut, status_code=201)
def create_taughtwith(db: Session = Depends(get_db)):
    group = TaughtWithGroup()
    db.add(group)
    db.commit()
    db.refresh(group)
    return TaughtWithGroupOut.from_orm(group)


@router.delete("/taughtwith/{group_id}", status_code=204)
def delete_taughtwith(group_id: int, db: Session = Depends(get_db)):
    g = db.query(TaughtWithGroup).filter(TaughtWithGroup.id == group_id).first()
    if not g:
        raise HTTPException(404, "Group not found")
    db.delete(g)
    db.commit()


@router.post("/taughtwith/{group_id}/courses/{course_id}", status_code=201)
def add_taughtwith_course(group_id: int, course_id: int, db: Session = Depends(get_db)):
    existing_member = db.query(TaughtWithMember).filter(TaughtWithMember.course_id == course_id).first()
    if existing_member:
        raise HTTPException(409, "Course already belongs to a TaughtWith group")
    # The first course added to a group becomes its lead (sort_order 0),
    # always displayed first thereafter (feedback_80).
    max_order = db.query(func.max(TaughtWithMember.sort_order)).filter(TaughtWithMember.group_id == group_id).scalar()
    next_order = 0 if max_order is None else max_order + 1
    db.add(TaughtWithMember(group_id=group_id, course_id=course_id, sort_order=next_order))
    db.commit()
    return {"ok": True}


@router.delete("/taughtwith/{group_id}/courses/{course_id}", status_code=204)
def remove_taughtwith_course(group_id: int, course_id: int, db: Session = Depends(get_db)):
    row = db.query(TaughtWithMember).filter_by(group_id=group_id, course_id=course_id).first()
    if not row:
        raise HTTPException(404, "Not found")
    db.delete(row)
    db.commit()


# --- CoReq ---

@router.get("/coreq", response_model=list[CoReqGroupOut])
def list_coreq(db: Session = Depends(get_db)):
    groups = db.query(CoReqGroup).all()
    return [CoReqGroupOut.from_orm(g) for g in groups]


@router.post("/coreq", response_model=CoReqGroupOut, status_code=201)
def create_coreq(db: Session = Depends(get_db)):
    group = CoReqGroup()
    db.add(group)
    db.commit()
    db.refresh(group)
    return CoReqGroupOut.from_orm(group)


@router.delete("/coreq/{group_id}", status_code=204)
def delete_coreq(group_id: int, db: Session = Depends(get_db)):
    g = db.query(CoReqGroup).filter(CoReqGroup.id == group_id).first()
    if not g:
        raise HTTPException(404, "Group not found")
    db.delete(g)
    db.commit()


@router.post("/coreq/{group_id}/courses/{course_id}", status_code=201)
def add_coreq_course(group_id: int, course_id: int, db: Session = Depends(get_db)):
    existing = db.query(CoReqMember).filter_by(group_id=group_id, course_id=course_id).first()
    if existing:
        raise HTTPException(409, "Already in group")
    db.add(CoReqMember(group_id=group_id, course_id=course_id))
    db.commit()
    return {"ok": True}


@router.delete("/coreq/{group_id}/courses/{course_id}", status_code=204)
def remove_coreq_course(group_id: int, course_id: int, db: Session = Depends(get_db)):
    row = db.query(CoReqMember).filter_by(group_id=group_id, course_id=course_id).first()
    if not row:
        raise HTTPException(404, "Not found")
    db.delete(row)
    db.commit()
