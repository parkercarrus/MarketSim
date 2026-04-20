import numpy as np
from .base import Trader as BaseTrader


class MeanReversionTrader(BaseTrader):
    def __init__(self, config):
        super().__init__(config)
        self.performance_history = []
        self.shorting_enabled = getattr(config, "shorting_enabled", True)
        self.avg_entry_price = None
        self.max_short_units = int(getattr(config, "max_short_units", 50))
        self.lookback = int(getattr(config, "mr_lookback", 20))
        self.min_std = float(getattr(config, "mr_min_std", 1e-3))
        self.entry_z = float(getattr(config, "mr_entry_z", 1.0))
        self.exit_z = float(getattr(config, "mr_exit_z", 0.25))
        self.base_qty = int(getattr(config, "base_qty", 2))
        self.max_long_units = int(getattr(config, "max_long_units", 50))
        self.limit_offset_pct = float(getattr(config, "limit_offset_pct", 0.002))
        self.risk_aversion = float(getattr(config, "risk_aversion", 0.5))
        self.type = "mean_reversion"
        self.last_action = {"type": "hold", "quantity": 0, "price": None}
        self.last_state = None

    def _zscore(self, price_hist):
        if price_hist is None or len(price_hist) < self.lookback:
            return 0.0
        window = np.asarray(price_hist[-self.lookback:], dtype=float)
        mu = float(window.mean())
        sigma = float(window.std(ddof=0))
        if sigma < self.min_std:
            return 0.0
        return float((window[-1] - mu) / sigma)

    def act(self, obs):
        if obs is None:
            return {"type": "hold", "quantity": 0, "price": None, "action_idx": -1}

        prices = obs.get("price_history", [])
        px = float(obs["market_price"])
        fundamental = float(obs.get("fundamental_price", px))
        cash = float(obs["own_balance"])
        pos = int(obs["own_assets"])

        z_stat = self._zscore(prices)
        value_z = (px - fundamental) / max(abs(fundamental) * 0.01, 1e-6)
        composite = 0.5 * z_stat + 0.5 * value_z

        want_sell = composite > self.entry_z
        want_buy = composite < -self.entry_z
        flatten = abs(composite) < self.exit_z

        strength = min(1.0, abs(composite) / max(self.entry_z, 1e-6))
        qty = max(1, self.base_qty + int(np.ceil(self.base_qty * strength * (1 - 0.5 * self.risk_aversion))))
        buy_px = round(px * (1.0 + self.limit_offset_pct), 2)
        sell_px = round(px * (1.0 - self.limit_offset_pct), 2)

        max_affordable = int(cash // max(px, 1e-9))
        long_room = max(0, self.max_long_units - max(0, pos))
        short_room = max(0, self.max_short_units - max(0, -pos))

        if want_buy:
            if pos < 0:
                cover = min(qty, -pos, max_affordable)
                if cover > 0:
                    return {"type": "buy", "quantity": cover, "price": buy_px, "action_idx": -1}
            buy_qty = min(qty, long_room, max_affordable)
            if buy_qty > 0:
                return {"type": "buy", "quantity": buy_qty, "price": buy_px, "action_idx": -1}

        if want_sell:
            if pos > 0:
                sell_qty = min(qty, pos)
                if sell_qty > 0:
                    return {"type": "sell", "quantity": sell_qty, "price": sell_px, "action_idx": -1}
            if self.shorting_enabled:
                short_qty = min(qty, short_room)
                if short_qty > 0:
                    return {"type": "sell", "quantity": short_qty, "price": sell_px, "action_idx": -1}

        if flatten:
            if pos > 0:
                return {"type": "sell", "quantity": min(qty, pos), "price": sell_px, "action_idx": -1}
            if pos < 0:
                cover = min(qty, -pos, max_affordable)
                if cover > 0:
                    return {"type": "buy", "quantity": cover, "price": buy_px, "action_idx": -1}

        return {"type": "hold", "quantity": 0, "price": px, "action_idx": -1}

    def train(self, *args, **kwargs):
        return

    def calculate_net_worth(self, prices):
        return super().calculate_net_worth(prices)

    def reset(self):
        super().reset()
        self.performance_history = []
