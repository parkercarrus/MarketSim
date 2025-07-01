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
        betsizer = std::move(sizer);
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

    std::vector<double> get_vwap_history(const std::vector<MarketTick>& tick_history) {
        std::vector<double> vwap_history;
        vwap_history.reserve(tick_history.size());

        for (const auto& tick : tick_history) {
            vwap_history.push_back(tick.vwap);
        }

        return vwap_history;
    }

    Order make_order(
        double market_price,
        double best_bid,
        double best_ask,
        const std::vector<MarketTick>& tick_history,
        int timestep
    ) override {

        if (tick_history.size() < std::max(short_ma_window, long_ma_window))
            return Order{"HOLD", market_price, trader_id, timestep, trader_type, 0};

        std::vector<double> vwap_history = get_vwap_history(tick_history);
        double short_ma = ma(vwap_history, short_ma_window);
        double long_ma = ma(vwap_history, long_ma_window);

        double confidence = 1;
        double position_size = calculate_position_size(market_price, long_ma, confidence);
        double signal_strength = std::clamp((short_ma - long_ma) / market_price, -0.05, 0.05);

        // Buy if short MA < long MA and best ask is reasonable
        if (short_ma < long_ma && best_ask < 1e9) {
            if (cash >= best_ask * position_size) {
                return Order{"BUY", best_ask+0.01, trader_id, timestep, get_type(), position_size};
            }
        }

        else if (short_ma > long_ma && best_bid > -1e9) {
            if (position >= position_size) {
                return Order{"SELL", best_bid-0.01, trader_id, timestep, get_type(), position_size};
            }
        }

        return Order{"HOLD", market_price, trader_id, timestep, get_type(), 0};
    }


    std::string get_type() const override { return "MeanReverter"; }
    int get_short_window() const { return short_ma_window; }
    int get_long_window() const { return long_ma_window; }
    std::shared_ptr<BetSizer> get_sizer() const override {
        return betsizer;
    }
};