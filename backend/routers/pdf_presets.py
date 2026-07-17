from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import PdfLayoutPreset
from schemas import PdfLayoutPresetCreate, PdfLayoutPresetOut, PdfLayoutPresetUpdate

router = APIRouter(prefix="/api/pdf-presets", tags=["pdf_presets"])

SCOPES = ("room", "faculty")


@router.get("", response_model=list[PdfLayoutPresetOut])
def list_presets(scope: str, db: Session = Depends(get_db)):
    if scope not in SCOPES:
        raise HTTPException(400, "Invalid scope")
    return db.query(PdfLayoutPreset).filter(PdfLayoutPreset.scope == scope).order_by(PdfLayoutPreset.name).all()


@router.post("", response_model=PdfLayoutPresetOut, status_code=201)
def create_preset(data: PdfLayoutPresetCreate, db: Session = Depends(get_db)):
    if data.scope not in SCOPES:
        raise HTTPException(400, "Invalid scope")
    name = data.name.strip()
    if not name:
        raise HTTPException(400, "Name is required")
    if db.query(PdfLayoutPreset).filter(PdfLayoutPreset.name == name, PdfLayoutPreset.scope == data.scope).first():
        raise HTTPException(409, "A preset with this name already exists")
    preset = PdfLayoutPreset(name=name, scope=data.scope, config=data.config)
    db.add(preset)
    db.commit()
    db.refresh(preset)
    return preset


@router.patch("/{preset_id}", response_model=PdfLayoutPresetOut)
def rename_preset(preset_id: int, data: PdfLayoutPresetUpdate, db: Session = Depends(get_db)):
    preset = db.query(PdfLayoutPreset).filter(PdfLayoutPreset.id == preset_id).first()
    if not preset:
        raise HTTPException(404, "Preset not found")
    name = data.name.strip()
    if not name:
        raise HTTPException(400, "Name is required")
    existing = db.query(PdfLayoutPreset).filter(
        PdfLayoutPreset.name == name, PdfLayoutPreset.scope == preset.scope, PdfLayoutPreset.id != preset_id,
    ).first()
    if existing:
        raise HTTPException(409, "A preset with this name already exists")
    preset.name = name
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
