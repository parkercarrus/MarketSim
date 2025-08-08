import asyncio
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sim.market import Market
from sim.models import MarketConfig
from sim.orderbook import Order
from typing import List
import os

app = FastAPI()

def origins_from_env() -> List[str]:
    base = [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3000",
    ]
    extra = [o.strip() for o in os.getenv("CORS_ORIGINS", "").split(",") if o.strip()]
    # de-dup while preserving order
    return list(dict.fromkeys(base + extra))

ALLOWED_ORIGINS = origins_from_env()

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,      
    allow_methods=["*"],
    allow_headers=["*"],
)

market: Market | None = None

class ExternalOrder(BaseModel):
    trader_id: str
    type: str 
    price: float
    quantity: int

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/init")
def init_market(config: MarketConfig):
    """
    Ensure MarketConfig includes any extra fields you send,
    e.g., allow_short_selling: bool | None = None
    """
    global market
    market = Market(config)
    return {"status": "initialized"}

@app.websocket("/ws")
async def market_stream(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            if market:
                data = market.step()
                await websocket.send_json(data)
            await asyncio.sleep(0.1)
    except WebSocketDisconnect:
        return

@app.post("/reset")
def reset():
    global market
    market = None
    return {"status": "reset", "message": "Market has been reset."}

@app.post("/user_trade")
async def user_trade(order: ExternalOrder):
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
    return {"status": "Order submitted", "order": order}
