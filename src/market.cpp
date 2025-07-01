#include "headers/market.hpp"
#include "headers/utils.hpp"
#include <algorithm>
#include <execution>
#include <future>
#include <fstream>
#include <thread>

Market::Market(const InitialMarketState& state) {
    market_price = state.initial_price;
    evolution_ticks = state.evolution_ticks;
    kill_percentage = state.kill_percentage;
    evolve = state.evolve;
    write_every = state.write_every; // how often to write to csv for live plotting
    max_order_age = state.max_order_age;

    TraderInitResult trader_init = init_traders(
        state.monkeys,
        state.mreverters,
        state.momtraders,
        gen
    );

    traders = std::move(trader_init.traders);
    trader_map = std::move(trader_init.trader_map);

    MarketMakerInitResult mmaker_init = init_market_makers(
        state.mmakers,
        gen
    );

    market_makers = std::move(mmaker_init.market_makers);
    market_maker_map = std::move(mmaker_init.market_maker_map);
}

void Market::tick() {
    trader_volume.clear();
    clear_market_maker_orders();
    total_trade_volume = 0.0;
    total_price_volume = 0.0;

    for (const auto& mm : market_makers) {
        auto quotes = mm->quote(market_price);
        for (const auto& order : quotes) {
            process_aggressive_order(order);
        }
    }

    for (const auto& trader : traders) {
        auto order = trader->make_order(market_price, get_best_bid(), get_best_ask(), tick_history, timestep);
        process_aggressive_order(order);
    }

    ++timestep;

    if (evolve) evolve_traders();

    if (timestep % write_every == 0) write_tick(market_price);

    double tick_vwap = (total_trade_volume > 0.0) ? (total_price_volume / total_trade_volume) : market_price;
    double best_bid = get_best_bid();
    double best_ask = get_best_ask();
    double mid_price = (best_bid + best_ask) / 2.0;

    tick_history.push_back({market_price, total_trade_volume, tick_vwap, mid_price, timestep});

    std::cout << market_price << std::endl;
}


