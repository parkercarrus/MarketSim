#pragma once
#include "base.hpp"
#include "../headers/utils.hpp"
#include <random>
#include <string>

class MonkeyTrader : public Trader {
public:
    virtual ~MonkeyTrader() noexcept override = default;
    double noise_weight;

    MonkeyTrader(int id, double weight, std::shared_ptr<BetSizer> sizer) { 
        this-> trader_id = id; 
        this-> noise_weight = weight;
        this-> trader_type = "Monkey";
        betsizer = std::move(sizer);
    }

    Order make_order(double market_price, const std::vector<MarketTick>& tick_history, int timestep) override {
        std::string order_type = rand_order_type();
        double price = rand_centered_price(market_price, noise_weight);

        double position_size = 1;

        if (order_type == "BUY" && cash < price * position_size) {
            return Order{"HOLD", market_price, trader_id, timestep, trader_type, 0};
        } 

        if (order_type == "SELL" && position < position_size) {
            return Order{"HOLD", market_price, trader_id, timestep, trader_type, 0};
        }

        return Order{order_type, price, trader_id, timestep, trader_type, position_size};
    }

    std::string get_type() const override { return "Monkey"; }
    double get_noise_weight() const { return noise_weight; }
    std::shared_ptr<BetSizer> get_sizer() const override {
        return betsizer;
    }
};
