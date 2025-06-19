#include "headers/market.hpp"
#include "traders/Monkey.hpp"
#include "traders/MarketMaker.hpp"
#include "traders/MeanReverter.hpp"
#include "headers/utils.hpp"
#include <iostream>
#include <variant>

void print_market_history(std::vector<OrderStorage> market_history) {
    if (!(market_history.empty())) {
        int count = 0;
        for (const auto& transaction : market_history) {
            if (count % 20 == 0) {
                std::cout << "[t=" << std::get<int>(transaction.at("timestep")) << "] "
                        << "Trade executed at $" << std::get<double>(transaction.at("price")) 
                        << " between buyer " << std::get<int>(transaction.at("buyer_id")) 
                        << " and seller " << std::get<int>(transaction.at("seller_id")) 
                        << std::endl;
                        }
                        count += 1;
                    }
    }
}

int main() {
    MonkeyInit monkeys = MonkeyInit{2, 0.02};                    
    MarketMakerInit market_makers = MarketMakerInit{5, 1.0, 0.04}; 
    MeanReverterInit mean_reverters = MeanReverterInit{10, 10, 100};
    MomentumTraderInit momentum_traders = MomentumTraderInit{10, 10, 100};

    int ticks = 100000;

    Market market(monkeys, market_makers, mean_reverters, momentum_traders);
    for (int i = 0; i < ticks; ++i) {
        market.tick();
    }
    print_market_history(market.market_history);
    std::string orders_export_string = "../results/market_history.csv";
    export_csv_orders(market.market_history, orders_export_string);
    
    auto traders = market.traders;
    std::string pnl_export_string = "../results/avg_pnl.csv";
    export_csv_pnl(traders, pnl_export_string, market.market_price);
    market.print_trader_positions();
}