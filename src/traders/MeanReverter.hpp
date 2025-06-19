#pragma once
#include "class.hpp"
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

    MeanReverter(int id, int short_maw, int long_maw)
        : short_ma_window(short_maw), long_ma_window(long_maw) {
        trader_id = id;
        trader_type = "Mean Reverter";
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
        if (cash < market_price)
            return Order{"HOLD", market_price, trader_id, timestep, trader_type};

        if (price_history.size() < std::max(short_ma_window, long_ma_window))
            return Order{"HOLD", market_price, trader_id, timestep, trader_type};

        double short_ma = ma(price_history, short_ma_window);
        double long_ma = ma(price_history, long_ma_window);

        if (short_ma < long_ma) {
            return Order{"BUY", market_price, trader_id, timestep, trader_type};
        } else {
            return Order{"SELL", market_price, trader_id, timestep, trader_type};
        }
    }
};