void Market::process_aggressive_order(const Order& order) {
    Order remaining_order = order;

    if (order.type == "BUY") {
        while (!sells.empty() && remaining_order.price >= sells.begin()->first && remaining_order.position_size > 0) {
            auto sell_it = sells.begin();
            Order sell_order = sell_it->second.front();
            
            if (remaining_order.trader_id == sell_order.trader_id) {
                sell_it->second.pop();
                if (sell_it->second.empty()) sells.erase(sell_it);
                continue;
            }
            
            if (timestep - sell_order.timestep > max_order_age) {
                sell_it->second.pop();
                if (sell_it->second.empty()) sells.erase(sell_it);
                continue;
            }

            double trade_price = sell_order.price; // Taker pays maker's price
            double quantity = std::min(remaining_order.position_size, sell_order.position_size);

            trader_volume[order.trader_type] += quantity; 
            total_trade_volume += quantity;
            total_price_volume += trade_price * quantity;

            auto buyer_it = trader_map.find(remaining_order.trader_id);
            auto seller_it = trader_map.find(sell_order.trader_id);
            
            if (buyer_it != trader_map.end()) {
                buyer_it->second->update_position("BUY", trade_price, quantity);
            }
            if (seller_it != trader_map.end()) {
                seller_it->second->update_position("SELL", trade_price, quantity);
            }
            
            Trade trade = {trade_price, quantity, remaining_order.trader_id, sell_order.trader_id, timestep, remaining_order.trader_type, sell_order.trader_type};
            log_trade(trade);
            trade_history.push_back(trade);
            
            market_price = trade_price;
            
            sell_order.position_size -= quantity;
            remaining_order.position_size -= quantity;
            
            sell_it->second.pop();
            if (sell_it->second.empty()) sells.erase(sell_it);
            if (sell_order.position_size > 0) {
                sells[sell_order.price].push(sell_order);
            }
        }
        
        if (remaining_order.position_size > 0) {
            buys[remaining_order.price].push(remaining_order);
        }
        
    } else if (order.type == "SELL") {

        while (!buys.empty() && remaining_order.price <= buys.begin()->first && remaining_order.position_size > 0) {
            auto buy_it = buys.begin();
            Order buy_order = buy_it->second.front();
            
            if (remaining_order.trader_id == buy_order.trader_id) {
                buy_it->second.pop();
                if (buy_it->second.empty()) buys.erase(buy_it);
                continue;
            }
            
            if (timestep - buy_order.timestep > max_order_age) {
                buy_it->second.pop();
                if (buy_it->second.empty()) buys.erase(buy_it);
                continue;
            }
            
            double trade_price = buy_order.price; // Taker gets maker's price
            double quantity = std::min(remaining_order.position_size, buy_order.position_size);
            
            trader_volume[order.trader_type] += quantity; 
            total_trade_volume += quantity;
            total_price_volume += trade_price * quantity;

            // Update positions
            auto buyer_it = trader_map.find(buy_order.trader_id);
            auto seller_it = trader_map.find(remaining_order.trader_id);
            
            if (buyer_it != trader_map.end()) {
                buyer_it->second->update_position("BUY", trade_price, quantity);
            }
            if (seller_it != trader_map.end()) {
                seller_it->second->update_position("SELL", trade_price, quantity);
            }
            
            // Log trade
            Trade trade = {trade_price, quantity, buy_order.trader_id, remaining_order.trader_id, timestep, buy_order.trader_type, remaining_order.trader_type};
            log_trade(trade);
            trade_history.push_back(trade);
            
            market_price = trade_price;
            
            buy_order.position_size -= quantity;
            remaining_order.position_size -= quantity;
            
            buy_it->second.pop();
            if (buy_it->second.empty()) buys.erase(buy_it);
            if (buy_order.position_size > 0) {
                buys[buy_order.price].push(buy_order);
            }
        }
        
        if (remaining_order.position_size > 0) {
            sells[remaining_order.price].push(remaining_order);
        }
    }
}

MarketTick Market::process_orders() {
    double total_price_volume = 0.0, total_volume = 0.0;
    double last_trade_price = market_price;

    while (!buys.empty() && !sells.empty() && buys.begin()->first >= sells.begin()->first) {
        auto buy_it = buys.begin();
        auto sell_it = sells.begin();

        Order buy = buy_it->second.front();
        Order sell = sell_it->second.front();

        // Prevent self-trading
        if (buy.trader_id == sell.trader_id) {
            buy_it->second.pop(); 
            if (buy_it->second.empty()) buys.erase(buy_it);
            sell_it->second.pop(); 
            if (sell_it->second.empty()) sells.erase(sell_it);
            continue;
        }

        // Expire old orders
        if (timestep - buy.timestep > max_order_age || timestep - sell.timestep > max_order_age) {
            buy_it->second.pop(); 
            if (buy_it->second.empty()) buys.erase(buy_it);
            sell_it->second.pop(); 
            if (sell_it->second.empty()) sells.erase(sell_it);
            continue;
        }
        
        // if (buy.trader_type == "MarketMaker" or sell.trader_type == "MarketMaker") std::cout << "MarketMaker" << std::endl;

        // Price-time priority
        double order_price;
        if (buy.timestep < sell.timestep) order_price = buy.price;
        else order_price = sell.price;

        double quantity = std::min(buy.position_size, sell.position_size);
        
        total_price_volume += order_price * quantity;
        total_volume += quantity;
        last_trade_price = order_price;

        auto buyer_it = trader_map.find(buy.trader_id);
        auto seller_it = trader_map.find(sell.trader_id);

        if (buyer_it != trader_map.end()) {
            buyer_it->second->update_position("BUY", order_price, quantity);
        }
        if (seller_it != trader_map.end()) {
            seller_it->second->update_position("SELL", order_price, quantity);
        }

        log_trade({order_price, quantity, buy.trader_id, sell.trader_id, timestep, buy.trader_type, sell.trader_type});
        trade_history.push_back({order_price, quantity, buy.trader_id, sell.trader_id, timestep, buy.trader_type, sell.trader_type});

        // Update remaining quantities
        buy.position_size -= quantity;
        sell.position_size -= quantity;

        // Remove the matched orders
        buy_it->second.pop(); 
        if (buy_it->second.empty()) buys.erase(buy_it);
        sell_it->second.pop(); 
        if (sell_it->second.empty()) sells.erase(sell_it);

        // Re-add partially filled orders
        if (buy.position_size > 0) buys[buy.price].push(buy);
        if (sell.position_size > 0) sells[sell.price].push(sell);
    }

    double tick_vwap = total_volume > 0.0 ? total_price_volume / total_volume : last_trade_price;
    double best_bid = get_best_bid();
    double best_ask = get_best_ask();
    double mid_price = (best_bid + best_ask) / 2.0;

    if (total_volume > 0.0) {
        market_price = mid_price;
    }

    return {last_trade_price, total_volume, tick_vwap, mid_price, timestep};
}

