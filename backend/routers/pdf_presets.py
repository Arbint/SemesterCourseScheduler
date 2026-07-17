from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import PdfLayoutPreset
from schemas import PdfLayoutPresetCreate, PdfLayoutPresetOut

router = APIRouter(prefix="/api/pdf-presets", tags=["pdf_presets"])


@router.get("", response_model=list[PdfLayoutPresetOut])
def list_presets(db: Session = Depends(get_db)):
    return db.query(PdfLayoutPreset).order_by(PdfLayoutPreset.name).all()


@router.post("", response_model=PdfLayoutPresetOut, status_code=201)
def create_preset(data: PdfLayoutPresetCreate, db: Session = Depends(get_db)):
    name = data.name.strip()
    if not name:
        raise HTTPException(400, "Name is required")
    if db.query(PdfLayoutPreset).filter(PdfLayoutPreset.name == name).first():
        raise HTTPException(409, "A preset with this name already exists")
    preset = PdfLayoutPreset(name=name, config=data.config)
    db.add(preset)
    db.commit()
    db.refresh(preset)
    return preset


@router.delete("/{preset_id}", status_code=204)
def delete_preset(preset_id: int, db: Session = Depends(get_db)):
    preset = db.query(PdfLayoutPreset).filter(PdfLayoutPreset.id == preset_id).first()
    if not preset:
        raise HTTPException(404, "Preset not found")
    db.delete(preset)
    db.commit()
