class Trader:
    def __init__(self, config):
        self.id = getattr(config, "id", None)
        self.is_user = getattr(config, "is_user", False)
        self.initial_balance = getattr(config, "balance", 0.0)
        self.initial_assets = getattr(config, "assets", 0.0)
        self.type = getattr(config, "type", None)
        self.balance = float(self.initial_balance)
        self.assets = float(self.initial_assets)
        self.performance_history = []

    def equity(self, mid_px: float) -> float:
        return float(self.balance + self.assets * mid_px)

    def margin_ratio(self, mid_px: float) -> float:
        notional = abs(self.assets) * mid_px
        if notional == 0:
            return float("inf")
        return self.equity(mid_px) / notional

    def calculate_net_worth(self, prices):
        return float(self.balance + self.assets * prices['asset'])

    def reset(self):
        self.balance = float(self.initial_balance)
        self.assets = float(self.initial_assets)
        self.performance_history = []