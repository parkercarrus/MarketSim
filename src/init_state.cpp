#include "headers/init/init_state.hpp"
#include <fstream>
#include <nlohmann/json.hpp>

InitialMarketState load_initial_state(const std::string& path) {
    std::ifstream file(path);
    nlohmann::json j;
    file >> j;

    InitialMarketState state;
    state.initial_price = j["initial_price"];
    state.evolve = j["evolve"];
    state.evolution_ticks = j["evolution_ticks"];
    state.kill_percentage = j["kill_percentage"];
    state.write_every = j["write_every"];
    state.max_order_age = j["max_order_age"];

    state.monkeys.num_monkeys = j["monkeys"]["num_monkeys"];
    state.monkeys.noise_weight = j["monkeys"]["noise_weight"];

    state.mreverters.num_mreverters = j["mean_reverters"]["num_mreverters"];
    state.mreverters.min_short = j["mean_reverters"]["min_short"];
    state.mreverters.max_short = j["mean_reverters"]["max_short"];
    state.mreverters.min_long  = j["mean_reverters"]["min_long"];
    state.mreverters.max_long  = j["mean_reverters"]["max_long"];

    state.momtraders.num_momtraders = j["momentum_traders"]["num_momtraders"];
    state.momtraders.min_short = j["momentum_traders"]["min_short"];
    state.momtraders.max_short = j["momentum_traders"]["max_short"];
    state.momtraders.min_long  = j["momentum_traders"]["min_long"];
    state.momtraders.max_long  = j["momentum_traders"]["max_long"];

    state.mmakers.num_mmakers = j["market_makers"]["num_mmakers"];
    state.mmakers.fundamental_price = j["market_makers"]["fundamental_price"];
    state.mmakers.spread = j["market_makers"]["spread"];

    std::ofstream price_out("../results/price.csv", std::ios::trunc);
    price_out << "timestep,price,mean_reverter_volume,momentum_trader_volume,monkey_volume" << "\n";

    std::ofstream counts_out("../results/trader_counts.csv", std::ios::trunc);
    counts_out << "timestep,monkeys,meanreverters,momentumtraders" << "\n";

    return state;
}
