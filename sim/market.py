from typing import List, Dict, Any, Optional
from sim.orderbook import OrderBook, Order
from sim.traders import make_trader
# (optional) for type hints only
# from traders.base import Trader as BaseTrader


class Market:
    def __init__(self, config):
        self.config = config
        self.time_step = 0
        self.orderbook = OrderBook()

        # --- instantiate traders via factory (works for RL/Momentum/MR, etc.) ---
        self.traders = [make_trader(tc) for tc in config.traders]

        # --- histories ---
        self.price_history: List[float] = [config.initial_price]
        self.volume_history: List[int] = [0]
        self.volatility_history: List[float] = [0.0]

        self.transactions: List[Dict[str, Any]] = []
        self.orderbook_snapshots: List[Dict[str, Any]] = []

        # --- optional market maker account (for quoting + stats only) ---
        self.market_maker: Optional[object] = None
        mm_cfg = getattr(config, "market_maker_config", None)
        if mm_cfg is not None:
            # treat any provided MM config as "enabled"
            self.market_maker = self._make_mm_account(mm_cfg)

        # --- fast lookup by id (needed for settlement) ---
        self.trader_index: Dict[str, Any] = {t.id: t for t in self.traders}
        if self.market_maker:
            self.trader_index[self.market_maker.id] = self.market_maker

        # --- initialize per-trader stats ---
        start_px = self.price_history[0]
        for t in self._roster():
            t.starting_equity = t.calculate_net_worth({"asset": start_px})
            t.pnl = 0.0
            t.trades_won = 0
            t.trades_lost = 0
            t.win_rate = None
            t.avg_entry_price = None
            t.peak_equity = t.starting_equity
            t.max_drawdown_value = 0.0
            t.max_drawdown_pct = 0.0

        # --- decide how many past prices to include in observations (supports Momentum/MR lookbacks) ---
        self._obs_hist = max(
            5,
            max((getattr(t, "long_lb", 0) + 2) for t in self.traders),  # +2 for safety
            max(getattr(t, "lookback", 0) for t in self.traders) if self.traders else 0,
        )

    # ----------------------------
    # Public API: one simulation tick
    # ----------------------------
    def step(self) -> Dict[str, Any]:
        self.time_step += 1
        last_px = self.price_history[-1]

        # Collect bot orders (skip user-controlled)
        all_orders: List[Order] = []
        ob_add = self.orderbook.add_order

        for trader in self.traders:
            if getattr(trader, "is_user", False):
                continue
            obs = self._generate_observation(trader, last_px)
            action = trader.act(obs) or {"type": "hold", "quantity": 0, "price": last_px}
            if action["type"] != "hold":
                all_orders.append(
                    Order(
                        trader.id,
                        action["type"],
                        float(action["price"]),
                        int(action["quantity"]),
                        self.time_step,
                    )
                )

        # Simple MM quotes (if enabled)
        if self.market_maker:
            all_orders.extend([
                Order(self.market_maker.id, "buy",  last_px * 0.99, 3, self.time_step),
                Order(self.market_maker.id, "sell", last_px * 1.01, 3, self.time_step),
            ])

        # Ingest to orderbook
        for o in all_orders:
            ob_add(o)

        # Match & settle
        trades = self.orderbook.match_orders()
        self._settle_trades(trades)

        # Price/volume updates
        avg_price = (sum(float(t["price"]) for t in trades) / len(trades)) if trades else last_px
        vol_sum = sum(int(t["quantity"]) for t in trades)

        self.price_history.append(avg_price)
        self.volume_history.append(vol_sum)

        # Rolling volatility over last 10 prices
        window = self.price_history[-10:] if len(self.price_history) >= 10 else self.price_history
        n = len(window)
        if n > 1:
            mean = sum(window) / n
            var = sum((p - mean) ** 2 for p in window) / n
            vol = var ** 0.5
        else:
            vol = 0.0
        self.volatility_history.append(vol)

        # Single snapshot call per step
        snapshot = self.orderbook.snapshot()
        self.orderbook_snapshots.append(snapshot)

        # Update per-trader stats
        for t in self._roster():
            equity = t.calculate_net_worth({"asset": avg_price})
            t.pnl = equity - t.starting_equity
            total_closed = t.trades_won + t.trades_lost
            t.win_rate = (t.trades_won / total_closed) if total_closed else None

            if equity > t.peak_equity:
                t.peak_equity = equity
            dd_value = t.peak_equity - equity
            if dd_value > t.max_drawdown_value:
                t.max_drawdown_value = dd_value
                t.max_drawdown_pct = (dd_value / t.peak_equity) if t.peak_equity > 0 else 0.0

        return {
            "time_step": self.time_step,
            "price": avg_price,
            "volume": self.volume_history[-1],
            "volatility": vol,
            "trades": trades,
            "orderbook_snapshot": snapshot,
            "traders": {
                t.id: {
                    "pnl": t.pnl,
                    "balance": t.balance,
                    "assets": t.assets,
                    "win_rate": t.win_rate,
                    "max_drawdown_value": t.max_drawdown_value,
                    "max_drawdown_pct": t.max_drawdown_pct,
                } for t in self.traders  # (intentionally excludes MM from frontend map)
            },
        }

    # ----------------------------
    # Position/accounting helpers
    # ----------------------------
    def _update_position(self, trader, side: str, px: float, qty: int) -> None:
        """
        Maintains signed position & avg_entry_price (AEP).
        """
        if qty <= 0:
            return

        pos = int(trader.assets)
        aep = trader.avg_entry_price  # may be None

        if side == "buy":
            # Cover shorts first
            if pos < 0:
                cover = min(qty, -pos)
                pos += cover
                qty -= cover
                if pos == 0 and cover > 0 and qty == 0:
                    trader.avg_entry_price = None  # flat

            # Open/increase long with remaining qty
            if qty > 0:
                if pos > 0 and aep is not None:
                    denom = abs(pos) + qty
                    trader.avg_entry_price = (aep * abs(pos) + px * qty) / denom
                else:
                    trader.avg_entry_price = px
                pos += qty

        else:  # "sell"
            # Close longs first
            if pos > 0:
                close = min(qty, pos)
                pos -= close
                qty -= close
                if pos == 0 and close > 0 and qty == 0:
                    trader.avg_entry_price = None  # flat

            # Open/increase short with remaining qty
            if qty > 0:
                if pos < 0 and aep is not None:
                    denom = abs(pos) + qty
                    trader.avg_entry_price = (aep * abs(pos) + px * qty) / denom
                else:
                    trader.avg_entry_price = px
                pos -= qty

        trader.assets = float(pos)

    def _settle_trades(self, trades: List[Dict[str, Any]]) -> None:
        """
        Applies cash/position updates and records transactions.
        """
        self.transactions.clear()
        idx = self.trader_index
        ts = self.time_step
        tx_append = self.transactions.append

        for tr in trades:
            buyer = idx.get(tr["buyer"])
            seller = idx.get(tr["seller"])
            if not buyer or not seller:
                continue

            qty = int(tr["quantity"])
            px = float(tr["price"])
            if qty <= 0:
                continue

            notional = qty * px
            # Risk checks
            if buyer.balance < notional:
                continue
            if (seller.assets - qty) < -getattr(seller, "max_short_units", 50):
                continue

            # Snapshot seller state for grading closed portion
            pre_pos = int(seller.assets)
            pre_aep = seller.avg_entry_price

            # Cash & position updates
            buyer.balance -= notional
            self._update_position(buyer, "buy", px, qty)

            seller.balance += notional
            self._update_position(seller, "sell", px, qty)

            # Grade seller (simple win/loss)
            if pre_pos != 0 and pre_aep is not None:
                pnl_sign = (px - pre_aep) * (1 if pre_pos > 0 else -1)
                if pnl_sign > 0:
                    seller.trades_won += 1
                elif pnl_sign < 0:
                    seller.trades_lost += 1

            # Audit log
            tx_append({"trader_id": buyer.id,  "type": "buy",  "quantity": qty, "price": px, "time_step": ts})
            tx_append({"trader_id": seller.id, "type": "sell", "quantity": qty, "price": px, "time_step": ts})

    # ----------------------------
    # Observations
    # ----------------------------
    def _generate_observation(self, trader, market_price: float) -> Dict[str, Any]:
        # include enough history for Momentum/MeanReversion signals
        recent_prices = self.price_history[-self._obs_hist:] if len(self.price_history) >= self._obs_hist else self.price_history
        return {
            "market_price": market_price,
            "market_quantity": self.volume_history[-1],
            "own_balance": trader.balance,
            "own_assets": trader.assets,
            "time_step": self.time_step,
            "price_history": recent_prices,
        }

    # ----------------------------
    # Helpers
    # ----------------------------
    def _roster(self) -> List[Any]:
        """All accounts to track for PnL/DD. (MM included if present)."""
        return self.traders + ([self.market_maker] if self.market_maker else [])

    @staticmethod
    def _make_mm_account(cfg):
        """
        Minimal account object for market maker stats/settlement.
        Needs: id, balance, assets, avg_entry_price, trades_won/lost, max_short_units, calculate_net_worth()
        """
        class _MM:
            pass
        mm = _MM()
        mm.id = getattr(cfg, "id", "MM")
        mm.balance = float(getattr(cfg, "balance", 10000.0))
        mm.assets = float(getattr(cfg, "assets", 100.0))
        mm.avg_entry_price = None
        mm.trades_won = 0
        mm.trades_lost = 0
        mm.max_short_units = getattr(cfg, "max_short_units", 50)

        def _nw(prices: Dict[str, float]) -> float:
            return float(mm.balance + mm.assets * prices["asset"])
        mm.calculate_net_worth = _nw
        return mm
