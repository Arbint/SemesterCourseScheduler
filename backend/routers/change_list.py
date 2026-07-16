from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response
from sqlalchemy.orm import Session

import change_list as cl
from database import get_db
from models import Term
from schemas import (
    ChangeListComputedRowOut,
    ChangeListComputeOut,
    ChangeListComputeRequest,
    ChangeListParseOut,
    ChangeListRowOut,
)

router = APIRouter(prefix="/api/change-list", tags=["change-list"])


@router.post("/parse", response_model=ChangeListParseOut)
async def parse_draft(file: UploadFile = File(...)):
    content = await file.read()
    try:
        sheets = cl.parse_workbook(content)
    except Exception as e:
        raise HTTPException(400, f"Could not parse workbook: {e}")
    return ChangeListParseOut(
        departments=list(sheets.keys()),
        sheets={name: [ChangeListRowOut(**r) for r in rows] for name, rows in sheets.items()},
    )


def _compute_rows(data: ChangeListComputeRequest, db: Session):
    term = db.query(Term).filter(Term.id == data.term_id).first()
    if not term:
        raise HTTPException(404, "Term not found")
    old_rows = [r.model_dump() for r in data.old_rows]
    new_rows = cl.build_new_rows(db, term, data.department)
    computed = cl.diff(old_rows, new_rows, data.enrollment_overrides)
    return term, computed


@router.post("/compute", response_model=ChangeListComputeOut)
def compute(data: ChangeListComputeRequest, db: Session = Depends(get_db)):
    _, computed = _compute_rows(data, db)
    allowed = ChangeListRowOut.model_fields
    return ChangeListComputeOut(
        rows=[
            ChangeListComputedRowOut(
                row_key=r["row_key"],
                status=r["status"],
                changed_fields=r["changed_fields"],
                values=ChangeListRowOut(**{k: v for k, v in r["values"].items() if k in allowed}),
                original_enrollment_max=r["original_enrollment_max"],
            )
            for r in computed
        ]
    )


@router.post("/export")
def export(data: ChangeListComputeRequest, db: Session = Depends(get_db)):
    term, computed = _compute_rows(data, db)
    content = cl.to_excel(computed, data.department, term)
    name_suffix = f"_{term.name.replace(' ', '')}" if term.name else ""
    filename = f"change_list_{data.department}_{term.year}{name_suffix}.xlsx"
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
