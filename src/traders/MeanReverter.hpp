#pragma once
#include "base.hpp"
#include "../headers/utils.hpp"
#include <random>
#include <string>
#include <vector>
#include <algorithm>

class MeanReverter : public Trader {
public:
    virtual ~MeanReverter() noexcept override = default;
    int short_ma_window;
    int long_ma_window;

    MeanReverter(int id, int short_maw, int long_maw, std::shared_ptr<BetSizer> sizer)
        : short_ma_window(short_maw), long_ma_window(long_maw) {
        trader_id = id;
        trader_type = "Mean Reverter";
        betsizer = std::move(sizer);
        position = 1000;
    }

    double ma(const std::vector<double>& price_history, int ma_window) {
        int n = price_history.size();
        int start = std::max(0, n - ma_window);
        double sum = 0.0;
        for (int i = start; i < n; ++i) {
            sum += price_history[i];
        }
        return sum / (n - start);
    }

    Order make_order(double market_price, const std::vector<double>& price_history, int timestep) override {
        if (price_history.size() < std::max(short_ma_window, long_ma_window))
            return Order{"HOLD", market_price, trader_id, timestep, trader_type, 0};

        double short_ma = ma(price_history, short_ma_window);
        double long_ma = ma(price_history, long_ma_window);

        double confidence = 1;  
        double position_size = calculate_position_size(market_price, long_ma, confidence);

        if (short_ma < long_ma) {  
            if (cash >= market_price * position_size) {
                return Order{"BUY", market_price, trader_id, timestep, trader_type, position_size};
            }
        } else {  
            if (position >= position_size) {
                return Order{"SELL", market_price, trader_id, timestep, trader_type, position_size};
            }
        }

        return Order{"HOLD", market_price, trader_id, timestep, trader_type, 0};
    }
};