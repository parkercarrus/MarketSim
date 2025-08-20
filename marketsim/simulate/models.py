from __future__ import annotations
from typing import Any, Dict, List, Optional
import numpy as np
import pandas as pd
from marketsim.core.market import Market

class ResultsObject:
    """
    Collects per-tick outputs and exposes:
      - .market_df, .trades_df, .trader_dataframes (after process_results)
      - .results  (JSON-friendly dict you can return from an API)
    Toggle sections with: market_stats, trades, traders, orderbook.
    """

    TRADER_COLS = ["PnL", "Balance", "Assets", "WinRate", "MaxDrawdown", "MaxDrawdownPct"]

    def __init__(
        self,
        market: Market,
        ticks: int,
        market_stats: bool = True,
        trades: bool = True,
        traders: bool = True,
        orderbook: bool = False,

    ) -> None:
        self.market_stats = market_stats
        self.trades = trades
        self.traders = traders
        self.orderbook = orderbook

        self.lookup_dict: Dict[int, str] = {i: t.id for i, t in enumerate(market.traders)}

        if self.market_stats:
            self.market_array = np.zeros((ticks, 4), dtype=np.float64)

        if self.trades:
            self.trades_rows: List[List[Any]] = []

        if self.traders:
            self.traders_history: List[Dict[str, Dict[str, float]]] = []

        self._summary: Dict[str, Any] = {}

    def add(self, data: Dict[str, Any]) -> None:
        ts = int(data.get("time_step", 0))

        if self.market_stats:
            price = float(data.get("price", 0.0))
            volume = float(data.get("volume", 0.0))
            vol = float(data.get("volatility", 0.0))
            if 1 <= ts <= self.market_array.shape[0]:
                self.market_array[ts - 1, :] = (ts, price, volume, vol)

        # --- trades ---
        if self.trades:
            trades = data.get("trades") or []
            for tr in trades:
                buyer_raw = tr.get("buyer")
                seller_raw = tr.get("seller")
                buyer_id = self._resolve_trader_id(buyer_raw)
                seller_id = self._resolve_trader_id(seller_raw)
                self.trades_rows.append([
                    int(tr.get("time_step", ts)),
                    float(tr.get("price", 0.0)),
                    int(tr.get("quantity", 0)),
                    buyer_id,
                    seller_id,
                ])

        # --- trader stats ---
        if self.traders:
            stats: Dict[str, Dict[str, float]] = {}
            traders_block = data.get("traders") or {}
            for k, v in traders_block.items():
                tid = self._resolve_trader_id(k)
                stats[tid] = {
                    "PnL": float(v.get("PnL", 0.0)),
                    "Balance": float(v.get("Balance", 0.0)),
                    "Assets": float(v.get("Assets", 0.0)),
                    "WinRate": float(v.get("WinRate", 0.0)),
                    "MaxDrawdown": float(v.get("MaxDrawdown", 0.0)),
                    "MaxDrawdownPct": float(v.get("MaxDrawdownPct", 0.0)),
                }
            self.traders_history.append(stats)

    def _resolve_trader_id(self, key: Any) -> str:
        if isinstance(key, int):
            return self.lookup_dict.get(key, str(key))
        if key is None:
            return "unknown"
        return str(key)

    def process_results(self) -> "ResultsObject":
        # market df
        if self.market_stats:
            self.market_df = pd.DataFrame(
                self.market_array,
                columns=["time_step", "price", "volume", "volatility"],
            ).astype({"time_step": "int64"})
            first = float(self.market_df["price"].iloc[0]) if len(self.market_df) else 0.0
            last = float(self.market_df["price"].iloc[-1]) if len(self.market_df) else 0.0
            self._summary.update({
                "ticks": int(len(self.market_df)),
                "mid_first": first,
                "mid_last": last,
                "mid_return": (last / first - 1.0) if first else None,
            })

        # trades df
        if self.trades:
            self.trades_df = pd.DataFrame(
                self.trades_rows,
                columns=["time_step", "price", "quantity", "buyer", "seller"],
            )
            if not self.trades_df.empty:
                self.trades_df = self.trades_df.astype({
                    "time_step": "int64",
                    "price": "float64",
                    "quantity": "int64",
                })

        # trader per-tick frames
        if self.traders:
            self.trader_dataframes: List[pd.DataFrame] = []
            for snap in self.traders_history:
                if not snap:
                    self.trader_dataframes.append(pd.DataFrame(columns=["Trader"] + self.TRADER_COLS))
                    continue
                df = pd.DataFrame.from_dict(snap, orient="index")
                df.index.name = "Trader"
                df = df.reset_index()[["Trader"] + self.TRADER_COLS]
                self.trader_dataframes.append(df)

        return self

    @property
    def results(self) -> Dict[str, Any]:
        out: Dict[str, Any] = {"summary": dict(self._summary)}

        if self.market_stats:
            out["market"] = (
                [] if not hasattr(self, "market_df")
                else self.market_df.to_dict(orient="records")
            )

        if self.trades:
            out["trades"] = (
                [] if not hasattr(self, "trades_df")
                else self.trades_df.to_dict(orient="records")
            )

        if self.traders:
            frames = getattr(self, "trader_dataframes", [])
            out["traders"] = [
                df.to_dict(orient="records") if isinstance(df, pd.DataFrame) else []
                for df in frames
            ]

        if self.orderbook:
            out["orderbook"] = out.get("orderbook", [])

        return out