void Market::evolve_traders() {
    if (timestep % evolution_ticks != 0) return;

    std::vector<std::shared_ptr<Trader>> sorted = traders;
    std::sort(sorted.begin(), sorted.end(), [this](auto& a, auto& b) {
        return a->get_value(market_price) > b->get_value(market_price);
    });

    int kill_count = std::round(sorted.size() * kill_percentage);
    std::vector<int> to_kill;
    int killed = 0;

    // --- Ensure one of each trader type survives ---
    std::unordered_map<std::string, int> survivor_ids;
    for (const auto& trader : sorted) {
        std::string type = trader->get_type();
        if ((type == "Monkey" || type == "MeanReverter" || type == "MomentumTrader") && survivor_ids.count(type) == 0) {
            survivor_ids[type] = trader->get_id();
            if (survivor_ids.size() == 3) break;
        }
    }

    for (int i = sorted.size() - 1; i >= 0 && killed < kill_count; --i) {
        int id = sorted[i]->get_id();
        std::string type = sorted[i]->get_type();
        if (survivor_ids.count(type) && survivor_ids[type] == id) continue; // skip the required survivors

        to_kill.push_back(id);
        ++killed;
    }

    auto top = sorted.front();  // clone the best-performing trader

    for (int id : to_kill) {
        std::shared_ptr<Trader> new_trader;
        if (top->get_type() == "Monkey") {
            auto mk = std::dynamic_pointer_cast<MonkeyTrader>(top);
            new_trader = std::make_shared<MonkeyTrader>(id, mk->get_noise_weight(), mk->get_sizer());
        } else if (top->get_type() == "MeanReverter") {
            auto mr = std::dynamic_pointer_cast<MeanReverter>(top);
            new_trader = std::make_shared<MeanReverter>(id, mr->get_short_window(), mr->get_long_window(), mr->get_sizer());
        } else if (top->get_type() == "MomentumTrader") {
            auto mom = std::dynamic_pointer_cast<MomentumTrader>(top);
            new_trader = std::make_shared<MomentumTrader>(id, mom->get_short_window(), mom->get_long_window(), mom->get_sizer());
        }

        if (new_trader) {
            trader_map[id] = new_trader;
            for (auto& trader : traders) {
                if (trader->get_id() == id) {
                    trader = new_trader;
                    break;
                }
            }
        }
    }

    update_trader_counts();
}



void Market::truncate_tick_history() {
    const int max_ticks = 10000;
    if (tick_history.size() > max_ticks) {
        tick_history.erase(tick_history.begin(), tick_history.begin() + (tick_history.size() - max_ticks));
    }

    if (timestep % 1000 == 0) {
        trade_history.clear();
        trade_history.shrink_to_fit();
    }
}

