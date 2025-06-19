#pragma once
#include "class.hpp"
#include "../headers/utils.hpp"
#include <random>
#include <string>

class MonkeyTrader : public Trader {
public:
    virtual ~MonkeyTrader() noexcept override = default;
    double noise_weight;

    MonkeyTrader(int id, double weight) { 
        this-> trader_id = id; 
        this-> noise_weight = weight;
        this-> trader_type = "Monkey";
    }
    Order make_order(double market_price, const std::vector<double>& price_history, int timestep) override {
        std::string order_type = rand_order_type();
        double price = rand_centered_price(market_price, noise_weight);

        if (order_type == "BUY" && cash < price) {
            return Order{"HOLD", market_price, trader_id, timestep, trader_type};
        } 

        if (order_type == "SELL" && position < 1) {
            return Order{"HOLD", market_price, trader_id, timestep, trader_type};
        }
    
        return Order{order_type, price, trader_id, timestep, trader_type};
    }

};
