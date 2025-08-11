from .RL import Trader as RLTrader
from .MeanReversion import MeanReversionTrader
from .Momentum import MomentumTrader
from sim.models import TraderSpec



REGISTRY = {
    "rl": RLTrader,  # your class
    "momentum": MomentumTrader,
    "mean_reversion": MeanReversionTrader,
}

def make_trader(cfg: TraderSpec):
    cls = REGISTRY[cfg.type]
    return cls(cfg)  # each class accepts its own config subtype
