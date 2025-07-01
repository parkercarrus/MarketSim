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
        double edge = expected_price - market_price;
        double odds = std::abs(edge / market_price);

        if (odds == 0.0 || confidence <= 0.5) return 0.0;

        double kelly = std::clamp((confidence - (1.0 - confidence)) * odds, 0.0, 1.0); // simplified, bounded
        double bet = kelly_fraction * kelly * capital;

        if (bet < min_bet) return 0.0;
        return bet / market_price; // return shares
    }
};