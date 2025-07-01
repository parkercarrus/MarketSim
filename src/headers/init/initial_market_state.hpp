#pragma once
#include "../../traders/Monkey.hpp"
#include "../../makers/MarketMaker.hpp"
#include "../../traders/MeanReverter.hpp"
#include "../../traders/MomentumTrader.hpp"
#include <vector>
#include <unordered_map>
#include <memory>

struct TraderInitResult {
    std::vector<std::shared_ptr<Trader>> traders;
    std::unordered_map<int, std::shared_ptr<Trader>> trader_map;
};

struct MarketMakerInitResult {
    std::vector<std::shared_ptr<MarketMaker>> market_makers;
    std::unordered_map<int, std::shared_ptr<MarketMaker>> market_maker_map;
};

struct InitialMarketState {
    double initial_price;
    int evolution_ticks;
    bool evolve;
    double kill_percentage;
    int write_every;
    int max_order_age;
    
    MonkeyInit monkeys;
    MeanReverterInit mreverters;
    MomentumTraderInit momtraders;
    MarketMakerInit mmakers;
};
