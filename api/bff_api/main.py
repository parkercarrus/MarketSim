# bff_api/main.py
import asyncio
import os
from enum import Enum
from pathlib import Path
from typing import Optional, Set

from fastapi import FastAPI, APIRouter, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, NonNegativeFloat, PositiveInt

from marketsim.core.market import Market
from marketsim.core.models import MarketConfig
from marketsim.core.orderbook import Order
from marketsim.utils.token import encode_sim_token, decode_sim_token

app = FastAPI(title="MarketSim BFF", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

api = APIRouter(prefix="/api")
MODEL_DIR = Path(os.getenv("RL_MODEL_DIR", "/workspace/MarketSim/.models"))
MODEL_DIR.mkdir(parents=True, exist_ok=True)


class OrderType(str, Enum):
    buy = "buy"
    sell = "sell"


class ExternalOrder(BaseModel):
    trader_id: str
    type: OrderType
    price: NonNegativeFloat
    quantity: PositiveInt
    asset_id: Optional[str] = None


class SaveRLRequest(BaseModel):
    trader_id: str
    tag: str = "latest"


class LoadRLRequest(BaseModel):
    trader_id: str
    tag: str = "latest"


class MarketService:
    def __init__(self):
        self.market: Optional[Market] = None
        self._tick_task: Optional[asyncio.Task] = None
        self._clients: Set[WebSocket] = set()
        self._lock = asyncio.Lock()
        self.tick_interval = 0.1
        self.running = asyncio.Event()

    async def register_ws(self, ws: WebSocket):
        await ws.accept()
        self._clients.add(ws)

    async def unregister_ws(self, ws: WebSocket):
        self._clients.discard(ws)

    async def init_with_config(self, cfg: MarketConfig) -> str:
        async with self._lock:
            self.market = Market(cfg)
            token = encode_sim_token(cfg.model_dump())
            await self._ensure_tick_loop()
            return token

    async def init_with_token(self, token: str):
        try:
            cfg = decode_sim_token(token)
            return await self.init_with_config(MarketConfig(**cfg))
        except Exception as e:
            raise HTTPException(status_code=400, detail="Invalid token") from e

    async def reset(self):
        async with self._lock:
            self.market = None
            self.running.clear()

    async def submit(self, ext: ExternalOrder):
        async with self._lock:
            if not self.market:
                raise HTTPException(status_code=409, detail="Market not initialized")
            asset_id = ext.asset_id or self.market.primary_asset
            ob = self.market.orderbooks.get(asset_id)
            if ob is None:
                raise HTTPException(status_code=400, detail=f"Unknown asset_id: {asset_id}")
            order_obj = Order(
                trader_id=ext.trader_id,
                order_type=ext.type.value,
                price=float(ext.price),
                quantity=int(ext.quantity),
                time_step=self.market.time_step,
            )
            ob.add_order(order_obj)

    async def save_rl(self, trader_id: str, tag: str) -> str:
        async with self._lock:
            if not self.market:
                raise HTTPException(status_code=409, detail="Market not initialized")
            trader = self.market.trader_index.get(trader_id)
            if trader is None or getattr(trader, "type", "") != "rl":
                raise HTTPException(status_code=404, detail="RL trader not found")
            path = MODEL_DIR / f"{trader_id}_{tag}.pkl"
            trader.save_model(str(path))
            return str(path)

    async def load_rl(self, trader_id: str, tag: str) -> str:
        async with self._lock:
            if not self.market:
                raise HTTPException(status_code=409, detail="Market not initialized")
            trader = self.market.trader_index.get(trader_id)
            if trader is None or getattr(trader, "type", "") != "rl":
                raise HTTPException(status_code=404, detail="RL trader not found")
            path = MODEL_DIR / f"{trader_id}_{tag}.pkl"
            if not path.exists():
                raise HTTPException(status_code=404, detail="Saved model not found")
            trader.load_model(str(path))
            return str(path)

    async def _ensure_tick_loop(self):
        self.running.set()
        if self._tick_task and not self._tick_task.done():
            return
        self._tick_task = asyncio.create_task(self._tick_loop(), name="market_tick")

    async def _tick_loop(self):
        try:
            while self.running.is_set():
                async with self._lock:
                    data = self.market.step() if self.market else None
                if data is not None:
                    await self._broadcast(data)
                await asyncio.sleep(self.tick_interval)
        except asyncio.CancelledError:
            pass

    async def _broadcast(self, msg):
        dead = []
        for ws in list(self._clients):
            try:
                await ws.send_json(msg)
            except Exception:
                dead.append(ws)
        for ws in dead:
            await self.unregister_ws(ws)


svc = MarketService()


@api.get("/health")
def health():
    return {"status": "ok"}


@api.post("/init")
async def init_market(config: MarketConfig):
    token = await svc.init_with_config(config)
    return {"status": "initialized", "token": token}


class ImportPayload(BaseModel):
    token: str


@api.post("/import")
async def import_from_token(payload: ImportPayload):
    await svc.init_with_token(payload.token)
    return {"status": "initialized"}


@api.post("/reset")
async def reset():
    await svc.reset()
    return {"status": "reset"}


@api.post("/user_trade")
async def user_trade(order: ExternalOrder):
    await svc.submit(order)
    return {"status": "order_submitted", "order": order.model_dump()}


@api.post("/save_rl")
async def save_rl(payload: SaveRLRequest):
    path = await svc.save_rl(payload.trader_id, payload.tag)
    return {"status": "saved", "path": path}


@api.post("/load_rl")
async def load_rl(payload: LoadRLRequest):
    path = await svc.load_rl(payload.trader_id, payload.tag)
    return {"status": "loaded", "path": path}


app.include_router(api)


@app.websocket("/ws")
async def market_stream(websocket: WebSocket):
    await svc.register_ws(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        await svc.unregister_ws(websocket)
