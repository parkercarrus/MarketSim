#pragma once
#include <string>
#include <vector>
#include <random>
#include <iostream>
#include <fstream>
#include <map>
#include <vector>
#include <string>
#include "order.hpp"

inline std::vector<std::string> order_types = {"BUY", "SELL", "HOLD"};
inline std::random_device rd;
inline std::mt19937 gen(rd());
inline std::discrete_distribution<> order_dist({0.5, 0.5, 0.0});
inline std::normal_distribution<double> price_noise(0.0, 1.0);

inline std::string rand_order_type() {
    return order_types[order_dist(gen)];
}

inline double rand_centered_price(double market_price, double noise_weight) {
    return market_price + (noise_weight * market_price * price_noise(gen));
}

inline void export_trader_counts(const std::vector<TraderCount>& trader_counts, const std::string& filename) {
    std::ofstream file(filename);
    if (!file.is_open()) {
        std::cerr << "Error: Could not open file for writing.\n";
        return;
    }

    file << "timestep,Monkeys,MarketMakers,MomentumTraders,MeanReverters\n";

    for (const auto& counts : trader_counts) {
        file << counts.timestep << ","
             << counts.monkeys << ","
             << counts.marketmakers << ","
             << counts.momentumtraders << ","
             << counts.meanreverters << "\n";
    }

    file.close();
    std::cout << "Trader count history exported to " << filename << std::endl;
}

inline void export_csv_tick_history(const std::vector<MarketTick>& tick_history, const std::string& filename) {
    std::ofstream file(filename);
    if (!file.is_open()) {
        std::cerr << "Error: Could not open file for writing.\n";
        return;
    }

    file << "timestep,last_price,vwap,mid_price,volume\n";

    for (const auto& tick : tick_history) {
        file << tick.timestep << ","
             << tick.last_price << ","
             << tick.vwap << ","
             << tick.mid_price << ","
             << tick.volume << "\n";
    }

    file.close();
    std::cout << "Tick history exported to " << filename << std::endl;
}

inline void export_csv_orders(const std::vector<Trade>& trade_history, const std::string& filename) {
    std::ofstream file(filename);
    if (!file.is_open()) {
        std::cerr << "Error: Could not open file for writing.\n";
        return;
    }

    file << "timestep,price,quantity,buyer_id,seller_id,buyer_type,seller_type\n";

    for (const auto& trade : trade_history) {
        file << trade.timestep << ","
             << trade.price << ","
             << trade.quantity << ","
             << trade.buyer_id << ","
             << trade.seller_id << ","
             << trade.buyer_type << ","
             << trade.seller_type << "\n";
    }

    file.close();
    std::cout << "Trade history exported to " << filename << std::endl;
}

inline void export_csv_pnl(const std::vector<std::shared_ptr<Trader>>& traders, const std::string& filename, double market_price) {
    std::unordered_map<std::string, std::pair<double, int>> pnl_map;
    std::ofstream file(filename);

    file << "trader_type,avg_pnl\n";
    for (const auto& trader : traders) {
        std::string type = trader->get_type();
        pnl_map[type].first += trader->get_value(market_price);
        pnl_map[type].second += 1;
    }

    for (const auto& entry : pnl_map) {
        const std::string& type = entry.first;
        double avg_pnl = entry.second.second > 0 ? entry.second.first / entry.second.second : 0.0;
        file << type << "," << avg_pnl << "\n";
    }

    file.close();
    std::cout << "PnL exported to " << filename << std::endl;
}