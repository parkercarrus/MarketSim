#pragma once
#include <memory>
#include <vector>
#include <algorithm>
#include "../headers/order.hpp" 
#include "../headers/utils.hpp"

class MarketMaker {
private:
    int id;
    double fundamental_price;
    double spread;
    
public:
    MarketMaker(int id, double fundamental_price, double spread, std::shared_ptr<BetSizer> sizer)
        : id(id), fundamental_price(fundamental_price), spread(spread) {}
    
    int get_id() const { return id; }
    double get_fundamental_price() const { return fundamental_price; }
    double get_spread() const { return spread; }
    
    double get_fundamental_price(double current_market_price) const {
        return current_market_price;
    }
    
    std::vector<Order> quote(double current_market_price) {
        double fair_value = get_fundamental_price(current_market_price);
        double noise = 0; // price_noise(gen); 
        double bid = fair_value - spread/2.0 + noise;
        double ask = fair_value + spread/2.0 + noise;
        double size = 10.00;
        // std::cout << "MM " << id << " quoting: bid=" << bid << " ask=" << ask << " size=" << size << std::endl;
        return {
            Order{"BUY", bid, id, 0, "MarketMaker", size},  
            Order{"SELL", ask, id, 0, "MarketMaker", size}
        };
    }
    
    void update_position(const std::string& side, double price, double quantity) {
        std::cout << "MM " << id << " executed " << side << " " << quantity << " @ " << price << std::endl;
    }


};