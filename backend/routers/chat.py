import json
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response, StreamingResponse
from sqlalchemy.orm import Session
from database import get_db, SessionLocal
from schemas import ChatMessage
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


@router.post("/api/terms/{term_id}/chat")
def chat(term_id: int, data: ChatMessage):
    # Not using the Depends(get_db) request-scoped session here: FastAPI
    # closes yield-dependencies as soon as the path function returns, which
    # for a StreamingResponse happens before the generator body (and the
    # agent's DB queries within it) actually runs. Own the session's
    # lifetime for the length of the stream instead.
    db = SessionLocal()
    term = db.query(Term).filter(Term.id == term_id).first()
    if not term:
        db.close()
        raise HTTPException(404, "Term not found")

    key = f"{data.session_id}:{term_id}"
    agent = _get_agent(data.session_id, db, term_id)

    def event_stream():
        final_text = "no response"
        try:
            try:
                for step in agent.ProcessNewUserInputStream(data.message):
                    if step["type"] == "final":
                        final_text = step["text"]
                    else:
                        yield f"data: {json.dumps(step)}\n\n"
            except Exception as e:
                # Drop the cached session so a corrupted message history
                # (e.g. a dangling tool_use from a prior tool error) doesn't
                # keep failing on every subsequent message. The user can
                # just retry.
                _sessions.pop(key, None)
                yield f"data: {json.dumps({'type': 'error', 'error': str(e)})}\n\n"
                return

            # Extract highlighted course IDs / proposal from the agent's tool calls
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
                                    parsed = json.loads(result)
                                    if "highlighted_course_ids" in parsed:
                                        highlighted_ids = parsed["highlighted_course_ids"]
                                    if "proposal_id" in parsed:
                                        proposal = parsed
                                        _proposals[parsed["proposal_id"]] = agent
                            except Exception:
                                pass
                if highlighted_ids or proposal:
                    break

            done = {
                "type": "done",
                "text": final_text,
                "highlighted_course_ids": highlighted_ids,
                "proposal": proposal,
            }
            yield f"data: {json.dumps(done)}\n\n"
        finally:
            db.close()

    return StreamingResponse(event_stream(), media_type="text/event-stream")


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
