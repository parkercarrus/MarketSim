#pragma once
#include "base.hpp"
#include "../headers/utils.hpp"
#include <random>
#include <string>
#include <vector>
#include <algorithm>


class MarketMaker : public Trader {
public:
    virtual ~MarketMaker() noexcept override = default;
    double base_price;
    double spread;

    MarketMaker(int id, double mmaker_price, double mmaker_spread, std::shared_ptr<BetSizer> sizer)
        : base_price(mmaker_price), spread(mmaker_spread) {
        trader_id = id;
        trader_type = "Market Maker";
        betsizer = std::move(sizer);
    }

    Order make_order(double market_price, const std::vector<MarketTick>& tick_history, int timestep) override {
        double dynamic_fundamental = base_price; // + 0.5 * std::sin(0.00001 * timestep);
        double current_spread = spread * market_price;
        double bid = std::max(0.01, dynamic_fundamental - current_spread / 2);
        double ask = std::max(0.01, dynamic_fundamental + current_spread / 2);

        double position_size = calculate_position_size(market_price, dynamic_fundamental, 1);

        if (cash >= bid * position_size) {
            return Order{"BUY", bid, trader_id, timestep, trader_type, position_size};
        }
        if (position >= position_size) {
            return Order{"SELL", ask, trader_id, timestep, trader_type, position_size};
        }

        return Order{"HOLD", market_price, trader_id, timestep, trader_type, 0};
    }

    std::string get_type() const override { 
        return "Market Maker"; 
    }

    double get_fundamental_price() const { 
        return base_price; 
    }

    double get_spread() const { 
        return spread; 
    }

    std::shared_ptr<BetSizer> get_sizer() const override { 
        return betsizer; 
    }

};
