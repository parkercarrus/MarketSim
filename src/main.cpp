#include "headers/market.hpp"
#include "headers/init/init_state.hpp"
#include <iostream>
#include <chrono>

int main() {
    try {
        auto state = load_initial_state("../params.json");
        Market market(state);

        const int total_ticks = 50000;
        auto start = std::chrono::high_resolution_clock::now();

        for (int i = 0; i < total_ticks; ++i) {
            market.tick();
        }

        auto end = std::chrono::high_resolution_clock::now();
        std::chrono::duration<double> elapsed = end - start;
        std::cout << "Simulation completed in " << elapsed.count() << " seconds." << std::endl;

        market.print_trader_positions();
        
        export_csv_orders(market.trade_history, "../results/trade_history.csv");

        export_csv_pnl(market.traders, "../results/avg_pnl.csv", market.market_price);

        export_csv_tick_history(market.tick_history, "../results/tick_history.csv");

        export_trader_counts(market.trader_counts, "../results/trader_counts.csv");

        market.print_trader_positions();
    } catch (const std::exception& ex) {
        std::cerr << "Fatal error: " << ex.what() << std::endl;
        return 1;
    }

    return 0;
}
