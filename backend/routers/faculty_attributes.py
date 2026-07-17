from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

import faculty_attribute_assets as assets
from database import get_db
from models import FacultyAttribute
from schemas import FacultyAttributeCreate, FacultyAttributeUpdate, FacultyAttributeOut

router = APIRouter(prefix="/api/faculty-attributes", tags=["faculty_attributes"])


@router.get("", response_model=list[FacultyAttributeOut])
def list_faculty_attributes(db: Session = Depends(get_db)):
    return [FacultyAttributeOut.from_orm(a) for a in db.query(FacultyAttribute).order_by(FacultyAttribute.name).all()]


@router.post("", response_model=FacultyAttributeOut, status_code=201)
def create_faculty_attribute(data: FacultyAttributeCreate, db: Session = Depends(get_db)):
    name = data.name.strip()
    if not name:
        raise HTTPException(400, "Name is required")
    if db.query(FacultyAttribute).filter(FacultyAttribute.name == name).first():
        raise HTTPException(409, "An attribute with this name already exists")
    attribute = FacultyAttribute(name=name)
    db.add(attribute)
    db.commit()
    db.refresh(attribute)
    return FacultyAttributeOut.from_orm(attribute)


@router.put("/{attribute_id}", response_model=FacultyAttributeOut)
def update_faculty_attribute(attribute_id: int, data: FacultyAttributeUpdate, db: Session = Depends(get_db)):
    attribute = db.query(FacultyAttribute).filter(FacultyAttribute.id == attribute_id).first()
    if not attribute:
        raise HTTPException(404, "Attribute not found")
    name = data.name.strip()
    if not name:
        raise HTTPException(400, "Name is required")
    existing = db.query(FacultyAttribute).filter(FacultyAttribute.name == name, FacultyAttribute.id != attribute_id).first()
    if existing:
        raise HTTPException(409, "An attribute with this name already exists")
    attribute.name = name
    db.commit()
    db.refresh(attribute)
    return FacultyAttributeOut.from_orm(attribute)


@router.delete("/{attribute_id}", status_code=204)
def delete_faculty_attribute(attribute_id: int, db: Session = Depends(get_db)):
    attribute = db.query(FacultyAttribute).filter(FacultyAttribute.id == attribute_id).first()
    if not attribute:
        raise HTTPException(404, "Attribute not found")
    db.delete(attribute)
    db.commit()
    assets.delete_asset(attribute_id)


@router.get("/{attribute_id}/icon")
def get_faculty_attribute_icon(attribute_id: int):
    path = assets.get_asset_path(attribute_id)
    if not path:
        raise HTTPException(404, "No icon uploaded")
    return FileResponse(path, media_type=assets.content_type_for(path))


@router.post("/{attribute_id}/icon")
async def upload_faculty_attribute_icon(attribute_id: int, file: UploadFile = File(...), db: Session = Depends(get_db)):
    attribute = db.query(FacultyAttribute).filter(FacultyAttribute.id == attribute_id).first()
    if not attribute:
        raise HTTPException(404, "Attribute not found")
    content = await file.read()
    try:
        assets.save_asset(attribute_id, file.filename, content)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {"ok": True}


@router.delete("/{attribute_id}/icon", status_code=204)
def delete_faculty_attribute_icon(attribute_id: int):
    assets.delete_asset(attribute_id)
