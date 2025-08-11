from collections import deque
import numpy as np
import random
from .base import Trader as BaseTrader  # Import the base class

def huber_loss_grad(error, delta=1.0):
    return np.clip(error, -delta, delta)

class Trader(BaseTrader):  # Inherit from base.py's Trader
    def __init__(self, config):
        super().__init__(config)  # sets self.random_state in BaseTrader

        # seed RNGs by random_state
        random_state = getattr(config, "random_state")
        self.np_rng = np.random.default_rng(random_state)
        self.py_rng = random.Random(random_state)

        # --- RL-specific hyperparams and setup ---
        self.performance_history = []

        # Shorting
        self.shorting_enabled = getattr(config, "shorting_enabled", True)

        # Cost basis for current signed position (None if flat)
        self.avg_entry_price = None
        self.max_short_units = getattr(config, "max_short_units", 50)

        self.trades_won  = 0
        self.trades_lost = 0

        # --- RL hyperparams ---
        self.risk_aversion     = config.risk_aversion
        self.learning_rate     = config.learning_rate
        self.discount_factor   = config.gamma
        self.exploration_rate  = config.epsilon
        self.exploration_decay = getattr(config, "epsilon_decay", 0.995)
        self.min_exploration   = getattr(config, "epsilon_min", 0.01)

        # --- Model / training setup ---
        self.state_size  = getattr(config, "state_size", 8)
        self.qty_bins    = getattr(config, "qty_bins", [1, 2, 5])
        self.pct_bins    = getattr(config, "pct_bins", [0.002, 0.005, 0.01])
        self.action_map  = self._build_action_map()
        self.action_size = len(self.action_map)

        self.hidden_size = getattr(config, "hidden_size", 64)
        self.huber_delta = getattr(config, "huber_delta", 1.0)
        self.batch_size  = getattr(config, "batch_size", 64)
        self.tau         = getattr(config, "tau", 0.01)

        self.memory = deque(maxlen=getattr(config, "replay_size", 20000))

        # Use seeded RNG for weight init
        self.model        = self._build_dueling_net(self.state_size, self.hidden_size, self.action_size)
        self.target_model = self._build_dueling_net(self.state_size, self.hidden_size, self.action_size)
        self._hard_update_target()

        self.last_action = {'type': 'hold', 'quantity': 0, 'price': None}
        self.last_state  = None

        self.type = "rl"

    # -----------------------------
    # Network (dueling head) utils
    # -----------------------------
    def _build_dueling_net(self, in_dim, hid, out_dim):
        rng = self.np_rng  # seeded
        return {
            'W1': rng.standard_normal((in_dim, hid)) / np.sqrt(in_dim),
            'b1': np.zeros(hid),
            'Wv': rng.standard_normal((hid, 1)) / np.sqrt(hid),
            'bv': np.zeros(1),
            'Wa': rng.standard_normal((hid, out_dim)) / np.sqrt(hid),
            'ba': np.zeros(out_dim),
        }

    # --- margin helpers used by Market ---
    def equity(self, mid_px: float) -> float:
        return float(self.balance + self.assets * mid_px)

    def margin_ratio(self, mid_px: float) -> float:
        notional = abs(self.assets) * mid_px
        if notional == 0:
            return float("inf")
        return self.equity(mid_px) / notional

    def _hard_update_target(self):
        for k in self.model:
            self.target_model[k] = np.copy(self.model[k])

    def _soft_update_target(self):
        for k in self.model:
            self.target_model[k] = (1 - self.tau) * self.target_model[k] + self.tau * self.model[k]

    def _forward(self, net, state):
        z1 = state @ net['W1'] + net['b1']
        h  = np.maximum(0.0, z1)
        V  = h @ net['Wv'] + net['bv']
        A  = h @ net['Wa'] + net['ba']
        A_mean = np.mean(A)
        Q  = V + (A - A_mean)
        cache = (state, z1, h, V, A, A_mean)
        return Q, cache

    def _backward(self, net, cache, dQ, action_idx, lr):
        state, z1, h, V, A, A_mean = cache
        A_dim = A.shape[0]

        dL_dQ = dQ
        dA = np.zeros_like(A)
        dA[action_idx] += dL_dQ * (1 - 1.0/A_dim)
        dA -= (dL_dQ * (1.0/A_dim))
        dV = dL_dQ * 1.0

        dWv = np.outer(h, np.array([dV]))
        dbv = np.array([dV])
        dWa = np.outer(h, dA)
        dba = dA

        dh  = (net['Wv'] @ np.array([dV])).ravel() + (net['Wa'] @ dA).ravel()
        dz1 = dh * (z1 > 0)

        dW1 = np.outer(state, dz1)
        db1 = dz1

        net['W1'] -= lr * dW1
        net['b1'] -= lr * db1
        net['Wv'] -= lr * dWv
        net['bv'] -= lr * dbv
        net['Wa'] -= lr * dWa
        net['ba'] -= lr * dba

    # -----------------------------
    # State & action processing
    # -----------------------------
    def _normalize(self, x, scale):
        return (x / scale) if scale != 0 else 0.0

    def _observation_to_state(self, obs):
        if obs is None:
            return np.zeros(self.state_size, dtype=float)

        price_hist = obs.get('price_history', [])
        p_now = float(obs['market_price'])

        if len(price_hist) >= 2:
            p0 = float(price_hist[0])
            trend = (p_now - p0) / p0 if p0 != 0 else 0.0
            returns = np.diff(price_hist) / np.maximum(1e-9, price_hist[:-1])
            mom3 = np.mean(returns[-3:]) if len(returns) >= 3 else np.mean(returns)
            vol5 = np.std(price_hist[-5:]) / (p_now + 1e-9) if len(price_hist) >= 5 else 0.0
        else:
            trend, mom3, vol5 = 0.0, 0.0, 0.0

        s = np.array([
            self._normalize(p_now, 200.0),
            self._normalize(obs['market_quantity'], 2000.0),
            self._normalize(obs['own_balance'], 5000.0),
            self._normalize(obs['own_assets'], 50.0),
            self._normalize(obs['time_step'], 1000.0),
            trend, mom3, vol5
        ], dtype=float)

        if len(s) < self.state_size:
            s = np.pad(s, (0, self.state_size - len(s)))
        elif len(s) > self.state_size:
            s = s[:self.state_size]
        return s

    def _build_action_map(self):
        action_map = [('hold', 0, 0.0)]
        for side in ('buy', 'sell'):
            sign = 1.0 if side == 'buy' else -1.0
            for q in self.qty_bins:
                for pct in self.pct_bins:
                    action_map.append((side, q, sign * pct))
        return action_map

    def _index_to_action(self, idx, obs):
        side, qty, pct = self.action_map[idx]
        market_price = float(obs['market_price'])

        if side == 'hold':
            return {'type': 'hold', 'quantity': 0, 'price': market_price}

        if side == 'buy':
            max_affordable = int(obs['own_balance'] // market_price)
            size = int(max(1, min(qty, max_affordable) * (1 - 0.7*self.risk_aversion)))
            price = round(market_price * (1 + abs(pct)), 2)
            return {'type': 'buy', 'quantity': size, 'price': price}
        else:
            price = round(market_price * (1 - abs(pct)), 2)
            inv = max(0, int(obs['own_assets']))
            curr_short = max(0, -int(obs['own_assets']))
            short_room = max(0, self.max_short_units - curr_short)

            max_sellable = inv + short_room
            if max_sellable <= 0:
                return {'type': 'hold', 'quantity': 0, 'price': market_price}

            base = min(qty, max_sellable)
            size = int(max(1, base * (0.3 + 0.7 * self.risk_aversion)))
            return {'type': 'sell', 'quantity': size, 'price': price}

    # -----------------------------
    # Policy & training
    # -----------------------------
    def act(self, obs):
        state = self._observation_to_state(obs)
        self.last_state = state

        # ε-greedy using seeded RNGs
        if self.np_rng.random() < self.exploration_rate:
            action_idx = self.py_rng.randrange(self.action_size)
        else:
            q, _ = self._forward(self.model, state)
            action_idx = int(np.argmax(q))

        action = self._index_to_action(action_idx, obs)
        self.last_action = action
        action['action_idx'] = action_idx
        return action

    def train(self, state, action_idx, reward, next_state, done):
        self.memory.append((state, action_idx, reward, next_state, done))
        self.exploration_rate = max(self.min_exploration, self.exploration_rate * self.exploration_decay)

        if len(self.memory) < self.batch_size:
            return

        # Replay sampling with seeded Python RNG
        batch = self.py_rng.sample(self.memory, self.batch_size)

        states      = np.array([b[0] for b in batch], dtype=float)
        actions     = np.array([b[1] for b in batch], dtype=int)
        rewards     = np.array([b[2] for b in batch], dtype=float)
        next_states = np.array([b[3] for b in batch], dtype=float)
        dones       = np.array([b[4] for b in batch], dtype=bool)

        q_next_online = np.array([self._forward(self.model, s)[0] for s in next_states])
        a_next = np.argmax(q_next_online, axis=1)

        q_next_target = np.array([self._forward(self.target_model, s)[0] for s in next_states])
        target_q = rewards + (~dones) * (self.discount_factor * q_next_target[np.arange(self.batch_size), a_next])

        for i in range(self.batch_size):
            s = states[i]
            a = actions[i]
            y = target_q[i]
            q_pred, cache = self._forward(self.model, s)
            q_a = q_pred[a]
            error = q_a - y
            grad = huber_loss_grad(error, delta=self.huber_delta)
            self._backward(self.model, cache, grad, a, self.learning_rate)

        self._soft_update_target()

    # -----------------------------
    # Accounting helpers
    # -----------------------------
    def calculate_net_worth(self, prices):
        return float(self.balance + self.assets * prices['asset'])

    def reset(self):
        super().reset()
        self.performance_history = []
        self.exploration_rate = max(self.exploration_rate, self.min_exploration)
