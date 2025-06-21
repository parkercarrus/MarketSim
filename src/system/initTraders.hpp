// init_traders.hpp
#pragma once

#include "../traders/Monkey.hpp"
#include "../traders/MarketMaker.hpp"
#include "../traders/MeanReverter.hpp"
#include "../traders/MomentumTrader.hpp"
#include "../betsize/fractional.hpp"
#include "../betsize/kelly.hpp"
#include <vector>
#include <memory>
#include <algorithm>
#include <random>
#include <nlohmann/json.hpp>
using json = nlohmann::json;

// Convenience struct to hold all trader data
struct TraderInitResult {
    std::vector<std::shared_ptr<Trader>> traders;
    std::unordered_map<int, std::shared_ptr<Trader>> trader_map;
};

struct InitialMarketState {
    double initial_price;
    int evolution_ticks;
    double kill_percentage;
    MonkeyInit monkeys;
    MarketMakerInit mmakers;
    MeanReverterInit mreverters;
    MomentumTraderInit momtraders;
};

inline TraderInitResult init_traders(
    const MonkeyInit& monkey,
    const MarketMakerInit& mmaker,
    const MeanReverterInit& mreverter,
    const MomentumTraderInit& momentumtrader,
    std::mt19937& gen
) {
    TraderInitResult result;
    int global_id = 0;

    // Monkey Traders
    for (int i = 0; i < monkey.num_monkeys; ++i, ++global_id) {
        auto sizer = std::make_shared<Fractional>(0.01, 1.0);
        auto trader = std::make_shared<MonkeyTrader>(global_id, monkey.noise_weight, sizer);
        result.trader_map[global_id] = trader;
        result.traders.push_back(trader);
    }

    // Market Makers
    for (int i = 0; i < mmaker.num_mmakers; ++i, ++global_id) {
        auto sizer = std::make_shared<Fractional>(0.01, 1.0);
        auto trader = std::make_shared<MarketMaker>(global_id, mmaker.fundamental_price, mmaker.spread, sizer);
        result.trader_map[global_id] = trader;
        result.traders.push_back(trader);
    }

    // Mean Reverters
    for (int i = 0; i < mreverter.num_mreverers; ++i, ++global_id) {
        std::shared_ptr<BetSizer> sizer = mreverter.sizers.at(i);
        auto trader = std::make_shared<MeanReverter>(global_id, mreverter.short_ma_window, mreverter.long_ma_window, sizer);
        result.trader_map[global_id] = trader;
        result.traders.push_back(trader);
    }

    // Momentum Traders
    for (int i = 0; i < momentumtrader.num_momtraders; ++i, ++global_id) {
        std::shared_ptr<BetSizer> sizer = momentumtrader.sizers.at(i);
        auto trader = std::make_shared<MomentumTrader>(global_id, momentumtrader.short_ma_window, momentumtrader.long_ma_window, sizer);
        result.trader_map[global_id] = trader;
        result.traders.push_back(trader);
    }

    std::shuffle(result.traders.begin(), result.traders.end(), gen);
    return result;
}

InitialMarketState load_initial_state(const std::string& path);
