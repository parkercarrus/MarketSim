#pragma once
#include "initial_market_state.hpp"
#include "../../betsize/fractional.hpp"
#include "../../betsize/kelly.hpp"

#include <random>
#include <algorithm>

TraderInitResult init_traders(
    const MonkeyInit& monkey,
    const MeanReverterInit& mreverter,
    const MomentumTraderInit& momentumtrader,
    std::mt19937& gen
);

MarketMakerInitResult init_market_makers(
    const MarketMakerInit& mmaker,
    std::mt19937& gen
);
