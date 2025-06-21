#include "headers/market.hpp"
#include "headers/utils.hpp"
#include <iostream>
#include <gperftools/profiler.h>

int main() {
    // ProfilerStart("profile.prof");    
    InitialMarketState state = load_initial_state("../params.json");

    // Initialize market from state
    Market market(state);

    int ticks = 80000;
    for (int i = 0; i < ticks; ++i) {
        market.tick();
    }

    export_csv_orders(market.trade_history, "../results/trade_history.csv");

    export_csv_pnl(market.traders, "../results/avg_pnl.csv", market.market_price);

    export_csv_tick_history(market.tick_history, "../results/tick_history.csv");

    export_trader_counts(market.trader_counts, "../results/trader_counts.csv");

    market.print_trader_positions();

    return 0;
}
