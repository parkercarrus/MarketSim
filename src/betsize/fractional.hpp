#pragma once
#include "base.hpp"
#include "../headers/utils.hpp"
#include <random>
#include <string>
#include <vector>
#include <algorithm>

class Fractional : public BetSizer {
public:
    virtual ~Fractional() noexcept override = default;
    double fraction;
    double min_bet;

    Fractional(double input_fraction, double input_min_bet)
        : fraction(input_fraction), min_bet(input_min_bet) {
            sizing_method = "FixedFraction";
        }

    
    double get_bet_size(double market_price, double expected_price, double confidence, double capital) override {
        double num_shares = (fraction * capital) / market_price;
        return num_shares;
    }
};