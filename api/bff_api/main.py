# bff_api/main.py
import asyncio
from enum import Enum
from typing import Optional, Set
from fastapi import FastAPI, APIRouter, WebSocket, WebSocketDisconnect, HTTPException, status
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

class OrderType(str, Enum):
    buy = "buy"
    sell = "sell"

class ExternalOrder(BaseModel):
    trader_id: str
    type: OrderType
    price: NonNegativeFloat
    quantity: PositiveInt

# ---- Market service: single producer + broadcast ----
class MarketService:
    def __init__(self):
        self.market: Optional[Market] = None
        self._tick_task: Optional[asyncio.Task] = None
        self._clients: Set[WebSocket] = set()
        self._lock = asyncio.Lock()
        self.tick_interval = 0.1  # seconds
        self.running = asyncio.Event()

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
        # tick loop will self-terminate when running is cleared

    async def submit(self, ext: ExternalOrder):
        async with self._lock:
            if not self.market:
                raise HTTPException(status_code=409, detail="Market not initialized")
            order_obj = Order(
                trader_id=ext.trader_id,
                order_type=ext.type.value,
                price=float(ext.price),
                quantity=int(ext.quantity),
                time_step=self.market.time_step,
            )
            self.market.orderbook.add_order(order_obj)

    async def _ensure_tick_loop(self):
        self.running.set()
        if self._tick_task and not self._tick_task.done():
            return
        self._tick_task = asyncio.create_task(self._tick_loop(), name="market_tick")

    async def _tick_loop(self):
        try:
            while self.running.is_set():
                async with self._lock:
                    if self.market:
                        data = self.market.step()
                    else:
                        data = None
                if data is not None:
                    await self._broadcast(data)
                await asyncio.sleep(self.tick_interval)
        except asyncio.CancelledError:
            pass

    async def register_ws(self, ws: WebSocket):
        await ws.accept()
        self._clients.add(ws)

    async def unregister_ws(self, ws: WebSocket):
        self._clients.discard(ws)

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

app.include_router(api)

@app.websocket("/ws")
async def market_stream(websocket: WebSocket):
    await svc.register_ws(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        await svc.unregister_ws(websocket)