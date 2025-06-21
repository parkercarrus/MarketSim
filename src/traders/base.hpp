#pragma once
#include "../headers/order.hpp"
#include "../betsize/base.hpp"
#include <iostream>

class Trader {
protected:
    std::shared_ptr<BetSizer> betsizer;

public:
    int trader_id;
    virtual ~Trader() = default;
    virtual Order make_order(double market_price, const std::vector<MarketTick>& tick_history, int timestep) = 0;
    double cash = 1000;
    double position = 1000;
    std::string trader_type;

    virtual double calculate_position_size(double market_price, double expected_price, double confidence) { 
        double position_size = betsizer->get_bet_size(market_price, expected_price, confidence, get_value(market_price));
        return position_size;
    }

    void update_position(std::string type, double price, double quantity) {
        if (type == "BUY") {
            cash -= price;
            position += quantity;
        }
        else {
            cash += price;
            position -= quantity;
        }
    };

    double get_value(double market_price) {
        return (position*market_price + cash);
    }

    virtual std::shared_ptr<BetSizer> get_sizer() const = 0;

    virtual std::string get_type() const = 0;

    int get_id() { return trader_id; }
};

struct MarketMakerInit {
    int num_mmakers;
    double fundamental_price;
    double spread;
    std::vector<std::shared_ptr<BetSizer>> sizers;
};

struct MeanReverterInit {
    int num_mreverers;
    int short_ma_window;
    int long_ma_window;
    std::vector<std::shared_ptr<BetSizer>> sizers;
};

struct MonkeyInit {
    int num_monkeys;
    double noise_weight;
    std::vector<std::shared_ptr<BetSizer>> sizers;
};

struct MomentumTraderInit {
    int num_momtraders;
    int short_ma_window;
    int long_ma_window;
    std::vector<std::shared_ptr<BetSizer>> sizers;
};