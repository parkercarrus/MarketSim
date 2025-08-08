from sim.trader import Trader
from sim.orderbook import OrderBook, Order
import numpy as np

class Market:
    def __init__(self, config):
        self.config = config
        self.traders = [Trader(cfg) for cfg in config.traders]
        self.time_step = 0
        self.orderbook = OrderBook()
        self.price_history = [config.initial_price]
        self.volume_history = [0]
        self.volatility_history = [0.0]
        self.transactions = []
        self.orderbook_snapshots = []

        self.market_maker = Trader(config.market_maker_config)
        self.market_maker.id = "MM"

        self.trader_index = {t.id: t for t in self.traders}
        self.trader_index[self.market_maker.id] = self.market_maker

        for t in self.traders + [self.market_maker]:
            start_px = self.price_history[0]
            t.starting_equity = t.calculate_net_worth({"asset": start_px})
            t.pnl = 0.0
            t.trades_won = 0
            t.trades_lost = 0
            t.win_rate = None
            t.avg_entry_price = None
            t.peak_equity = t.starting_equity
            t.max_drawdown_value = 0.0
            t.max_drawdown_pct = 0.0

    def step(self):
        self.time_step += 1
        market_price = self.price_history[-1]

        all_orders = []
        for trader in self.traders:
            if getattr(trader, "is_user", False):
                continue
            obs = self._generate_observation(trader, market_price)
            action = trader.act(obs)
            if action["type"] != "hold":
                all_orders.append(
                    Order(trader.id, action["type"], action["price"], action["quantity"], self.time_step)
                )

        mm_bid = Order(self.market_maker.id, "buy",  market_price * 0.99, 3, self.time_step)
        mm_ask = Order(self.market_maker.id, "sell", market_price * 1.01, 3, self.time_step)
        all_orders.extend([mm_bid, mm_ask])

        for o in all_orders:
            self.orderbook.add_order(o)
        trades = self.orderbook.match_orders()

        self._settle_trades(trades)
        prices = [float(t["price"]) for t in trades]
        avg_price = np.mean(prices) if prices else market_price
        self.price_history.append(avg_price)
        self.volume_history.append(sum(int(t["quantity"]) for t in trades))
        vol = np.std(self.price_history[-10:]) if len(self.price_history) >= 10 else 0.0
        self.volatility_history.append(vol)
        self.orderbook_snapshots.append(self.orderbook.snapshot())

        for t in self.traders + [self.market_maker]:
            equity = t.calculate_net_worth({"asset": avg_price})
            t.pnl = equity - t.starting_equity
            total_closed = t.trades_won + t.trades_lost
            t.win_rate = t.trades_won / total_closed if total_closed > 0 else None
            if equity > t.peak_equity:
                t.peak_equity = equity
            dd_value = t.peak_equity - equity
            if dd_value > t.max_drawdown_value:
                t.max_drawdown_value = dd_value
                t.max_drawdown_pct = (dd_value / t.peak_equity) if t.peak_equity > 0 else 0.0

        return {
            "time_step": self.time_step,
            "price": avg_price,
            "volume": self.volume_history[-1],
            "volatility": vol,
            "trades": trades,
            "orderbook_snapshot": self.orderbook.snapshot(),
            "traders": {
                t.id: {
                    "pnl": t.pnl,
                    "balance": t.balance,
                    "assets": t.assets,
                    "win_rate": t.win_rate,
                    "max_drawdown_value": t.max_drawdown_value,
                    "max_drawdown_pct": t.max_drawdown_pct,
                } for t in self.traders
            },
        }
    
    def _update_position(self, trader, side: str, px: float, qty: int):
        """
        Simple signed position & avg_entry_price maintenance:
        - Same-sign adds use weighted-average price with denom = abs(pos) + qty (never 0).
        - Crossing through flat resets avg_entry_price to None (if fully closed),
        then sets to px when opening the opposite side.
        """
        if qty <= 0:
            return

        pos = int(trader.assets)
        aep = trader.avg_entry_price  # may be None

        if side == "buy":
            # 1) Cover short first
            if pos < 0:
                cover = min(qty, -pos)
                pos += cover
                qty -= cover
                if pos == 0 and cover > 0 and qty == 0:
                    # fully flat after covering
                    trader.avg_entry_price = None

            # 2) Open/increase long with any remaining qty
            if qty > 0:
                if pos > 0 and aep is not None:
                    denom = abs(pos) + qty            # safe, > 0
                    trader.avg_entry_price = (aep * abs(pos) + px * qty) / denom
                else:
                    trader.avg_entry_price = px       # opening a new long
                pos += qty

        else:  # side == "sell"
            # 1) Close long first
            if pos > 0:
                close = min(qty, pos)
                pos -= close
                qty -= close
                if pos == 0 and close > 0 and qty == 0:
                    trader.avg_entry_price = None     # flat after closing long

            # 2) Open/increase short with remaining qty
            if qty > 0:
                if pos < 0 and aep is not None:
                    denom = abs(pos) + qty            # safe, > 0
                    trader.avg_entry_price = (aep * abs(pos) + px * qty) / denom
                else:
                    trader.avg_entry_price = px       # opening a new short
                pos -= qty

        trader.assets = float(pos)


    def _settle_trades(self, trades):
        self.transactions = []
        for tr in trades:
            buyer  = self.trader_index.get(tr["buyer"])
            seller = self.trader_index.get(tr["seller"])
            if not buyer or not seller:
                continue

            qty = int(tr["quantity"])
            px = float(tr["price"])
            notional = qty * px

            if qty <= 0 or buyer.balance < notional:
                continue
            if seller.assets - qty < -getattr(seller, "max_short_units", 50):
                continue

            prev_assets = buyer.assets
            prev_cost = buyer.avg_entry_price if buyer.avg_entry_price is not None else 0.0
            total_cost = prev_cost * prev_assets + px * qty
            buyer.avg_entry_price = total_cost / (prev_assets + qty) if (prev_assets + qty) > 0 else None

            buyer.balance -= notional
            self._update_position(buyer, "buy", px, qty)

            seller.balance += notional
            self._update_position(seller, "sell", px, qty)

            if seller.avg_entry_price is not None:
                if px > seller.avg_entry_price:
                    seller.trades_won += 1
                elif px < seller.avg_entry_price:
                    seller.trades_lost += 1

            seller.balance += notional
            seller.assets  -= qty

            if seller.assets == 0:
                seller.avg_entry_price = None

            self.transactions.append({
                "trader_id": buyer.id, "type": "buy", "quantity": qty,
                "price": px, "time_step": self.time_step
            })
            self.transactions.append({
                "trader_id": seller.id, "type": "sell", "quantity": qty,
                "price": px, "time_step": self.time_step
            })

    def _generate_observation(self, trader, market_price):
        return {
            "market_price": market_price,
            "market_quantity": self.volume_history[-1],
            "own_balance": trader.balance,
            "own_assets": trader.assets,
            "time_step": self.time_step,
            "price_history": self.price_history[-5:],
        }
