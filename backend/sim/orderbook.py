import heapq
from collections import deque

class Order:
    def __init__(self, trader_id, order_type, price, quantity, time_step):
        self.trader_id = trader_id
        self.type = order_type
        self.price = price
        self.quantity = quantity
        self.time_step = time_step

    def __lt__(self, other):
        if self.price == other.price:
            return self.time_step < other.time_step
        if self.type == 'buy':
            return self.price > other.price
        return self.price < other.price

class OrderBook:
    def __init__(self):
        self.buy_orders = []
        self.sell_orders = []

    def add_order(self, order):
        if order.type == 'buy':
            heapq.heappush(self.buy_orders, (-order.price, order))
        elif order.type == 'sell':
            heapq.heappush(self.sell_orders, (order.price, order))

    def snapshot(self):
        return {
            "bids": [
                {"price": order.price, "quantity": order.quantity}
                for _, order in self.buy_orders
            ],
            "asks": [
                {"price": order.price, "quantity": order.quantity}
                for _, order in self.sell_orders
            ],
        }

    def match_orders(self):
        trades = []
        while self.buy_orders and self.sell_orders:
            top_buy = self.buy_orders[0][1]
            top_sell = self.sell_orders[0][1]
            if top_buy.price >= top_sell.price:
                trade_price = (top_buy.price + top_sell.price) / 2
                trade_quantity = min(top_buy.quantity, top_sell.quantity)

                trades.append({
                    'buyer': top_buy.trader_id,
                    'seller': top_sell.trader_id,
                    'price': trade_price,
                    'quantity': trade_quantity,
                    'time_step': max(top_buy.time_step, top_sell.time_step)
                })

                top_buy.quantity -= trade_quantity
                top_sell.quantity -= trade_quantity

                if top_buy.quantity == 0:
                    heapq.heappop(self.buy_orders)
                if top_sell.quantity == 0:
                    heapq.heappop(self.sell_orders)
            else:
                break

        return trades
