"""FastAPI wrapper. Run:  uvicorn app:app --host 0.0.0.0 --port 8000"""
from contextlib import asynccontextmanager
from typing import Optional
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from service_core import ForecastService, ApiError

svc: ForecastService = None


@asynccontextmanager
async def lifespan(app):
    global svc
    svc = ForecastService()
    svc._fit(10)           # warm the fit cache so the first request is fast
    yield


app = FastAPI(title="Nifty 50 Forecast Service", version="1.0", lifespan=lifespan)


class ForecastRequest(BaseModel):
    underlying: str
    tenorDays: int
    trainingWindowYears: Optional[int] = 10
    nSamplePaths: Optional[int] = 500


def _err(status, code, msg):
    return JSONResponse(status_code=status, content={"error": {"code": code, "message": msg}})


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


@app.post("/v1/forecast")
def forecast(req: ForecastRequest):
    return svc.forecast(req.underlying, req.tenorDays, req.trainingWindowYears or 10,
                        500 if req.nSamplePaths is None else req.nSamplePaths)


@app.get("/v1/model-card")
def model_card():
    return svc.model_card()


@app.get("/v1/health")
def health():
    return svc.health()
