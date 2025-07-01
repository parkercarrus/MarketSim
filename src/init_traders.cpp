#include "headers/init/init_traders.hpp"

TraderInitResult init_traders(
    const MonkeyInit& monkey,
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

    // Mean Reverters
    std::uniform_int_distribution<int> short_dist_mr(mreverter.min_short, mreverter.max_short);
    std::uniform_int_distribution<int> long_dist_mr(mreverter.min_long, mreverter.max_long);
    for (int i = 0; i < mreverter.num_mreverters; ++i, ++global_id) {
        int short_window = short_dist_mr(gen);
        int long_window = long_dist_mr(gen);
        if (short_window > long_window) std::swap(short_window, long_window);
        auto sizer = std::make_shared<Fractional>(0.01, 1.0);
        auto trader = std::make_shared<MeanReverter>(global_id, short_window, long_window, sizer);
        result.trader_map[global_id] = trader;
        result.traders.push_back(trader);
    }

    // Momentum Traders
    std::uniform_int_distribution<int> short_dist_mo(momentumtrader.min_short, momentumtrader.max_short);
    std::uniform_int_distribution<int> long_dist_mo(momentumtrader.min_long, momentumtrader.max_long);
    for (int i = 0; i < momentumtrader.num_momtraders; ++i, ++global_id) {
        int short_window = short_dist_mo(gen);
        int long_window = long_dist_mo(gen);
        if (short_window > long_window) std::swap(short_window, long_window);
        auto sizer = std::make_shared<Fractional>(0.01, 1.0);
        auto trader = std::make_shared<MomentumTrader>(global_id, short_window, long_window, sizer);
        result.trader_map[global_id] = trader;
        result.traders.push_back(trader);
    }

    std::shuffle(result.traders.begin(), result.traders.end(), gen);

    return result;
}


MarketMakerInitResult init_market_makers(
    const MarketMakerInit& mmaker,
    std::mt19937& gen
) {
    MarketMakerInitResult result;
    int id = 100000; // avoid conflict with trader IDs

    for (int i = 0; i < mmaker.num_mmakers; ++i, ++id) {
        auto sizer = std::make_shared<Fractional>(0.01, 1.0);
        auto maker = std::make_shared<MarketMaker>(id, mmaker.fundamental_price, mmaker.spread, sizer);
        result.market_makers.push_back(maker);
    }

    return result;
}
