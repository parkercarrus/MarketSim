import heapq
from collections import defaultdict
from typing import List, Dict, Any, Tuple, Optional

class Order:
    __slots__ = ("trader_id", "type", "price", "quantity", "time_step")
    def __init__(self, trader_id: str, order_type: str, price: float, quantity: int, time_step: int):
        self.trader_id = trader_id
        self.type = order_type 
        self.price = float(price)
        self.quantity = int(quantity)
        self.time_step = int(time_step)

class OrderBook:
    """
    Price-time priority using two heaps:
      - buys:  (-price, time, seq, order)
      - sells: ( price, time, seq, order)
    """
    __slots__ = ("buy_orders", "sell_orders", "_seq")

    def __init__(self):
        self.buy_orders: List[Tuple[float, int, int, Order]] = []
        self.sell_orders: List[Tuple[float, int, int, Order]] = []
        self._seq = 0  # tie-breaker to keep heap comparisons cheap

    def _next_seq(self) -> int:
        s = self._seq + 1
        self._seq = s
        return s

    def add_order(self, order: Order) -> None:
        # bind once
        heappush = heapq.heappush
        seq = self._next_seq()
        if order.type == "buy":
            # Higher price first -> store as negative
            heappush(self.buy_orders, (-order.price, order.time_step, seq, order))
        else:  # "sell"
            heappush(self.sell_orders, ( order.price, order.time_step, seq, order))

    def snapshot(self, top_levels: Optional[int] = 10, aggregate: bool = True) -> Dict[str, Any]:
        def agg_side(heap, is_buy: bool) -> List[Dict[str, Any]]:
            out = defaultdict(int)
            for key in heap:
                order = key[3]
                if order.quantity > 0:
                    out[order.price] += order.quantity

            # Sort by price: bids desc, asks asc
            items = sorted(out.items(), key=lambda x: x[0], reverse=is_buy)
            if top_levels is not None:
                items = items[:top_levels]
            return [{"price": p, "quantity": q} for p, q in items]

        if aggregate:
            bids = agg_side(self.buy_orders, is_buy=True)
            asks = agg_side(self.sell_orders, is_buy=False)
        else:
            bids = [{"price": k[3].price, "quantity": k[3].quantity} for k in self.buy_orders if k[3].quantity > 0]
            asks = [{"price": k[3].price, "quantity": k[3].quantity} for k in self.sell_orders if k[3].quantity > 0]
            bids.sort(key=lambda x: x["price"], reverse=True)
            asks.sort(key=lambda x: x["price"])
            if top_levels is not None:
                bids = bids[:top_levels]
                asks = asks[:top_levels]

        return {"bids": bids, "asks": asks}

    def match_orders(self) -> List[Dict[str, Any]]:
        trades: List[Dict[str, Any]] = []

        # local binds
        buys, sells = self.buy_orders, self.sell_orders
        heappop = heapq.heappop

        while buys and sells:
            best_buy = buys[0][3]  
            best_sell = sells[0][3]

            if best_buy.price >= best_sell.price:
                trade_price = (best_buy.price + best_sell.price) * 0.5
                trade_qty = best_buy.quantity if best_buy.quantity < best_sell.quantity else best_sell.quantity

                trade_time = best_buy.time_step if best_buy.time_step >= best_sell.time_step else best_sell.time_step

                trades.append({
                    "buyer": best_buy.trader_id,
                    "seller": best_sell.trader_id,
                    "price": trade_price,
                    "quantity": trade_qty,
                    "time_step": trade_time,
                })

                # Decrement quantities
                best_buy.quantity  -= trade_qty
                best_sell.quantity -= trade_qty

                # Remove exhausted orders
                if best_buy.quantity == 0:
                    heappop(buys)
                if best_sell.quantity == 0:
                    heappop(sells)
            else:
                break

        return trades
