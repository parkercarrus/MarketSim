#pragma once
#include "base.hpp"
#include "../headers/utils.hpp"
#include <random>
#include <string>
#include <vector>
#include <algorithm>
#include <cmath>

class Kelly : public BetSizer {
public:
    virtual ~Kelly() noexcept override = default;

    double kelly_fraction;
    double min_bet;

    Kelly(double bet_fraction, double min_bet)
        : kelly_fraction(bet_fraction), min_bet(min_bet) {
        sizing_method = "Kelly";
    }

    double get_bet_size(double market_price, double expected_price, double confidence, double capital) override {
        double odds = std::abs((expected_price - market_price) / market_price); 
        if (odds == 0.0) return 0.0; // no divide-by-zero

        double kelly = (odds * confidence - (1.0 - confidence)) / odds;
        double bet = kelly_fraction * kelly * capital;

        if (bet < min_bet || kelly <= 0.0) return 0.0;
        return bet;
    }
};