from marketsim.core.models import MarketConfig
from marketsim.utils.token import decode_sim_token

def construct_from_dict(config: dict) -> MarketConfig:
    return MarketConfig(**config)

def construct_from_token(token: str) -> MarketConfig:
    cfg_dict = decode_sim_token(token)
    return construct_from_dict(cfg_dict)

def construct(config_object) -> MarketConfig:
    """Return MarketConfig object from token (str) or config (dict) objects"""
    if isinstance(config_object, dict):
        return construct_from_dict(config_object)
    elif isinstance(config_object, str):
        return construct_from_token(config_object)
    else:
        raise TypeError("Input must be a dict or str")