from __future__ import annotations
from fastapi import FastAPI, APIRouter, HTTPException
from pydantic import BaseModel
from marketsim.simulate import execute
from marketsim.core.models import MarketConfig
import json

app = FastAPI(title="Simulator API", version="1.0.0")
router = APIRouter(prefix="/v1")

class SimPayload(BaseModel):
    token: str | None = None
    config: MarketConfig | None = None
    ticks: int = 1000

@router.get("/health")
def health():
    return {"status": "ok"}

@router.post("/simulate")
def simulate(payload: SimPayload):

    if not payload.token and not payload.config:
        raise HTTPException(400, "Provide either token or config")

    # init market
    token_or_json = payload.token or payload.config
    market = execute.init(token_or_json)

    # run sim
    res = execute.run(market, payload.ticks)

    res.process_results()
    payload = res.results
    print(payload)
    return payload

app.include_router(router)
