"""Authenticated FastAPI wrapper around the football analysis contract."""

from __future__ import annotations

import hmac
import json
import os

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse

from mines_lab_analysis.football import FootballAnalysisError, evaluate_forecasts, validate_provider_forecast

MAX_BODY_BYTES = 1_048_576
SERVICE_TOKEN = os.environ.get("FOOTBALL_MODEL_API_TOKEN", "")
app = FastAPI(title="Mines Lab Football Analysis", version="1")


def _authorize(request: Request) -> None:
    supplied = request.headers.get("authorization", "")
    if len(SERVICE_TOKEN) < 32 or not hmac.compare_digest(supplied, f"Bearer {SERVICE_TOKEN}"):
        raise HTTPException(status_code=401, detail="Unauthorized.")


async def _json_body(request: Request) -> object:
    content_type = request.headers.get("content-type", "").split(";", 1)[0].strip().lower()
    if content_type != "application/json":
        raise HTTPException(status_code=415, detail="Use application/json.")
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > MAX_BODY_BYTES:
            raise HTTPException(status_code=413, detail="Request body is too large.")
    try:
        return json.loads(body)
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise HTTPException(status_code=400, detail="Request body must be valid JSON.") from error


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "football-analysis"}


@app.post("/v1/validate-predictions")
async def validate_predictions(request: Request) -> JSONResponse:
    _authorize(request)
    try:
        result = validate_provider_forecast(await _json_body(request))
    except FootballAnalysisError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return JSONResponse(result)


@app.post("/v1/evaluate")
async def evaluate(request: Request) -> dict[str, object]:
    _authorize(request)
    body = await _json_body(request)
    if not isinstance(body, dict):
        raise HTTPException(status_code=400, detail="Request must be an object.")
    try:
        return evaluate_forecasts(body.get("records"))
    except FootballAnalysisError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
