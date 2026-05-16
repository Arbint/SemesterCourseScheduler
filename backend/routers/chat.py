import re
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session
from database import get_db
from schemas import ChatMessage, ChatResponse
from models import Term

router = APIRouter(tags=["chat"])

# Per-session agent instances
_sessions: dict[str, object] = {}
# Per-session pending proposals (proposal_id -> agent reference)
_proposals: dict[str, object] = {}


def _get_agent(session_id: str, db: Session, term_id: int):
    from agents.schedule_audit_agent import ScheduleAuditAgent
    key = f"{session_id}:{term_id}"
    if key not in _sessions:
        _sessions[key] = ScheduleAuditAgent(db, term_id)
    else:
        # Update db reference for new request
        _sessions[key].db = db
    return _sessions[key]


@router.post("/api/terms/{term_id}/chat", response_model=ChatResponse)
def chat(term_id: int, data: ChatMessage, db: Session = Depends(get_db)):
    term = db.query(Term).filter(Term.id == term_id).first()
    if not term:
        raise HTTPException(404, "Term not found")

    agent = _get_agent(data.session_id, db, term_id)

    try:
        response_text = agent.ProcessNewUserInput(data.message)
    except Exception as e:
        raise HTTPException(500, f"Agent error: {str(e)}")

    # Extract highlighted course IDs from agent's last tool calls
    highlighted_ids = []
    proposal = None

    for msg in reversed(agent.messages):
        content = msg.get("content", [])
        if isinstance(content, list):
            for block in content:
                if isinstance(block, dict) and block.get("type") == "tool_result":
                    try:
                        result = block.get("content", "{}")
                        if isinstance(result, str):
                            parsed = __import__("json").loads(result)
                            if "highlighted_course_ids" in parsed:
                                highlighted_ids = parsed["highlighted_course_ids"]
                            if "proposal_id" in parsed:
                                proposal = parsed
                                _proposals[parsed["proposal_id"]] = agent
                    except Exception:
                        pass
        if highlighted_ids or proposal:
            break

    return ChatResponse(
        text=response_text,
        highlighted_course_ids=highlighted_ids,
        proposal=proposal,
    )


@router.post("/api/chat/proposals/{proposal_id}/approve")
def approve_proposal(proposal_id: str, db: Session = Depends(get_db)):
    agent = _proposals.get(proposal_id)
    if not agent:
        raise HTTPException(404, "Proposal not found")
    agent.db = db
    result = agent.apply_approved_proposal(proposal_id)
    if proposal_id in _proposals:
        del _proposals[proposal_id]
    return result


@router.post("/api/chat/proposals/{proposal_id}/reject", status_code=204)
def reject_proposal(proposal_id: str):
    if proposal_id in _proposals:
        agent = _proposals[proposal_id]
        if proposal_id in agent._proposals:
            del agent._proposals[proposal_id]
        del _proposals[proposal_id]


@router.get("/api/terms/{term_id}/export")
def export_term(term_id: int, db: Session = Depends(get_db)):
    from export import generate_excel
    try:
        content = generate_excel(db, term_id)
    except ValueError as e:
        raise HTTPException(404, str(e))
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=schedule_{term_id}.xlsx"}
    )
