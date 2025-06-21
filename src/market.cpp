// market.cpp

#include "headers/market.hpp"
#include "system/initTraders.hpp"
#include "headers/utils.hpp"
#include <nlohmann/json.hpp>
#include <fstream>
#include <cassert>
#include <random>
#include <algorithm>
#include <execution>
#include <mutex>
#include <thread>
#include <future>

using json = nlohmann::json;

InitialMarketState load_initial_state(const std::string& path) {
    std::ifstream file(path);
    if (!file.is_open()) {
        throw std::runtime_error("Failed to open initialState.json");
    }
    json j;
    file >> j;

    std::random_device rd;
    std::mt19937 gen(rd());
    std::uniform_real_distribution<> dist(0.0, 1.0);

    InitialMarketState state;
    state.initial_price = j["initial_price"];
    state.evolution_ticks = j["evolution_ticks"];
    state.kill_percentage = j["kill_percentage"];

    state.monkeys.num_monkeys = j["monkeys"]["num_monkeys"];
    state.monkeys.noise_weight = j["monkeys"]["noise_weight"];

    state.mmakers.num_mmakers = j["mmakers"]["num_mmakers"];
    state.mmakers.fundamental_price = j["mmakers"]["fundamental_price"];
    state.mmakers.spread = j["mmakers"]["spread"];

    state.mreverters.num_mreverers = j["mreverters"]["num_mreverers"];
    state.mreverters.short_ma_window = j["mreverters"]["short_ma_window"];
    state.mreverters.long_ma_window = j["mreverters"]["long_ma_window"];

    bool random_sizers_mr = j["mreverters"].contains("random_sizers") && j["mreverters"]["random_sizers"];
    if (random_sizers_mr) {
        for (int i = 0; i < state.mreverters.num_mreverers; ++i) {
            if (dist(gen) > 0.5) {
                double risk_free = dist(gen) * 0.05;
                double confidence = 0.5 + dist(gen) * 1.5;
                state.mreverters.sizers.push_back(std::make_shared<Kelly>(risk_free, confidence));
            } else {
                double min = dist(gen) * 0.05;
                double max = 0.5 + dist(gen) * 0.5;
                state.mreverters.sizers.push_back(std::make_shared<Fractional>(min, max));
            }
        }
    } else {
        for (const auto& sizer : j["mreverters"]["sizers"]) {
            if (sizer["type"] == "kelly") {
                state.mreverters.sizers.push_back(std::make_shared<Kelly>(sizer["risk_free"], sizer["confidence"]));
            } else {
                state.mreverters.sizers.push_back(std::make_shared<Fractional>(sizer["min"], sizer["max"]));
            }
        }

    }


    state.momtraders.num_momtraders = j["momtraders"]["num_momtraders"];
    state.momtraders.short_ma_window = j["momtraders"]["short_ma_window"];
    state.momtraders.long_ma_window = j["momtraders"]["long_ma_window"];

    bool random_sizers_mom = j["momtraders"].contains("random_sizers") && j["momtraders"]["random_sizers"];
    if (random_sizers_mom) {
        for (int i = 0; i < state.momtraders.num_momtraders; ++i) {
            if (dist(gen) > 0.5) {
                double risk_free = dist(gen) * 0.05;
                double confidence = 0.5 + dist(gen) * 1.5;
                state.momtraders.sizers.push_back(std::make_shared<Kelly>(risk_free, confidence));
            } else {
                double min = dist(gen) * 0.05;
                double max = 0.5 + dist(gen) * 0.5;
                state.momtraders.sizers.push_back(std::make_shared<Fractional>(min, max));
            }
        }
    } else {
        for (const auto& sizer : j["momtraders"]["sizers"]) {
            if (sizer["type"] == "kelly") {
                state.momtraders.sizers.push_back(std::make_shared<Kelly>(sizer["risk_free"], sizer["confidence"]));
            } else {
                state.momtraders.sizers.push_back(std::make_shared<Fractional>(sizer["min"], sizer["max"]));
            }
        }
    }

    return state;
}

Market::Market(const InitialMarketState& state) {
    market_price = state.initial_price;
    TraderInitResult init = init_traders(state.monkeys, state.mmakers, state.mreverters, state.momtraders, gen);
    traders = std::move(init.traders);
    trader_map = std::move(init.trader_map);
    evolution_ticks = std::move(state.evolution_ticks);
    kill_percentage = std::move(state.kill_percentage);
}

