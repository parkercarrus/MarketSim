from pydantic import BaseModel, Field
from typing import List, Optional

class TraderConfig(BaseModel):
    id: str
    balance: float
    assets: float
    risk_aversion: float
    learning_rate: float = 0.01
    gamma: float = 0.99
    epsilon: float = 0.1
    is_user: bool = False

class MarketMakerConfig(BaseModel):
    id: str = "MM"
    balance: float = 10000.0
    assets: float = 100.0
    risk_aversion: float = 0.5
    learning_rate: float = 0.0
    gamma: float = 0.0
    epsilon: float = 0.0
    is_user: bool = False

class MarketConfig(BaseModel):
    initial_price: float = 100.0
    initial_quantity: int = 1000
    volatility: float = 0.02
    traders: List[TraderConfig]
    market_maker_config: MarketMakerConfig = Field(default_factory=MarketMakerConfig)