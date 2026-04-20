import numpy as np
from .base import Trader as BaseTrader


class MomentumTrader(BaseTrader):
    def __init__(self, config):
        super().__init__(config)
        self.performance_history = []
        self.shorting_enabled = getattr(config, "shorting_enabled", True)
        self.avg_entry_price = None
        self.max_short_units = int(getattr(config, "max_short_units", 50))
        self.short_lb = int(getattr(config, "mom_short", 3))
        self.long_lb = int(getattr(config, "mom_long", 10))
        self.entry_threshold = float(getattr(config, "entry_threshold", 0.003))
        self.exit_threshold = float(getattr(config, "exit_threshold", 0.0005))
        self.base_qty = int(getattr(config, "base_qty", 2))
        self.max_long_units = int(getattr(config, "max_long_units", 50))
        self.limit_offset_pct = float(getattr(config, "limit_offset_pct", 0.002))
        self.risk_aversion = float(getattr(config, "risk_aversion", 0.5))
        self.type = "momentum"
        self.last_action = {"type": "hold", "quantity": 0, "price": None}
        self.last_state = None

    def _signal(self, price_hist):
        if len(price_hist) <= max(self.short_lb, self.long_lb):
            return 0.0
        p = np.asarray(price_hist, dtype=float)
        short_ret = (p[-1] / (p[-self.short_lb - 1] + 1e-9)) - 1.0
        long_ret = (p[-1] / (p[-self.long_lb - 1] + 1e-9)) - 1.0
        return float(short_ret - long_ret)

    def act(self, obs):
        if obs is None:
            return {"type": "hold", "quantity": 0, "price": None, "action_idx": -1}

        prices = obs.get("price_history", [])
        px = float(obs["market_price"])
        cash = float(obs["own_balance"])
        pos = int(obs["own_assets"])

        signal = self._signal(prices)
        bullish = signal > self.entry_threshold
        bearish = signal < -self.entry_threshold
        flatten = abs(signal) < self.exit_threshold

        strength = min(1.0, abs(signal) / max(self.entry_threshold, 1e-6))
        qty = max(1, self.base_qty + int(np.ceil(self.base_qty * strength * (1 - 0.5 * self.risk_aversion))))
        buy_px = round(px * (1.0 + self.limit_offset_pct), 2)
        sell_px = round(px * (1.0 - self.limit_offset_pct), 2)
        max_affordable = int(cash // max(px, 1e-9))

        if bullish:
            if pos < 0:
                cover = min(qty, -pos, max_affordable)
                if cover > 0:
                    return {"type": "buy", "quantity": cover, "price": buy_px, "action_idx": -1}
            long_room = max(0, self.max_long_units - max(0, pos))
            buy_qty = min(qty, long_room, max_affordable)
            if buy_qty > 0:
                return {"type": "buy", "quantity": buy_qty, "price": buy_px, "action_idx": -1}

        if bearish:
            if pos > 0:
                sell_qty = min(qty, pos)
                if sell_qty > 0:
                    return {"type": "sell", "quantity": sell_qty, "price": sell_px, "action_idx": -1}
            if self.shorting_enabled:
                short_room = max(0, self.max_short_units - max(0, -pos))
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
