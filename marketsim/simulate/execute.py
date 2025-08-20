from typing import List, Optional
from pydantic import BaseModel
from marketsim.core.market import Market
from marketsim.core.models import MarketConfig
from marketsim.simulate.models import ResultsObject
from marketsim.core.orderbook import Order
from marketsim.utils.createState import construct

def init(cfg) -> Market:
    """Initialize and return a MarketConfig object from cfg."""
    try:
        return Market(construct(cfg))
    except Exception as e:
        raise KeyError(f"Error constructing MarketConfig object: {e}")
    
def run(market: Market, ticks: int) -> ResultsObject:
    res = ResultsObject(market, ticks)
    for i in range(ticks):
        data = market.step()
        res.add(data)
    return res

