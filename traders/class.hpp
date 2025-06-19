#pragma once
#include "../order.hpp"
#include <iostream>

class Trader {
public:
    int trader_id;
    virtual ~Trader() = default;
    virtual Order make_order(double market_price, const std::vector<double>& price_history, int timestep) = 0;
    double cash = 1000;
    double position = 1;
    std::string trader_type;

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

    std::string get_type() const { return trader_type; }
};

struct MarketMakerInit {
    int num_mmakers;
    double fundamental_price;
    double spread;
};

struct MeanReverterInit {
    int num_mreverers;
    int short_ma_window;
    int long_ma_window;
};

struct MonkeyInit {
    int num_monkeys;
    double noise_weight;
};

struct MomentumTraderInit {
    int num_momtraders;
    int short_ma_window;
    int long_ma_window;
};