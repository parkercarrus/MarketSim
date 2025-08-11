from pydantic import BaseModel, Field
from typing import List, Literal, Union

# Common fields
class BaseTraderConfig(BaseModel):
    id: str
    balance: float
    assets: float
    risk_aversion: float
    is_user: bool = False
    shorting_enabled: bool = True
    max_long_units: int = 50
    max_short_units: int = 50
    base_qty: int = 2
    limit_offset_pct: float = 0.002

# Strategy-specific configs
class RLConfig(BaseTraderConfig):
    type: Literal["rl"] = "rl"
    learning_rate: float = 0.01
    gamma: float = 0.99
    epsilon: float = 0.1
    state_size: int = 8
    qty_bins: List[int] = Field(default_factory=lambda: [1,2,5])
    pct_bins: List[float] = Field(default_factory=lambda: [0.002,0.005,0.01])
    hidden_size: int = 64
    huber_delta: float = 1.0
    batch_size: int = 64
    tau: float = 0.01
    replay_size: int = 20000
    epsilon_decay: float = 0.995
    epsilon_min: float = 0.01
    random_state: int = 17 # arbitrary value

class MomentumConfig(BaseTraderConfig):
    type: Literal["momentum"] = "momentum"
    mom_short: int = 3
    mom_long: int = 10
    entry_threshold: float = 0.003
    exit_threshold: float = 0.0005

class MeanReversionConfig(BaseTraderConfig):
    type: Literal["mean_reversion"] = "mean_reversion"
    mr_lookback: int = 20
    mr_min_std: float = 1e-3
    mr_entry_z: float = 1.0
    mr_exit_z: float = 0.25

# Discriminated union
TraderSpec = Union[RLConfig, MomentumConfig, MeanReversionConfig]

class MarketMakerConfig(BaseModel):
    id: str = "MM"
    balance: float = 10000.0
    assets: float = 100.0
    risk_aversion: float = 0.5
    is_user: bool = False

class MarketConfig(BaseModel):
    initial_price: float = 100.0
    initial_quantity: int = 1000
    traders: List[TraderSpec]
    market_maker_config: MarketMakerConfig = Field(default_factory=MarketMakerConfig)
