import asyncio
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sim.market import Market
from sim.models import MarketConfig
from sim.orderbook import Order
from utils.token import encode_sim_token, decode_sim_token
from typing import List
import os

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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
    cfg = config.model_dump()
    token = encode_sim_token(cfg)
    global market
    market = Market(config)
    print(config)
    return {"status": "initialized", "token": token}

@app.post("/import")
def import_from_token(payload: dict):
    """
    Ensure MarketConfig includes any extra fields you send,
    e.g., allow_short_selling: bool | None = None
    """
    try:
        token = payload['token']
        cfg = decode_sim_token(token)
        market_config = MarketConfig(**cfg)
        global market
        market = Market(market_config)
        return {"status": "initialized"}
    
    except Exception as e:
        return {"status": "error", "message": "Invalid token."}



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
    
