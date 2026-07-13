import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from supabase import Client, create_client


app = FastAPI(title="Stroop API", version="1.0.0")

def parse_allowed_origins(raw_value: str) -> List[str]:
    origins: List[str] = []
    for raw_origin in raw_value.split(","):
        origin = raw_origin.strip().rstrip("/")
        if origin:
            origins.append(origin)
    return origins


allowed_origins = parse_allowed_origins(os.getenv("ALLOWED_ORIGINS", ""))
allow_origin_regex = os.getenv("ALLOWED_ORIGIN_REGEX", "").strip() or None

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=allow_origin_regex,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class TrialResult(BaseModel):
    trialNum: int
    type: str
    word: str
    printColor: str
    response: str
    rt: Optional[int]
    correct: bool


class SessionPayload(BaseModel):
    participant_id: str = Field(min_length=1, max_length=128)
    study_day: str = Field(min_length=1, max_length=32)
    session_label: str = Field(min_length=1, max_length=32)
    summary: Dict[str, Any]
    interference_score: Optional[int] = None
    overall_accuracy: int = Field(ge=0, le=100)
    trials: List[TrialResult]
    client_submitted_at: Optional[str] = None
    user_agent: Optional[str] = None
    viewport: Optional[str] = None


def extract_error_detail(exc: Exception) -> str:
    # Supabase/PostgREST exceptions may expose a structured JSON payload in different attributes.
    response = getattr(exc, "response", None)
    if isinstance(response, dict):
        message = response.get("message") or response.get("error_description")
        details = response.get("details")
        hint = response.get("hint")
        pieces = [piece for piece in [message, details, hint] if piece]
        if pieces:
            return " | ".join(str(piece) for piece in pieces)

    for attr in ["message", "details", "hint"]:
        value = getattr(exc, attr, None)
        if value:
            return str(value)

    text = str(exc)
    return text if text else "Unknown backend error"


def get_supabase() -> Client:
    url = (os.getenv("SUPABASE_URL") or "").strip().strip('"').strip("'")
    key = (os.getenv("SUPABASE_SERVICE_ROLE_KEY") or "").strip().strip('"').strip("'")

    if not url or not key:
        raise HTTPException(
            status_code=500,
            detail="Supabase credentials are not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
        )

    try:
        return create_client(url, key)
    except Exception as exc:  # pragma: no cover
        raise HTTPException(
            status_code=500,
            detail={
                "message": "Invalid Supabase configuration",
                "error": extract_error_detail(exc),
                "hint": "Verify SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel env vars without quotes.",
            },
        ) from exc


@app.get("/api/health")
def health_check() -> Dict[str, str]:
    return {"status": "ok", "service": "stroop-backend"}


@app.get("/api/health/db")
def db_health_check() -> Dict[str, Any]:
    supabase = get_supabase()

    try:
        response = supabase.table("stroop_results").select("id").limit(1).execute()
    except Exception as exc:  # pragma: no cover
        raise HTTPException(
            status_code=500,
            detail={
                "message": "Supabase query failed",
                "error": extract_error_detail(exc),
            },
        ) from exc

    return {
        "status": "ok",
        "table": "stroop_results",
        "rows_returned": len(response.data or []),
        "env": {
            "has_supabase_url": bool(os.getenv("SUPABASE_URL")),
            "has_service_role_key": bool(os.getenv("SUPABASE_SERVICE_ROLE_KEY")),
        },
    }


@app.options("/api/{rest_of_path:path}")
def preflight_handler(rest_of_path: str) -> Response:
    # CORSMiddleware injects actual CORS headers. This endpoint ensures OPTIONS always resolves.
    return Response(status_code=204)


@app.post("/api/results")
def create_result(payload: SessionPayload) -> Dict[str, str]:
    supabase = get_supabase()

    row = {
        "participant_id": payload.participant_id,
        "study_day": payload.study_day,
        "session_label": payload.session_label,
        "summary": payload.summary,
        "interference_score": payload.interference_score,
        "overall_accuracy": payload.overall_accuracy,
        "trials": [trial.model_dump() for trial in payload.trials],
        "client_submitted_at": payload.client_submitted_at,
        "user_agent": payload.user_agent,
        "viewport": payload.viewport,
        "received_at": datetime.now(timezone.utc).isoformat(),
    }

    try:
        response = supabase.table("stroop_results").insert(row).execute()
    except Exception as exc:  # pragma: no cover
        raise HTTPException(
            status_code=500,
            detail={
                "message": "Failed to save result",
                "error": extract_error_detail(exc),
                "context": {
                    "participant_id": payload.participant_id,
                    "session_label": payload.session_label,
                    "trial_count": len(payload.trials),
                },
            },
        ) from exc

    data = response.data or []
    if not data:
        raise HTTPException(status_code=500, detail="Result was not stored in Supabase.")

    return {"status": "saved", "result_id": str(data[0].get("id", "unknown"))}


@app.get("/api/results")
def list_results(participant_id: Optional[str] = None, limit: int = 50) -> Dict[str, Any]:
    supabase = get_supabase()
    safe_limit = max(1, min(limit, 500))

    query = supabase.table("stroop_results").select("*").order("created_at", desc=True).limit(safe_limit)
    if participant_id:
        query = query.eq("participant_id", participant_id)

    try:
        response = query.execute()
    except Exception as exc:  # pragma: no cover
        raise HTTPException(
            status_code=500,
            detail={
                "message": "Failed to query results",
                "error": extract_error_detail(exc),
            },
        ) from exc

    return {"count": len(response.data or []), "items": response.data or []}
