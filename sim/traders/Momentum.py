from collections import deque
import numpy as np
from .base import Trader as BaseTrader

class MomentumTrader(BaseTrader):
    """
    Rule-based momentum trader:
      - Signal = return over short lookback minus return over long lookback
      - Enter long if signal > entry_threshold
      - Enter short if signal < -entry_threshold (if shorting enabled)
      - Hysteresis exit: flatten/flip only when |signal| falls below exit_threshold
      - Risk-aware sizing; respects cash, long/short caps, and shorting flag
    Produces the same action dict shape as your RL agent and carries attributes
    used by Market (avg_entry_price, shorting_enabled, etc.).
    """
    def __init__(self, config):
        super().__init__(config)

        # ---- accounting fields your Market relies on ----
        self.performance_history = []
        self.shorting_enabled   = getattr(config, "shorting_enabled", True)
        self.avg_entry_price    = None
        self.max_short_units    = getattr(config, "max_short_units", 50)

        # ---- momentum params ----
        self.short_lb          = int(getattr(config, "mom_short", 3))
        self.long_lb           = int(getattr(config, "mom_long", 10))
        self.entry_threshold   = float(getattr(config, "entry_threshold", 0.003))   # 0.3% spread
        self.exit_threshold    = float(getattr(config, "exit_threshold", 0.0005))   # 0.05% hysteresis

        # ---- sizing & limits ----
        self.base_qty          = int(getattr(config, "base_qty", 2))               # lot size seed
        self.max_long_units    = int(getattr(config, "max_long_units", 50))
        self.max_short_units   = int(getattr(config, "max_short_units", 50))
        self.limit_offset_pct  = float(getattr(config, "limit_offset_pct", 0.002)) # place slightly outside mid

        # reuse risk knobs for sizing
        self.risk_aversion     = float(getattr(config, "risk_aversion", 0.5))      # 0..1
        # keep consistent fields with RL trader (even if unused here)
        self.learning_rate     = getattr(config, "learning_rate", 0.001)

        self.type = "momentum"   # for UI/telemetry parity
        self.last_action = {'type': 'hold', 'quantity': 0, 'price': None}
        self.last_state  = None   # not used, kept for symmetry

    # --- margin helpers used by Market (mirror RL trader) ---
    def equity(self, mid_px: float) -> float:
        return float(self.balance + self.assets * mid_px)

    def margin_ratio(self, mid_px: float) -> float:
        notional = abs(self.assets) * mid_px
        if notional == 0:
            return float("inf")
        return self.equity(mid_px) / notional

    # --- internal: compute momentum signal ---
    def _signal(self, price_hist):
        """
        Return short-minus-long lookback returns.
        If insufficient history, return 0 to avoid noisy churn.
        """
        if not price_hist or len(price_hist) <= max(self.short_lb, self.long_lb):
            return 0.0

        p = np.asarray(price_hist, dtype=float)
        p_now = p[-1]

        p_s = p[-self.short_lb-1]  if len(p) > self.short_lb  else p[0]
        p_l = p[-self.long_lb-1]   if len(p) > self.long_lb   else p[0]

        r_s = (p_now - p_s) / (p_s + 1e-9)
        r_l = (p_now - p_l) / (p_l + 1e-9)
        return float(r_s - r_l)

    # --- internal: risk-aware position sizing ---
    def _desired_trade(self, obs, signal):
        """
        Decide side and size, respecting:
          - cash / inventory / short room
          - long/short caps
          - shorting flag
        """
        px   = float(obs['market_price'])
        cash = float(obs['own_balance'])
        pos  = int(obs['own_assets'])  # signed

        bullish = signal > self.entry_threshold
        bearish = signal < -self.entry_threshold

        # soft sizing: larger when conviction higher & risk_aversion lower
        # map |signal| roughly 0..1 (clamped) and blend with base_qty
        strength = min(1.0, abs(signal) / max(self.entry_threshold, 1e-6))
        size_seed = self.base_qty + int(np.ceil(self.base_qty * strength * (1.0 - 0.6*self.risk_aversion)))
        size_seed = max(1, size_seed)

        # affordability & caps
        max_affordable = int(cash // max(px, 1e-9))
        long_room  = max(0, self.max_long_units  - max(0, pos))
        short_room = max(0, self.max_short_units - max(0, -pos))

        # default hold
        return {'type': 'hold', 'quantity': 0, 'price': px}, pos, px

        # NOTE: we'll choose below based on signals; (we return at the end)

    def act(self, obs):
        """
        Emit an order dict compatible with Market:
          {'type': 'buy'|'sell'|'hold', 'quantity': int, 'price': float, 'action_idx': -1}
        Uses limit prices around mid to help cross a thin spread while avoiding far slippage.
        """
        if obs is None:
            return {'type': 'hold', 'quantity': 0, 'price': None, 'action_idx': -1}

        price_hist = obs.get('price_history', [])
        px   = float(obs['market_price'])
        cash = float(obs['own_balance'])
        pos  = int(obs['own_assets'])

        signal = self._signal(price_hist)
        bullish = signal > self.entry_threshold
        bearish = signal < -self.entry_threshold
        flatten_bull = signal < self.exit_threshold     # exit long if momentum fades
        flatten_bear = signal > -self.exit_threshold    # exit short if momentum fades

        # base price placement
        buy_px  = round(px * (1.0 + self.limit_offset_pct),  2)
        sell_px = round(px * (1.0 - self.limit_offset_pct),  2)

        # sizing (recompute here for clarity)
        strength = min(1.0, abs(signal) / max(self.entry_threshold, 1e-6))
        size_seed = self.base_qty + int(np.ceil(self.base_qty * strength * (1.0 - 0.6*self.risk_aversion)))
        size_seed = max(1, size_seed)

        max_affordable = int(cash // max(px, 1e-9))
        long_room  = max(0, self.max_long_units  - max(0, pos))
        short_room = max(0, self.max_short_units - max(0, -pos))

        # Decision logic with hysteresis and flip handling
        # 1) Bullish: reduce short -> flat -> build long
        if bullish:
            if pos < 0:
                # Cover shorts first
                qty = min(size_seed, max_affordable, -pos)  # can’t buy more than we owe or cash allows
                if qty > 0:
                    action = {'type': 'buy', 'quantity': qty, 'price': buy_px, 'action_idx': -1}
                    self.last_action = action
                    return action
                # If we can’t cover (no cash), hold
                action = {'type': 'hold', 'quantity': 0, 'price': px, 'action_idx': -1}
                self.last_action = action
                return action
            else:
                # Build/extend long
                build_room = min(long_room, max_affordable)
                qty = min(size_seed, build_room)
                if qty > 0:
                    action = {'type': 'buy', 'quantity': qty, 'price': buy_px, 'action_idx': -1}
                else:
                    action = {'type': 'hold', 'quantity': 0, 'price': px, 'action_idx': -1}
                self.last_action = action
                return action

        # 2) Bearish: reduce long -> flat -> build short (if enabled)
        if bearish:
            if pos > 0:
                # Reduce longs first
                qty = min(size_seed, pos)
                if qty > 0:
                    action = {'type': 'sell', 'quantity': qty, 'price': sell_px, 'action_idx': -1}
                    self.last_action = action
                    return action
                action = {'type': 'hold', 'quantity': 0, 'price': px, 'action_idx': -1}
                self.last_action = action
                return action
            else:
                # Build/extend short
                if not self.shorting_enabled:
                    action = {'type': 'hold', 'quantity': 0, 'price': px, 'action_idx': -1}
                    self.last_action = action
                    return action
                qty = min(size_seed, short_room)
                if qty > 0:
                    action = {'type': 'sell', 'quantity': qty, 'price': sell_px, 'action_idx': -1}
                else:
                    action = {'type': 'hold', 'quantity': 0, 'price': px, 'action_idx': -1}
                self.last_action = action
                return action

        # 3) No strong signal: gently flatten if momentum has faded past hysteresis
        if pos > 0 and flatten_bull:
            qty = min(size_seed, pos)
            if qty > 0:
                action = {'type': 'sell', 'quantity': qty, 'price': sell_px, 'action_idx': -1}
                self.last_action = action
                return action
        if pos < 0 and flatten_bear:
            qty = min(size_seed, -pos, max_affordable)  # covering needs cash
            if qty > 0:
                action = {'type': 'buy', 'quantity': qty, 'price': buy_px, 'action_idx': -1}
                self.last_action = action
                return action

        # default: hold
        action = {'type': 'hold', 'quantity': 0, 'price': px, 'action_idx': -1}
        self.last_action = action
        return action

    # Rule-based: no learning step needed, but keep API parity
    def train(self, *args, **kwargs):
        return

    # -----------------------------
    # Accounting helpers
    # -----------------------------
    def calculate_net_worth(self, prices):
        return float(self.balance + self.assets * prices['asset'])

    def reset(self):
        super().reset()
        self.performance_history = []
        # keep avg_entry_price; your Market likely updates it during fills
