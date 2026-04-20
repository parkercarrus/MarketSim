from __future__ import annotations
from typing import Any, Dict, List
import numpy as np
import pandas as pd
from marketsim.core.market import Market


class ResultsObject:
    TRADER_COLS = [
        "pnl",
        "balance",
        "assets",
        "win_rate",
        "max_drawdown_value",
        "max_drawdown_pct",
        "recent_pnl",
    ]

    def __init__(self, market: Market, ticks: int, market_stats: bool = True, trades: bool = True, traders: bool = True, orderbook: bool = False) -> None:
        self.market_stats = market_stats
        self.trades = trades
        self.traders = traders
        self.orderbook = orderbook
        self.lookup_dict: Dict[int, str] = {i: t.id for i, t in enumerate(market.traders)}

        if self.market_stats:
            self.market_array = np.zeros((ticks, 4), dtype=np.float64)
            self.extra_market_rows: List[Dict[str, Any]] = []

        if self.trades:
            self.trades_rows: List[List[Any]] = []

        if self.traders:
            self.traders_history: List[Dict[str, Dict[str, Any]]] = []

        self._summary: Dict[str, Any] = {}

    def add(self, data: Dict[str, Any]) -> None:
        ts = int(data.get("time_step", 0))
        if self.market_stats:
            price = float(data.get("price", 0.0))
            volume = float(data.get("volume", 0.0))
            vol = float(data.get("volatility", 0.0))
            if 1 <= ts <= self.market_array.shape[0]:
                self.market_array[ts - 1, :] = (ts, price, volume, vol)
            self.extra_market_rows.append(
                {
                    "time_step": ts,
                    "prices": data.get("prices", {}),
                    "fundamentals": data.get("fundamentals", {}),
                    "liquidity": data.get("liquidity", {}),
                    "strategy_tracking": data.get("strategy_tracking", {}),
                }
            )

        if self.trades:
            for tr in data.get("trades") or []:
                self.trades_rows.append([
                    int(tr.get("time_step", ts)),
                    tr.get("asset_id", "asset"),
                    float(tr.get("price", 0.0)),
                    int(tr.get("quantity", 0)),
                    self._resolve_trader_id(tr.get("buyer")),
                    self._resolve_trader_id(tr.get("seller")),
                ])

        if self.traders:
            stats = {}
            for k, v in (data.get("traders") or {}).items():
                tid = self._resolve_trader_id(k)
                stats[tid] = {col: v.get(col) for col in self.TRADER_COLS}
            self.traders_history.append(stats)

    def _resolve_trader_id(self, key: Any) -> str:
        if isinstance(key, int):
            return self.lookup_dict.get(key, str(key))
        if key is None:
            return "unknown"
        return str(key)

    def process_results(self) -> "ResultsObject":
        if self.market_stats:
            self.market_df = pd.DataFrame(self.market_array, columns=["time_step", "price", "volume", "volatility"]).astype({"time_step": "int64"})
            first = float(self.market_df["price"].iloc[0]) if len(self.market_df) else 0.0
            last = float(self.market_df["price"].iloc[-1]) if len(self.market_df) else 0.0
            self._summary.update({"ticks": int(len(self.market_df)), "mid_first": first, "mid_last": last, "mid_return": (last / first - 1.0) if first else None})

        if self.trades:
            self.trades_df = pd.DataFrame(self.trades_rows, columns=["time_step", "asset_id", "price", "quantity", "buyer", "seller"])

        if self.traders:
            self.trader_dataframes = []
            for snap in self.traders_history:
                df = pd.DataFrame.from_dict(snap, orient="index") if snap else pd.DataFrame(columns=self.TRADER_COLS)
                df.index.name = "Trader"
                self.trader_dataframes.append(df.reset_index())
        return self

    @property
    def results(self) -> Dict[str, Any]:
        out: Dict[str, Any] = {"summary": dict(self._summary)}
        if self.market_stats:
            base = [] if not hasattr(self, "market_df") else self.market_df.to_dict(orient="records")
            extra = self.extra_market_rows if hasattr(self, "extra_market_rows") else []
            out["market"] = [{**b, **(extra[i] if i < len(extra) else {})} for i, b in enumerate(base)]
        if self.trades:
            out["trades"] = [] if not hasattr(self, "trades_df") else self.trades_df.to_dict(orient="records")
        if self.traders:
            out["traders"] = [df.to_dict(orient="records") for df in getattr(self, "trader_dataframes", [])]
        if self.orderbook:
            out["orderbook"] = out.get("orderbook", [])
        return out
