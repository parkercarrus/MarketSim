#pragma once
#include <iostream>

class BetSizer {
public:
    std::string sizing_method;
    virtual double get_bet_size(double market_price, double expected_price, double confidence, double capital) = 0;
    virtual ~BetSizer() = default;
    std::string get_method() const { return sizing_method; }
};
