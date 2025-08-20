from .RL import Trader as RLTrader
from .MeanReversion import MeanReversionTrader
from .Momentum import MomentumTrader
from marketsim.core.models import TraderSpec

REGISTRY = {
    "rl": RLTrader,
    "momentum": MomentumTrader,
    "mean_reversion": MeanReversionTrader,
}

def make_trader(cfg: TraderSpec):
    cls = REGISTRY[cfg.type]
    return cls(cfg)
