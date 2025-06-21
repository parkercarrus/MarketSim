#pragma once
#include "base.hpp"
#include "../headers/utils.hpp"
#include <random>
#include <string>
#include <vector>
#include <algorithm>


class MomentumTrader : public Trader {
public:
    virtual ~MomentumTrader() noexcept override = default;
    int short_ma_window;
    int long_ma_window;

    MomentumTrader(int id, int short_maw, int long_maw, std::shared_ptr<BetSizer> sizer)
        : short_ma_window(short_maw), long_ma_window(long_maw) {
        trader_id = id;
        trader_type = "Momentum Trader";
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
    
    double expected_price(double market_price, double short_ma, double long_ma) {
        int lookahead_ticks = 1000;
        double ma_slope = (short_ma - long_ma) / (long_ma_window - short_ma_window);
        ma_slope = std::clamp(ma_slope, -0.01, 0.01);
        return market_price + (market_price * ma_slope * lookahead_ticks);
    }

    std::vector<double> get_vwap_history(const std::vector<MarketTick>& tick_history) {
        std::vector<double> vwap_history;
        vwap_history.reserve(tick_history.size());

        for (const auto& tick : tick_history) {
            vwap_history.push_back(tick.vwap);
        }

        return vwap_history;
    }
    Order make_order(double market_price, const std::vector<MarketTick>& tick_history, int timestep) override {
        if (tick_history.size() < long_ma_window) {
            return Order{"HOLD", market_price, trader_id, timestep, trader_type, 0};
        }
    
        std::vector<double> vwap_history = get_vwap_history(tick_history);

        double short_ma = ma(vwap_history, short_ma_window);
        double long_ma = ma(vwap_history, long_ma_window);

        double projected_price = expected_price(market_price, short_ma, long_ma);
        double confidence = 1; // Replace with real logic if desired
        double position_size = calculate_position_size(market_price, projected_price, confidence);

        double signal_strength = std::clamp((short_ma - long_ma) / market_price, -0.05, 0.05);
        double trade_price = market_price * (1.0 + signal_strength);
        
        if (short_ma > long_ma) {
            if (cash >= market_price * position_size) {
                return Order{"BUY", market_price, trader_id, timestep, trader_type, position_size};
            }
        } else {  // SELL signal
            if (position >= position_size) {
                return Order{"SELL", market_price, trader_id, timestep, trader_type, position_size};
            }
        }

        return Order{"HOLD", market_price, trader_id, timestep, trader_type, 0};
    }

    std::string get_type() const override { return "MomentumTrader"; }
    int get_short_window() const { return short_ma_window; }
    int get_long_window() const { return long_ma_window; }
    std::shared_ptr<BetSizer> get_sizer() const override {
        return betsizer;
    }
};
