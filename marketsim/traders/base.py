from typing import Dict


class Trader:
    def __init__(self, config):
        self.id = getattr(config, "id", None)
        self.is_user = getattr(config, "is_user", False)
        self.initial_balance = getattr(config, "balance", 0.0)
        self.initial_assets = getattr(config, "assets", 0.0)
        self.type = getattr(config, "type", None)
        self.balance = float(self.initial_balance)
        self.assets = float(self.initial_assets)
        self.portfolio: Dict[str, float] = {"asset": float(self.initial_assets)}
        self.performance_history = []

    def get_asset_position(self, asset_id: str) -> float:
        return float(self.portfolio.get(asset_id, 0.0))

    def set_asset_position(self, asset_id: str, qty: float) -> None:
        self.portfolio[asset_id] = float(qty)
        if asset_id == "asset":
            self.assets = float(qty)

    def equity(self, mid_px: float) -> float:
        return float(self.balance + self.assets * mid_px)

    def margin_ratio(self, mid_px: float) -> float:
        notional = abs(self.assets) * mid_px
        if notional == 0:
            return float("inf")
        return self.equity(mid_px) / notional

    def calculate_net_worth(self, prices):
        if not isinstance(prices, dict):
            return float(self.balance)
        total = float(self.balance)
        for asset_id, px in prices.items():
            if asset_id == "asset" and asset_id not in self.portfolio:
                total += self.assets * float(px)
            else:
                total += float(self.portfolio.get(asset_id, 0.0)) * float(px)
        return total

    def reset(self):
        self.balance = float(self.initial_balance)
        self.assets = float(self.initial_assets)
        self.portfolio = {"asset": float(self.initial_assets)}
        self.performance_history = []
