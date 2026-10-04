"""FastAPI wrapper. Run from services/forecast:  uvicorn forecast_service.api:app --host 127.0.0.1 --port 8000

Auth: every endpoint except /v1/health requires `Authorization: Bearer <FORECAST_API_KEY>`
(the backend sends its AI_API_KEY). Startup fails without a key unless
FORECAST_ALLOW_UNAUTHENTICATED=true is set (local development only).
Backend config: AI_API_URL=http://127.0.0.1:8000/v1 (the backend calls {AI_API_URL}/forecast).
"""
import hmac, os
from contextlib import asynccontextmanager
from typing import Literal
from fastapi import Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, StrictInt, StrictStr
from .service import ForecastService, ApiError

svc: ForecastService = None


def _auth_settings():
    key = os.getenv("FORECAST_API_KEY", "")
    allow_open = os.getenv("FORECAST_ALLOW_UNAUTHENTICATED", "").lower() == "true"
    return key, allow_open


@asynccontextmanager
async def lifespan(app):
    global svc
    key, allow_open = _auth_settings()
    if not key and not allow_open:
        raise RuntimeError("FORECAST_API_KEY is not set (set FORECAST_ALLOW_UNAUTHENTICATED=true for local development only)")
    svc = ForecastService()
    svc._fit(10)           # warm the fit cache so the first request is fast
    yield


app = FastAPI(title="Nifty 50 Forecast Service", version="1.0", lifespan=lifespan)


class Underlying(BaseModel):
    model_config = ConfigDict(extra="forbid")
    symbol: StrictStr
    assetClass: Literal["index", "equity", "fx"]


class ForecastRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    underlying: Underlying
    tenorDays: StrictInt
    trainingWindowYears: Literal[5, 10] = 10
    samplePathCount: StrictInt = 500


def _err(status, code, msg):
    return JSONResponse(status_code=status, content={"error": {"code": code, "message": msg}})


def require_api_key(request: Request):
    key, allow_open = _auth_settings()
    if not key and allow_open:
        return
    header = request.headers.get("authorization", "")
    supplied = header[7:] if header.lower().startswith("bearer ") else ""
    if not key or not hmac.compare_digest(supplied.encode(), key.encode()):
        raise ApiError(401, "UNAUTHORIZED", "Missing or invalid API key")


@app.exception_handler(ApiError)
async def _api_error(_: Request, e: ApiError):
    return _err(e.status, e.code, e.message)


@app.exception_handler(RequestValidationError)
async def _validation_error(_: Request, e: RequestValidationError):
    msg = "; ".join(f"{'.'.join(map(str, x['loc'][1:]))}: {x['msg']}" for x in e.errors())
    return _err(422, "INVALID_REQUEST", msg)


@app.exception_handler(Exception)
async def _internal(_: Request, e: Exception):
    return _err(500, "INTERNAL", "Unexpected error")


@app.post("/v1/forecast", dependencies=[Depends(require_api_key)])
def forecast(req: ForecastRequest):
    return svc.forecast(req.underlying.symbol, req.underlying.assetClass, req.tenorDays,
                        req.trainingWindowYears, req.samplePathCount)


@app.get("/v1/model-card", dependencies=[Depends(require_api_key)])
def model_card():
    return svc.model_card()


@app.get("/v1/health")
def health():
    return svc.health()
