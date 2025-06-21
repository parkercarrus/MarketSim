#pragma once
#include "order.hpp"
#include "../traders/base.hpp"
#include <memory>
#include <vector>
#include <queue>
#include <unordered_map>
#include <variant>
#include "../system/initTraders.hpp"

using OrderStorage = std::unordered_map<std::string, std::variant<std::string, double, int>>;

struct Trade;
struct MarketTick;
struct TraderCount;

class Market {
public:
    int timestep = 0;
    double market_price = 1;
    int evolution_ticks;
    double kill_percentage;
    std::vector<std::shared_ptr<Trader>> traders;
    std::priority_queue<Order, std::vector<Order>, OrderPriceMax> buys;
    std::priority_queue<Order, std::vector<Order>, OrderPriceMin> sells;
    std::vector<Trade> trade_history;
    std::vector<MarketTick> tick_history;
    std::vector<TraderCount> trader_counts;

    std::unordered_map<int, std::shared_ptr<Trader>> trader_map;
    Market(const InitialMarketState& state);
    void tick();
    MarketTick process_orders();
    void print_trader_positions();
    std::vector<double> get_vwap_history();
    void print_trader_counts();
    void update_trader_counts();
    void log_trade(const Trade& t);
    
};