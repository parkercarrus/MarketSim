#pragma once
#include "order.hpp"
#include "traders/class.hpp"
#include <memory>
#include <vector>
#include <queue>
#include <unordered_map>
#include <variant>

using OrderStorage = std::unordered_map<std::string, std::variant<std::string, double, int>>;

class Market {
public:
    int timestep = 0;
    double market_price = 1;
    std::vector<std::shared_ptr<Trader>> traders;
    std::priority_queue<Order, std::vector<Order>, OrderPriceMax> buys;
    std::priority_queue<Order, std::vector<Order>, OrderPriceMin> sells;
    std::vector<OrderStorage> market_history;
    std::vector<double> price_history;
    std::unordered_map<int, std::shared_ptr<Trader>> trader_map;
    Market(MonkeyInit monkey, MarketMakerInit mmaker, MeanReverterInit meanreverter, MomentumTraderInit momentumtrader);
    void tick();
    void process_orders();
    void print_trader_positions();
    
};