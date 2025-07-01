#pragma once
#include "order.hpp"
#include "../traders/base.hpp"
#include "../makers/MarketMaker.hpp"
#include <memory>
#include <vector>
#include <queue>
#include <unordered_map>
#include <variant>
#include "init/init_traders.hpp"

using OrderStorage = std::unordered_map<std::string, std::variant<std::string, double, int>>;

struct Trade;
struct MarketTick;
struct TraderCount;

class Market {
private:
    void evolve_traders();
public:
    int timestep = 0;
    double market_price = 1;
    int evolution_ticks;
    bool evolve;
    double kill_percentage;
    int write_every;
    int max_order_age;
    std::unordered_map<std::string, double> trader_volume;
    double total_trade_volume;
    double total_price_volume;


    std::vector<std::shared_ptr<Trader>> traders;
    std::vector<std::shared_ptr<MarketMaker>> market_makers;
    std::map<double, std::queue<Order>, std::greater<double>> buys; 
    std::map<double, std::queue<Order>> sells;          
    std::vector<Trade> trade_history;
    std::vector<MarketTick> tick_history;
    std::vector<TraderCount> trader_counts;
    std::unordered_map<int, std::shared_ptr<Trader>> trader_map;
    std::unordered_map<int, std::shared_ptr<MarketMaker>> market_maker_map;
    Market(const InitialMarketState& state);
    void tick();
    MarketTick process_orders();
    void print_trader_positions();
    std::vector<double> get_vwap_history();
    void print_trader_counts();
    void update_trader_counts();
    void log_trade(const Trade& t);
    void truncate_tick_history();
    double get_best_ask() const;
    double get_best_bid() const;
    void write_tick(double market_price);
    void clear_market_maker_orders();
    void debug_order_book();
    void process_aggressive_order(const Order& order);
};
