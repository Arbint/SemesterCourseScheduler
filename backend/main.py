from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from database import engine, Base
import models  # ensure all models are registered

from routers import (
    faculty, courses, rooms, timeslots, constraints,
    terms, schedule_tables, schedule_entries, sections, chat, static_data
)

app = FastAPI(title="Semester Course Scheduler")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    return JSONResponse(status_code=500, content={"detail": str(exc)})


@app.on_event("startup")
async def startup():
    Base.metadata.create_all(bind=engine)
    _seed_static_data()


def _seed_static_data():
    from database import SessionLocal
    from models import Semester, Weekday, SemesterEnum, WeekdayEnum

    db = SessionLocal()
    try:
        if db.query(Semester).count() == 0:
            for name in SemesterEnum:
                db.add(Semester(name=name))
            db.commit()

        if db.query(Weekday).count() == 0:
            weekdays = [
                (WeekdayEnum.mon, 1),
                (WeekdayEnum.tue, 2),
                (WeekdayEnum.wed, 3),
                (WeekdayEnum.thu, 4),
                (WeekdayEnum.fri, 5),
            ]
            for name, order in weekdays:
                db.add(Weekday(name=name, display_order=order))
            db.commit()
    finally:
        db.close()


@app.get("/health")
def health():
    return {"status": "ok"}


app.include_router(faculty.router)
app.include_router(courses.router)
app.include_router(rooms.router)
app.include_router(timeslots.router)
app.include_router(constraints.router)
app.include_router(terms.router)
app.include_router(schedule_tables.router)
app.include_router(schedule_entries.router)
app.include_router(sections.router)
app.include_router(chat.router)
app.include_router(static_data.router)
