from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database import get_db
from models import LoadSettings
from schemas import LoadSettingsOut, LoadSettingsUpdate

router = APIRouter(prefix="/api/load-settings", tags=["load_settings"])


def get_or_create_settings(db: Session) -> LoadSettings:
    settings = db.query(LoadSettings).first()
    if not settings:
        settings = LoadSettings(id=1, fulltime_load=3, parttime_load=2)
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return settings


@router.get("", response_model=LoadSettingsOut)
def get_load_settings(db: Session = Depends(get_db)):
    return get_or_create_settings(db)


@router.put("", response_model=LoadSettingsOut)
def update_load_settings(data: LoadSettingsUpdate, db: Session = Depends(get_db)):
    settings = get_or_create_settings(db)
    settings.fulltime_load = data.fulltime_load
    settings.parttime_load = data.parttime_load
    settings.min_office_hours_per_week = data.min_office_hours_per_week
    db.commit()
    db.refresh(settings)
    return settings
