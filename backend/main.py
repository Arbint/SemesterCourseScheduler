from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from database import engine, Base
import models  # ensure all models are registered

from routers import (
    faculty, courses, rooms, timeslots, constraints,
    terms, schedule_tables, schedule_entries, sections, chat, static_data, load, auth, load_settings,
    change_list, door_tags, meetings, office_hours
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
    _migrate_db()
    _seed_static_data()


def _migrate_db():
    from sqlalchemy import text
    with engine.connect() as conn:
        try:
            conn.execute(text("ALTER TABLE rooms ADD COLUMN is_online BOOLEAN NOT NULL DEFAULT 0"))
            conn.commit()
        except Exception:
            pass  # Column already exists


def _seed_static_data():
    from database import SessionLocal
    from models import Semester, Weekday, LoadSettings, SemesterEnum, WeekdayEnum

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

        if db.query(LoadSettings).count() == 0:
            db.add(LoadSettings(id=1, fulltime_load=3, parttime_load=2))
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
app.include_router(load.router)
app.include_router(load_settings.router)
app.include_router(auth.router)
app.include_router(change_list.router)
app.include_router(door_tags.router)
app.include_router(meetings.router)
app.include_router(office_hours.router)


if __name__ == "__main__":
    import socket
    import pathlib
    import uvicorn

    def _find_free_port(start: int = 8000, end: int = 8020) -> int:
        for p in range(start, end + 1):
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
                try:
                    s.bind(("", p))
                    return p
                except OSError:
                    continue
        return start

    port = _find_free_port()
    pathlib.Path(__file__).parent.parent.joinpath(".backend_port").write_text(str(port))
    print(f"Backend starting on port {port}")
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
