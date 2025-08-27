import numpy as np
from .base import Trader as BaseTrader  

class MeanReversionTrader(BaseTrader):
    def __init__(self, config):
        super().__init__(config)

        self.performance_history = []
        self.shorting_enabled   = getattr(config, "shorting_enabled", True)
        self.avg_entry_price    = None
        self.max_short_units    = int(getattr(config, "max_short_units", 50))

        #  params 
        self.lookback          = int(getattr(config, "mr_lookback", 20))
        self.min_std           = float(getattr(config, "mr_min_std", 1e-3))
        self.entry_z           = float(getattr(config, "mr_entry_z", 1.0))
        self.exit_z            = float(getattr(config, "mr_exit_z", 0.25))  

        # sizing / limits
        self.base_qty          = int(getattr(config, "base_qty", 2))
        self.max_long_units    = int(getattr(config, "max_long_units", 50))
        self.max_short_units   = int(getattr(config, "max_short_units", 50))
        self.limit_offset_pct  = float(getattr(config, "limit_offset_pct", 0.002))  

        self.risk_aversion     = float(getattr(config, "risk_aversion", 0.5))

        self.type = "mean_reversion"
        self.last_action = {'type': 'hold', 'quantity': 0, 'price': None}
        self.last_state  = None 

    def equity(self, mid_px: float) -> float:
        return float(self.balance + self.assets * mid_px)

    def margin_ratio(self, mid_px: float) -> float:
        notional = abs(self.assets) * mid_px
        if notional == 0:
            return float("inf")
        return self.equity(mid_px) / notional

    def _zscore(self, price_hist):
        """
        z = (p_now - mean) / std  over last `lookback` prices (incl. now).
        If insufficient history or tiny std, return 0.
        """
        if price_hist is None or len(price_hist) < self.lookback:
            return 0.0
        window = np.asarray(price_hist[-self.lookback:], dtype=float)
        mean = window.mean()
        std = window.std(ddof=0)
        if std < self.min_std:
            return 0.0
        return float((window[-1] - mean) / std)

    def act(self, obs):
        """
        Return order dict compatible with Market:
          {'type': 'buy'|'sell'|'hold', 'quantity': int, 'price': float, 'action_idx': -1}
        """
        if obs is None:
            return {'type': 'hold', 'quantity': 0, 'price': None, 'action_idx': -1}

        price_hist = obs.get('price_history', [])
        px   = float(obs['market_price'])
        cash = float(obs['own_balance'])
        pos  = int(obs['own_assets'])

        z = self._zscore(price_hist)

        want_sell = z > self.entry_z
        want_buy  = z < -self.entry_z
        flatten   = abs(z) < self.exit_z  # hysteresis band

        # place limits a touch inside the spread
        buy_px  = round(px * (1.0 + self.limit_offset_pct),  2)
        sell_px = round(px * (1.0 - self.limit_offset_pct),  2)

        # conviction -> size; risk_aversion shrinks it
        strength = min(1.0, abs(z) / max(self.entry_z, 1e-6))
        size_seed = self.base_qty + int(np.ceil(self.base_qty * strength * (1.0 - 0.6*self.risk_aversion)))
        size_seed = max(1, size_seed)

        max_affordable = int(cash // max(px, 1e-9))
        long_room  = max(0, self.max_long_units  - max(0, pos))
        short_room = max(0, self.max_short_units - max(0, -pos))

        # 1) Enter/extend positions
        if want_buy:
            # cover short first, then build long
            if pos < 0:
                qty = min(size_seed, -pos, max_affordable)
                if qty > 0:
                    a = {'type': 'buy', 'quantity': qty, 'price': buy_px, 'action_idx': -1}
                    self.last_action = a; return a
            # build long
            qty = min(size_seed, long_room, max_affordable)
            if qty > 0:
                a = {'type': 'buy', 'quantity': qty, 'price': buy_px, 'action_idx': -1}
                self.last_action = a; return a
            a = {'type': 'hold', 'quantity': 0, 'price': px, 'action_idx': -1}
            self.last_action = a; return a

        if want_sell:
            # reduce long first, then build short
            if pos > 0:
                qty = min(size_seed, pos)
                if qty > 0:
                    a = {'type': 'sell', 'quantity': qty, 'price': sell_px, 'action_idx': -1}
                    self.last_action = a; return a
            if self.shorting_enabled:
                qty = min(size_seed, short_room)
                if qty > 0:
                    a = {'type': 'sell', 'quantity': qty, 'price': sell_px, 'action_idx': -1}
                    self.last_action = a; return a
            a = {'type': 'hold', 'quantity': 0, 'price': px, 'action_idx': -1}
            self.last_action = a; return a

        # 2) No strong signal: gently revert toward flat if inside hysteresis
        if flatten:
            if pos > 0:
                qty = min(size_seed, pos)
                if qty > 0:
                    a = {'type': 'sell', 'quantity': qty, 'price': sell_px, 'action_idx': -1}
                    self.last_action = a; return a
            elif pos < 0:
                qty = min(size_seed, -pos, max_affordable)  # covering needs cash
                if qty > 0:
                    a = {'type': 'buy', 'quantity': qty, 'price': buy_px, 'action_idx': -1}
                    self.last_action = a; return a

        # default: hold
        a = {'type': 'hold', 'quantity': 0, 'price': px, 'action_idx': -1}
        self.last_action = a
        return a

    # no learning for rule-based traders
    def train(self, *args, **kwargs):
        return

    # accounting helpers
    def calculate_net_worth(self, prices):
        return float(self.balance + self.assets * prices['asset'])

    def reset(self):
        super().reset()
        self.performance_history = []
