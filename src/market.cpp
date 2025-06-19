#include "headers/market.hpp"
#include "traders/MarketMaker.hpp"
#include "traders/Monkey.hpp"
#include "traders/MeanReverter.hpp"
#include "traders/MomentumTrader.hpp"
#include "headers/utils.hpp"

Market::Market(MonkeyInit monkey, MarketMakerInit mmaker, MeanReverterInit mreverter, MomentumTraderInit momentumtrader) {
    auto num_monkeys = monkey.num_monkeys;
    auto monkey_noise_weight = monkey.noise_weight;

    auto num_mmakers = mmaker.num_mmakers;
    auto mmaker_price = mmaker.fundamental_price;
    auto mmaker_spread = mmaker.spread;

    auto num_mreverters = mreverter.num_mreverers;
    auto mreverter_short_window = mreverter.short_ma_window; 
    auto mreverter_long_window = mreverter.long_ma_window;

    auto num_momentumtraders = momentumtrader.num_momtraders;
    auto momentum_short_window = momentumtrader.short_ma_window; 
    auto momentum_long_window = momentumtrader.long_ma_window;
    
    int global_id = 0;

    for (int i = 0; i < num_monkeys; ++i, ++global_id) {
        auto trader = std::make_shared<MonkeyTrader>(global_id, monkey_noise_weight);
        trader_map[global_id] = trader;
        traders.push_back(trader);
    }

    for (int i = 0; i < num_mmakers; ++i, ++global_id) {
        auto trader = std::make_shared<MarketMaker>(global_id, mmaker_price, mmaker_spread);
        trader_map[global_id] = trader;
        traders.push_back(trader);
    }

    for (int i = 0; i < num_mreverters; ++i, ++global_id) {
        auto trader = std::make_shared<MeanReverter>(global_id, mreverter_short_window, mreverter_long_window);
        trader_map[global_id] = trader;
        traders.push_back(trader);
    }

    for (int i = 0; i < num_momentumtraders; ++i, ++global_id) {
        auto trader = std::make_shared<MomentumTrader>(global_id, momentum_short_window, momentum_long_window);
        trader_map[global_id] = trader;
        traders.push_back(trader);
    }


    std::shuffle(traders.begin(), traders.end(), gen);
}

void Market::tick() {
    for (const auto& trader : traders) {
        Order order = trader->make_order(market_price, price_history, timestep);
        if (order.type == "BUY") buys.push(order);
        else if (order.type == "SELL") sells.push(order);
    }
    process_orders();
    ++timestep;
}

void Market::process_orders() {
    while (!buys.empty() && !sells.empty() &&
           buys.top().price >= sells.top().price) {
            
        Order buy = buys.top();
        Order sell = sells.top();
        if (buy.trader_id == sell.trader_id) {
            // don't process self-trades
            buys.pop();
            sells.pop();
            continue;
        }
        double order_price = (buy.price + sell.price) / 2.0;
        double quantity = 1;

        auto buyer = trader_map[buy.trader_id];
        auto seller = trader_map[sell.trader_id];
        
        buyer->update_position("BUY", order_price, quantity);
        seller->update_position("SELL", order_price, quantity);

        market_history.push_back({
            {"price", order_price},
            {"quantity", quantity},
            {"buyer_id", buy.trader_id},
            {"seller_id", sell.trader_id},
            {"timestep", timestep},
            {"buyer_type", buy.trader_type},
            {"seller_type", sell.trader_type}
        });

        buys.pop();
        sells.pop();

        price_history.push_back(order_price);
    }
}

void Market::print_trader_positions() {
    for (const auto& map_pair : trader_map) {
        int trader_id = map_pair.first;
        auto trader = map_pair.second; 
        double trader_value = trader->get_value(market_price);
        std::string trader_type = trader->get_type(); 
        std::cout << trader_type << " " << trader_id << " :: " << trader_value << std::endl;
    }
}