#pragma once
#include <string>

struct Order {
    std::string type;
    double price;
    int trader_id;
    int timestep;
    std::string trader_type;
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
