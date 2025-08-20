import asyncio
from typing import List, Optional
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from marketsim.core.market import Market
from marketsim.core.models import MarketConfig
from marketsim.core.orderbook import Order
from marketsim.utils.token import encode_sim_token, decode_sim_token

app = FastAPI()

ALLOWED_ORIGINS: List[str] = [
    "https://aitradingsim.com",
    "http://localhost:3000",
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

market: Optional[Market] = None

class ExternalOrder(BaseModel):
    trader_id: str
    type: str
    price: float
    quantity: int

from fastapi import APIRouter
api = APIRouter(prefix="/api")

@api.get("/health")
def health():
    return {"status": "ok"}

@api.post("/init")
def init_market(config: MarketConfig):
    cfg = config.model_dump()
    token = encode_sim_token(cfg)
    global market
    market = Market(config)
    return {"status": "initialized", "token": token}

@api.post("/import")
def import_from_token(payload: dict):
    try:
        token = payload["token"]
        cfg = decode_sim_token(token)
        market_config = MarketConfig(**cfg)
        global market
        market = Market(market_config)
        return {"status": "initialized"}
    except Exception:
        return {"status": "error", "message": "Invalid token."}

@api.post("/reset")
def reset():
    global market
    market = None
    return {"status": "reset", "message": "Market has been reset."}

@api.post("/user_trade")
def user_trade(order: ExternalOrder):
    global market
    if market is None:
        return {"error": "Market not initialized"}
    order_obj = Order(
        trader_id=order.trader_id,
        order_type=order.type,
        price=order.price,
        quantity=order.quantity,
        time_step=market.time_step,
    )
    market.orderbook.add_order(order_obj)
    return {"status": "order_submitted", "order": order.model_dump()}

app.include_router(api)

@app.websocket("/ws")
async def market_stream(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            if market is not None:
                data = market.step()
                await websocket.send_json(data)
            await asyncio.sleep(0.1)
    except WebSocketDisconnect:
        pass