void Market::tick() {
    std::vector<Order> local_orders(traders.size());

    std::vector<std::future<void>> futures;
    for (size_t i = 0; i < traders.size(); ++i) {
        futures.push_back(std::async(std::launch::async, [&, i] {
            local_orders[i] = traders[i]->make_order(market_price, tick_history, timestep);
        }));
    }

    for (auto& f : futures) f.get(); 

    for (const auto& order : local_orders) {
        if (order.type == "BUY") buys.push(order);
        else if (order.type == "SELL") sells.push(order);
    }

    MarketTick tick = process_orders();

    tick_history.push_back(tick);
    ++timestep;

    if (timestep % evolution_ticks == 0) {
        std::vector<std::shared_ptr<Trader>> sorted_traders = traders;
        std::sort(sorted_traders.begin(), sorted_traders.end(), [this](const auto& a, const auto& b) {
            return a->get_value(market_price) > b->get_value(market_price);
        });

        int kill_idx = std::round(sorted_traders.size() * 0.1);
        std::vector<int> kill_traders_ids;
        for (int i = sorted_traders.size() - kill_idx; i < sorted_traders.size(); ++i) {
            kill_traders_ids.push_back(sorted_traders[i]->get_id());
        }

        auto top_trader = sorted_traders.front();

        for (int id : kill_traders_ids) {
            std::cout << "Replacing trader of type " << traders[id]->get_type() << " with " << top_trader->get_type() << std::endl;
            std::shared_ptr<Trader> new_trader;
            if (top_trader->get_type() == "MarketMaker") {
                auto mm = std::dynamic_pointer_cast<MarketMaker>(top_trader);
                new_trader = std::make_shared<MarketMaker>(id, mm->get_fundamental_price(), mm->get_spread(), mm->get_sizer());
            } else if (top_trader->get_type() == "Monkey") {
                auto mk = std::dynamic_pointer_cast<MonkeyTrader>(top_trader);
                new_trader = std::make_shared<MonkeyTrader>(id, mk->get_noise_weight(), mk->get_sizer());
            } else if (top_trader->get_type() == "MeanReverter") {
                auto mr = std::dynamic_pointer_cast<MeanReverter>(top_trader);
                new_trader = std::make_shared<MeanReverter>(id, mr->get_short_window(), mr->get_long_window(), mr->get_sizer());
            } else if (top_trader->get_type() == "MomentumTrader") {
                auto mom = std::dynamic_pointer_cast<MomentumTrader>(top_trader);
                new_trader = std::make_shared<MomentumTrader>(id, mom->get_short_window(), mom->get_long_window(), mom->get_sizer());
            }

            if (new_trader) {
                trader_map[id] = new_trader;
                traders[id] = new_trader;
            }
        }
        update_trader_counts();
        std::cout << "Updating trader counts at timestep " << timestep << std::endl;
    }
    if (timestep % 1000 == 0) {
        trade_history.clear();
        trade_history.shrink_to_fit(); 
    }
    const int max_ticks = 10000;
    if (tick_history.size() > max_ticks) {
        tick_history.erase(tick_history.begin(), tick_history.begin() + (tick_history.size() - max_ticks));
    }
}

MarketTick Market::process_orders() {
    double total_price_volume = 0.0;
    double total_volume = 0.0;
    double order_price = 0.0;

    while (!buys.empty() && !sells.empty() &&
           buys.top().price >= sells.top().price) {

        Order buy = buys.top();
        Order sell = sells.top();

        if (buy.trader_id == sell.trader_id) {
            buys.pop();
            sells.pop();
            continue;
        }

        order_price = (buy.price + sell.price) / 2.0;
        double quantity = std::min(buy.position_size, sell.position_size);

        total_price_volume += order_price * quantity;
        total_volume += quantity;

        auto buyer = trader_map[buy.trader_id];
        auto seller = trader_map[sell.trader_id];

        buyer->update_position("BUY", order_price, quantity);
        seller->update_position("SELL", order_price, quantity);

        log_trade({
            order_price,
            quantity,
            buy.trader_id,
            sell.trader_id,
            timestep,
            buy.trader_type,
            sell.trader_type
        });

        buys.pop();
        sells.pop();

        if (buy.position_size > quantity) {
            buy.position_size -= quantity;
            buys.push(buy);
        }

        if (sell.position_size > quantity) {
            sell.position_size -= quantity;
            sells.push(sell);
        }
    }

    double last_price = (total_volume > 0.0) ? order_price : market_price;
    double tick_vwap = (total_volume > 0.0) ? total_price_volume / total_volume : last_price;

    double best_bid = buys.empty() ? last_price : buys.top().price;
    double best_ask = sells.empty() ? last_price : sells.top().price;
    double mid_price = (best_bid + best_ask) / 2.0;

    return MarketTick{
        last_price,
        total_volume,
        tick_vwap,
        mid_price,
        timestep
    };
}

void Market::print_trader_positions() {
    std::vector<std::shared_ptr<Trader>> sorted_traders = traders;
    std::sort(sorted_traders.begin(), sorted_traders.end(), [this](const auto& a, const auto& b) {
        return a->get_value(market_price) > b->get_value(market_price);
    });

    for (const auto& trader : sorted_traders) {
        double trader_value = trader->get_value(market_price);
        std::string trader_type = trader->get_type();
        std::string sizing_method = trader->get_sizer()->get_method();
        int trader_id = trader->get_id();
        std::cout << trader_type << " " << trader_id << " :: " << trader_value << " - " << sizing_method << std::endl; 
    }
}

void Market::print_trader_counts() {
    std::unordered_map<std::string, int> counts;
    for (const auto& trader : traders) {
        counts[trader->get_type()]++;
    }

    std::cout << "Trader type counts:\n";
    for (const auto& [type, count] : counts) {
        std::cout << type << ": " << count << std::endl;
    }
}

void Market::update_trader_counts() {
    TraderCount counts = {timestep, 0, 0, 0, 0};

    for (const auto& trader : traders) {
        std::string type = trader->get_type();
        if (type == "Monkey") counts.monkeys++;
        else if (type == "MarketMaker") counts.marketmakers++;
        else if (type == "MomentumTrader") counts.momentumtraders++;
        else if (type == "MeanReverter") counts.meanreverters++;
    }

    trader_counts.push_back(counts);
}

void Market::log_trade(const Trade& t) {
    static std::ofstream log_file("../results/trades.csv", std::ios::app);
    log_file << t.price << "," << t.quantity << "," << t.buyer_id << "," << t.seller_id << "," << t.timestep << "\n";
}