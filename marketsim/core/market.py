from __future__ import annotations
from typing import List, Dict, Any, Optional
import math
import random
import numpy as np

from marketsim.core.orderbook import OrderBook, Order
from marketsim.traders import make_trader


def _corr(xs: List[float], ys: List[float]) -> Optional[float]:
    if len(xs) < 3 or len(ys) < 3 or len(xs) != len(ys):
        return None
    x = np.asarray(xs, dtype=float)
    y = np.asarray(ys, dtype=float)
    if np.std(x) < 1e-12 or np.std(y) < 1e-12:
        return None
    return float(np.corrcoef(x, y)[0, 1])


class Market:
    def __init__(self, config):
        self.config = config
        self.time_step = 0
        self.traders = [make_trader(tc) for tc in config.traders]
        self.asset_ids = [a.id for a in config.assets]
        self.primary_asset = self.asset_ids[0]
        self.orderbooks: Dict[str, OrderBook] = {aid: OrderBook() for aid in self.asset_ids}
        self.orderbook = self.orderbooks[self.primary_asset]

        self.price_history_by_asset: Dict[str, List[float]] = {a.id: [a.initial_price] for a in config.assets}
        self.fundamental_history_by_asset: Dict[str, List[float]] = {a.id: [a.initial_fundamental] for a in config.assets}
        self.asset_cfg: Dict[str, Any] = {a.id: a for a in config.assets}

        self.price_history: List[float] = self.price_history_by_asset[self.primary_asset]
        self.volume_history: List[int] = [0]
        self.volatility_history: List[float] = [0.0]
        self.transactions: List[Dict[str, Any]] = []
        self.orderbook_snapshots: List[Dict[str, Any]] = []

        self.strategy_returns: Dict[str, List[float]] = {"momentum": [], "mean_reversion": []}
        self.liquidity_shocks: List[Dict[str, Any]] = []
        self.recent_shock_window = 30
        self.current_liquidity_multiplier = 1.0

        self.market_maker: Optional[object] = None
        mm_cfg = getattr(config, "market_maker_config", None)
        if mm_cfg is not None:
            self.market_maker = self._make_mm_account(mm_cfg, self.primary_asset)

        self.trader_index: Dict[str, Any] = {t.id: t for t in self.traders}
        if self.market_maker:
            self.trader_index[self.market_maker.id] = self.market_maker

        for t in self._roster():
            t.portfolio = {aid: float(getattr(t, "assets", 0.0)) for aid in self.asset_ids}
            t.set_asset_position(self.primary_asset, float(getattr(t, "assets", 0.0)))
            t.starting_equity = t.calculate_net_worth(self._latest_prices())
            t.pnl = 0.0
            t.trades_won = 0
            t.trades_lost = 0
            t.win_rate = None
            t.avg_entry_price = None
            t.peak_equity = t.starting_equity
            t.max_drawdown_value = 0.0
            t.max_drawdown_pct = 0.0
            t.recent_pnl = []

        self._obs_hist = max(
            5,
            max((getattr(t, "long_lb", 0) + 2) for t in self.traders) if self.traders else 5,
            max(getattr(t, "lookback", 0) for t in self.traders) if self.traders else 5,
        )

    def step(self) -> Dict[str, Any]:
        self.time_step += 1
        self.transactions.clear()
        self._update_fundamentals()
        self._apply_liquidity_shock_if_needed()

        all_trades: List[Dict[str, Any]] = []
        snapshots: Dict[str, Any] = {}
        total_volume = 0

        for asset_id in self.asset_ids:
            last_px = self.price_history_by_asset[asset_id][-1]
            all_orders: List[Order] = []
            ob = self.orderbooks[asset_id]
            for trader in self.traders:
                if getattr(trader, "is_user", False):
                    continue
                obs = self._generate_observation(trader, asset_id, last_px)
                action = trader.act(obs) or {"type": "hold", "quantity": 0, "price": last_px}
                if action["type"] != "hold":
                    all_orders.append(Order(trader.id, action["type"], float(action["price"]), int(action["quantity"]), self.time_step))

            if self.market_maker:
                spread = 0.01 / max(self.current_liquidity_multiplier, 0.2)
                mm_qty = max(1, int(3 * self.current_liquidity_multiplier))
                all_orders.extend([
                    Order(self.market_maker.id, "buy", last_px * (1.0 - spread), mm_qty, self.time_step),
                    Order(self.market_maker.id, "sell", last_px * (1.0 + spread), mm_qty, self.time_step),
                ])

            for o in all_orders:
                ob.add_order(o)

            trades = ob.match_orders()
            for t in trades:
                t["asset_id"] = asset_id
            self._settle_trades(trades, asset_id)

            px, vol = self._mark_price(asset_id, trades)
            self.price_history_by_asset[asset_id].append(px)
            total_volume += vol
            all_trades.extend(trades)
            snapshots[asset_id] = ob.snapshot()

        self.volume_history.append(total_volume)
        primary_window = self.price_history[-10:] if len(self.price_history) >= 10 else self.price_history
        vol = float(np.std(primary_window)) if len(primary_window) > 1 else 0.0
        self.volatility_history.append(vol)
        self.orderbook_snapshots.append(snapshots)

        prices = self._latest_prices()
        for t in self._roster():
            equity = t.calculate_net_worth(prices)
            pnl_now = equity - t.starting_equity
            t.recent_pnl.append(pnl_now)
            if len(t.recent_pnl) > 30:
                t.recent_pnl.pop(0)
            t.pnl = pnl_now
            total_closed = t.trades_won + t.trades_lost
            t.win_rate = (t.trades_won / total_closed) if total_closed else None
            if equity > t.peak_equity:
                t.peak_equity = equity
            dd_value = t.peak_equity - equity
            if dd_value > t.max_drawdown_value:
                t.max_drawdown_value = dd_value
                t.max_drawdown_pct = (dd_value / t.peak_equity) if t.peak_equity > 0 else 0.0

        self._update_strategy_tracking()

        return {
            "time_step": self.time_step,
            "price": self.price_history[-1],
            "prices": {aid: self.price_history_by_asset[aid][-1] for aid in self.asset_ids},
            "fundamentals": {aid: self.fundamental_history_by_asset[aid][-1] for aid in self.asset_ids},
            "volume": self.volume_history[-1],
            "volatility": vol,
            "trades": all_trades,
            "orderbook_snapshot": snapshots,
            "liquidity": {
                "multiplier": self.current_liquidity_multiplier,
                "active_shock": self._has_active_recent_shock(),
                "last_shock": self.liquidity_shocks[-1] if self.liquidity_shocks else None,
            },
            "strategy_tracking": self._strategy_snapshot(),
            "traders": {
                t.id: {
                    "pnl": t.pnl,
                    "balance": t.balance,
                    "assets": t.portfolio,
                    "win_rate": t.win_rate,
                    "max_drawdown_value": t.max_drawdown_value,
                    "max_drawdown_pct": t.max_drawdown_pct,
                    "recent_pnl": float(np.mean(t.recent_pnl)) if t.recent_pnl else 0.0,
                }
                for t in self.traders
            },
        }

    def _mark_price(self, asset_id: str, trades: List[Dict[str, Any]]) -> tuple[float, int]:
        last_px = self.price_history_by_asset[asset_id][-1]
        cfg = self.asset_cfg[asset_id]
        if trades:
            vwap = sum(float(t["price"]) * int(t["quantity"]) for t in trades) / max(sum(int(t["quantity"]) for t in trades), 1)
            volume = sum(int(t["quantity"]) for t in trades)
        else:
            vwap = last_px
            volume = 0
        fundamental = self.fundamental_history_by_asset[asset_id][-1]
        price_impact = float(getattr(cfg, "price_impact", 0.0008))
        imbalance = (vwap - last_px) / max(last_px, 1e-9)
        mean_revert = 0.08 * (fundamental - last_px)
        px = max(0.01, last_px + mean_revert + last_px * imbalance * price_impact)
        return float(px), int(volume)

    def _update_position(self, trader, side: str, px: float, qty: int, asset_id: str) -> None:
        if qty <= 0:
            return
        pos = int(trader.get_asset_position(asset_id))
        if side == "buy":
            pos += qty
        else:
            pos -= qty
        trader.set_asset_position(asset_id, float(pos))

    def _settle_trades(self, trades: List[Dict[str, Any]], asset_id: str) -> None:
        idx = self.trader_index
        ts = self.time_step
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
            if buyer.balance < notional:
                continue
            if (seller.get_asset_position(asset_id) - qty) < -getattr(seller, "max_short_units", 50):
                continue
            buyer.balance -= notional
            seller.balance += notional
            self._update_position(buyer, "buy", px, qty, asset_id)
            self._update_position(seller, "sell", px, qty, asset_id)
            self.transactions.append({"trader_id": buyer.id, "type": "buy", "quantity": qty, "price": px, "time_step": ts, "asset_id": asset_id})
            self.transactions.append({"trader_id": seller.id, "type": "sell", "quantity": qty, "price": px, "time_step": ts, "asset_id": asset_id})

    def _generate_observation(self, trader, asset_id: str, market_price: float) -> Dict[str, Any]:
        recent_prices = self.price_history_by_asset[asset_id][-self._obs_hist:]
        return {
            "asset_id": asset_id,
            "market_price": market_price,
            "fundamental_price": self.fundamental_history_by_asset[asset_id][-1],
            "market_quantity": self.volume_history[-1],
            "own_balance": trader.balance,
            "own_assets": trader.get_asset_position(asset_id),
            "time_step": self.time_step,
            "price_history": recent_prices,
            "multi_asset_prices": {aid: self.price_history_by_asset[aid][-1] for aid in self.asset_ids},
            "multi_asset_fundamentals": {aid: self.fundamental_history_by_asset[aid][-1] for aid in self.asset_ids},
        }

    def _update_fundamentals(self) -> None:
        for aid in self.asset_ids:
            cfg = self.asset_cfg[aid]
            prev = self.fundamental_history_by_asset[aid][-1]
            drift = float(getattr(cfg, "fundamental_drift", 0.0))
            vol = float(getattr(cfg, "fundamental_volatility", 0.5))
            shock = random.gauss(0.0, vol)
            new_f = max(0.01, prev + drift + shock)
            self.fundamental_history_by_asset[aid].append(float(new_f))

    def _apply_liquidity_shock_if_needed(self) -> None:
        shock_cfg = getattr(self.config, "liquidity_shock", None)
        if not shock_cfg or not getattr(shock_cfg, "enabled", False):
            self.current_liquidity_multiplier = 1.0
            return

        if random.random() < float(shock_cfg.probability):
            event = {
                "time_step": self.time_step,
                "intensity": float(shock_cfg.intensity),
                "multiplier": max(0.1, 1.0 - float(shock_cfg.intensity)),
            }
            self.liquidity_shocks.append(event)

        multiplier = 1.0
        half = max(1, int(getattr(shock_cfg, "recovery_halflife", 30)))
        for ev in self.liquidity_shocks[-5:]:
            dt = max(0, self.time_step - int(ev["time_step"]))
            decay = math.exp(-math.log(2) * dt / half)
            multiplier *= 1.0 - (1.0 - float(ev["multiplier"])) * decay

        self.current_liquidity_multiplier = max(0.1, min(1.0, multiplier))

    def _update_strategy_tracking(self) -> None:
        by_type = {"momentum": [], "mean_reversion": []}
        for t in self.traders:
            if getattr(t, "type", None) in by_type:
                by_type[t.type].append(float(t.pnl))
        for key, vals in by_type.items():
            if vals:
                self.strategy_returns[key].append(float(np.mean(vals)))
            else:
                self.strategy_returns[key].append(0.0)

    def _strategy_snapshot(self) -> Dict[str, Any]:
        m = self.strategy_returns["momentum"][-30:]
        v = self.strategy_returns["mean_reversion"][-30:]
        corr = _corr(m, v)
        return {
            "momentum_recent": m,
            "value_recent": v,
            "momentum_mean": float(np.mean(m)) if m else 0.0,
            "value_mean": float(np.mean(v)) if v else 0.0,
            "momentum_value_corr": corr,
        }

    def _has_active_recent_shock(self) -> bool:
        return any((self.time_step - int(s["time_step"])) <= self.recent_shock_window for s in self.liquidity_shocks[-5:])

    def _latest_prices(self) -> Dict[str, float]:
        return {aid: self.price_history_by_asset[aid][-1] for aid in self.asset_ids}

    def _roster(self) -> List[Any]:
        return self.traders + ([self.market_maker] if self.market_maker else [])

    @staticmethod
    def _make_mm_account(cfg, primary_asset: str):
        class _MM:
            pass

        mm = _MM()
        mm.id = getattr(cfg, "id", "MM")
        mm.balance = float(getattr(cfg, "balance", 10000.0))
        mm.assets = float(getattr(cfg, "assets", 100.0))
        mm.portfolio = {primary_asset: mm.assets}
        mm.avg_entry_price = None
        mm.trades_won = 0
        mm.trades_lost = 0
        mm.max_short_units = getattr(cfg, "max_short_units", 50)

        def _nw(prices: Dict[str, float]) -> float:
            total = float(mm.balance)
            for aid, px in prices.items():
                total += float(mm.portfolio.get(aid, 0.0)) * float(px)
            return total

        def _get_pos(aid: str) -> float:
            return float(mm.portfolio.get(aid, 0.0))

        def _set_pos(aid: str, qty: float) -> None:
            mm.portfolio[aid] = float(qty)
            if aid == primary_asset:
                mm.assets = float(qty)

        mm.calculate_net_worth = _nw
        mm.get_asset_position = _get_pos
        mm.set_asset_position = _set_pos
        return mm
