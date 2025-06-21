#pragma once
#include <string>

struct Order {
    std::string type;
    double price;
    int trader_id;
    int timestep;
    std::string trader_type;
    double position_size;
};

struct Trade {
    double price;
    double quantity;
    int buyer_id;
    int seller_id;
    int timestep;
    std::string buyer_type;
    std::string seller_type;
};

struct MarketTick {
    double last_price;
    double volume; 
    double vwap;
    double mid_price; 
    int timestep;
};

struct TraderCount {
    int timestep;
    int monkeys;
    int marketmakers;
    int momentumtraders;
    int meanreverters;
};

struct OrderPriceMin {
    bool operator()(const Order& a, const Order& b) const {
        return a.price > b.price;
    }
};

struct OrderPriceMax {
    bool operator()(const Order& a, const Order& b) const {
        return a.price < b.price;
    }
};