void Market::print_trader_positions() {
    std::vector<std::shared_ptr<Trader>> sorted = traders;
    std::sort(sorted.begin(), sorted.end(), [this](auto& a, auto& b) {
        return a->get_value(market_price) > b->get_value(market_price);
    });

    for (const auto& trader : sorted) {
        std::cout << trader->get_type() << " " << trader->get_id() << " :: "
                  << trader->get_value(market_price) << " - "
                  << trader->get_sizer()->get_method() << "\n";
    }
}

void Market::print_trader_counts() {
    std::unordered_map<std::string, int> counts;
    for (const auto& t : traders) counts[t->get_type()]++;

    std::cout << "Trader counts:\n";
    for (const auto& [type, count] : counts) {
        std::cout << type << ": " << count << "\n";
    }
}

void Market::update_trader_counts() {
    TraderCount counts = {timestep, 0, 0, 0, 0};
    for (const auto& t : traders) {
        if (t->get_type() == "Monkey") counts.monkeys++;
        else if (t->get_type() == "MarketMaker") counts.marketmakers++;
        else if (t->get_type() == "MomentumTrader") counts.momentumtraders++;
        else if (t->get_type() == "MeanReverter") counts.meanreverters++;
    }
    std::ofstream out("../results/trader_counts.csv", std::ios::app);
    out << timestep << "," << counts.monkeys << "," << counts.meanreverters << "," << counts.momentumtraders << "\n";
    
}

void Market::log_trade(const Trade& t) {
    static std::ofstream log_file("../results/trades.csv", std::ios::app);
    log_file << t.price << "," << t.quantity << "," << t.buyer_id << ","
             << t.seller_id << "," << t.timestep << ","
             << t.buyer_type << "," << t.seller_type << "\n";
}

double Market::get_best_bid() const {
    return buys.empty() ? 0.0 : buys.begin()->first;
}

double Market::get_best_ask() const {
    return sells.empty() ? std::numeric_limits<double>::max() : sells.begin()->first;
}

void Market::write_tick(double market_price) {
    std::ofstream out("../results/price.csv", std::ios::app);

    out << timestep << "," << market_price;

    for (const std::string& type : {"MeanReverter", "MomentumTrader", "Monkey"}) {
        out << "," << trader_volume[type]; 
    }

    out << "\n";
}
void Market::clear_market_maker_orders() {
    // Remove all orders from market makers
    auto remove_mm_orders = [](std::map<double, std::queue<Order>, std::greater<double>>& orders) {
        for (auto it = orders.begin(); it != orders.end();) {
            std::queue<Order> filtered;
            while (!it->second.empty()) {
                Order order = it->second.front();
                it->second.pop();
                if (order.trader_type != "MarketMaker") {
                    filtered.push(order);
                }
            }
            if (filtered.empty()) {
                it = orders.erase(it);
            } else {
                it->second = filtered;
                ++it;
            }
        }
    };
    
    remove_mm_orders(buys);
    
    // Same for sells (without std::greater)
    for (auto it = sells.begin(); it != sells.end();) {
        std::queue<Order> filtered;
        while (!it->second.empty()) {
            Order order = it->second.front();
            it->second.pop();
            if (order.trader_type != "MarketMaker") {
                filtered.push(order);
            }
        }
        if (filtered.empty()) {
            it = sells.erase(it);
        } else {
            it->second = filtered;
            ++it;
        }
    }
}

void Market::debug_order_book() {
    std::cout << "\n=== ORDER BOOK DEBUG ===\n";
    std::cout << "Market Price: " << market_price << "\n";
    std::cout << "BUYS (bids):\n";
    for (const auto& [price, orders] : buys) {
        std::cout << "  $" << price << ": " << orders.size() << " orders\n";
    }
    std::cout << "SELLS (asks):\n";
    for (const auto& [price, orders] : sells) {
        std::cout << "  $" << price << ": " << orders.size() << " orders\n";
    }
    std::cout << "========================\n\n";
}