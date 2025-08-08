from collections import deque
import numpy as np
import random

def huber_loss_grad(error, delta=1.0):
    # returns d/dy Huber(y - target) = clip(error, -delta, delta)
    return np.clip(error, -delta, delta)

class Trader:
    def __init__(self, config):
        # --- IDs / balances ---
        self.id = config.id
        self.is_user = getattr(config, "is_user", False)
        self.initial_balance = config.balance
        self.initial_assets  = config.assets
        self.balance = float(config.balance)
        self.assets  = float(config.assets)
        self.performance_history = []

        # Shorting
        self.shorting_enabled   = getattr(config, "shorting_enabled", True)

        # Cost basis for current signed position (None if flat)
        self.avg_entry_price = None                 # cost basis for current signed position
        self.max_short_units = getattr(config, "max_short_units", 50)  # cap on |short|

        # (Optional) win/loss counters if you want them here instead of Market
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
        self.state_size  = getattr(config, "state_size", 8)   # expanded features
        # Discrete action grid: [hold] + buys/sells with qty {1,2,5} and price offsets {0.2%, 0.5%, 1.0%}
        # Feel free to tweak
        self.qty_bins    = getattr(config, "qty_bins", [1, 2, 5])
        self.pct_bins    = getattr(config, "pct_bins", [0.002, 0.005, 0.01])
        self.action_map  = self._build_action_map()           # list of (type, qty, pct)
        self.action_size = len(self.action_map)

        self.hidden_size = getattr(config, "hidden_size", 64)
        self.huber_delta = getattr(config, "huber_delta", 1.0)
        self.batch_size  = getattr(config, "batch_size", 64)

        # Target network update (soft)
        self.tau         = getattr(config, "tau", 0.01)

        # Replay buffer
        self.memory = deque(maxlen=getattr(config, "replay_size", 20000))

        # Nets: dueling (V and A heads)
        self.model       = self._build_dueling_net(self.state_size, self.hidden_size, self.action_size)
        self.target_model= self._build_dueling_net(self.state_size, self.hidden_size, self.action_size)
        self._hard_update_target()

        # internal
        self.last_action = {'type': 'hold', 'quantity': 0, 'price': None}
        self.last_state  = None

    # -----------------------------
    # Network (dueling head) utils
    # -----------------------------
    def _build_dueling_net(self, in_dim, hid, out_dim):
        rng = np.random.default_rng()
        return {
            # trunk
            'W1': rng.standard_normal((in_dim, hid)) / np.sqrt(in_dim),
            'b1': np.zeros(hid),
            # value head
            'Wv': rng.standard_normal((hid, 1)) / np.sqrt(hid),
            'bv': np.zeros(1),
            # advantage head
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
        # state: (D,)
        z1 = state @ net['W1'] + net['b1']                 # (H,)
        h  = np.maximum(0.0, z1)                           # ReLU
        V  = h @ net['Wv'] + net['bv']                     # (1,)
        A  = h @ net['Wa'] + net['ba']                     # (A,)
        A_mean = np.mean(A)
        Q  = V + (A - A_mean)                              # (A,)
        cache = (state, z1, h, V, A, A_mean)
        return Q, cache

    def _backward(self, net, cache, dQ, action_idx, lr):
        # dQ is gradient dL/dQ ONLY for the chosen action (scalar)
        state, z1, h, V, A, A_mean = cache
        A_dim = A.shape[0]

        # Grad wrt V and A for dueling combine: Q_a = V + A_a - mean(A)
        dL_dQ = dQ  # scalar
        # dA: vector because mean(A) touches all A_j
        dA = np.zeros_like(A)
        dA[action_idx] += dL_dQ * (1 - 1.0/A_dim)
        dA -= (dL_dQ * (1.0/A_dim))  # for all j

        dV = dL_dQ * 1.0  # scalar

        # Backprop heads to h
        dWv = np.outer(h, np.array([dV]))                  # (H,1)
        dbv = np.array([dV])
        dWa = np.outer(h, dA)                               # (H,A)
        dba = dA

        dh  = (net['Wv'] @ np.array([dV])).ravel() + (net['Wa'] @ dA).ravel()  # (H,)

        # ReLU backprop
        dz1 = dh * (z1 > 0)

        dW1 = np.outer(state, dz1)                          # (D,H)
        db1 = dz1

        # SGD update
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
        """Richer features but same inputs required from Market."""
        if obs is None:
            return np.zeros(self.state_size, dtype=float)

        price_hist = obs.get('price_history', [])
        p_now = float(obs['market_price'])
        # trend & momentum
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
            trend,
            mom3,
            vol5
        ], dtype=float)

        # pad/trim to state_size if user changed it
        if len(s) < self.state_size:
            s = np.pad(s, (0, self.state_size - len(s)))
        elif len(s) > self.state_size:
            s = s[:self.state_size]
        return s

    def _build_action_map(self):
        # index 0: hold (no order)
        action_map = [('hold', 0, 0.0)]
        # buys (positive pct), sells (negative pct)
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

        # Risk-aware sizing: scale quantity by aversion and wallet/inventory
        if side == 'buy':
            max_affordable = int(obs['own_balance'] // market_price)
            size = int(max(1, min(qty, max_affordable) * (1 - 0.7*self.risk_aversion)))
            price = round(market_price * (1 + abs(pct)), 2)
            return {'type': 'buy', 'quantity': size, 'price': price}
        else:
            price = round(market_price * (1 - abs(pct)), 2)
            inv = max(0, int(obs['own_assets']))  # closeable long
            # remaining short capacity = max_short_units - current short magnitude
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

        if np.random.rand() < self.exploration_rate:
            action_idx = random.randrange(self.action_size)
        else:
            q, _ = self._forward(self.model, state)
            action_idx = int(np.argmax(q))

        action = self._index_to_action(action_idx, obs)
        self.last_action = action
        # return dict for Market, but also return index for training convenience
        action['action_idx'] = action_idx
        return action

    def train(self, state, action_idx, reward, next_state, done):
        """Call this from the simulator. Stores transition and learns with Double-DQN target."""
        # Store
        self.memory.append((state, action_idx, reward, next_state, done))
        # Epsilon decay
        self.exploration_rate = max(self.min_exploration, self.exploration_rate * self.exploration_decay)

        if len(self.memory) < self.batch_size:
            return

        batch = random.sample(self.memory, self.batch_size)

        # Prepare arrays
        states      = np.array([b[0] for b in batch], dtype=float)
        actions     = np.array([b[1] for b in batch], dtype=int)
        rewards     = np.array([b[2] for b in batch], dtype=float)
        next_states = np.array([b[3] for b in batch], dtype=float)
        dones       = np.array([b[4] for b in batch], dtype=bool)

        # Online actions on next_states (Double DQN)
        q_next_online = np.array([self._forward(self.model, s)[0] for s in next_states])  # (B,A)
        a_next = np.argmax(q_next_online, axis=1)                                         # (B,)

        # Target Qs for those actions
        q_next_target = np.array([self._forward(self.target_model, s)[0] for s in next_states])  # (B,A)
        target_q = rewards + (~dones) * (self.discount_factor * q_next_target[np.arange(self.batch_size), a_next])

        # For each sample, compute gradient step
        for i in range(self.batch_size):
            s = states[i]
            a = actions[i]
            y = target_q[i]  # scalar target

            q_pred, cache = self._forward(self.model, s)
            q_a = q_pred[a]
            error = q_a - y

            # dL/dQ_a using Huber
            grad = huber_loss_grad(error, delta=self.huber_delta)  # scalar
            # Backprop ONLY through action a
            self._backward(self.model, cache, grad, a, self.learning_rate)

        # Soft update target
        self._soft_update_target()

    # -----------------------------
    # Accounting helpers
    # -----------------------------
    def calculate_net_worth(self, prices):
        return float(self.balance + self.assets * prices['asset'])

    def reset(self):
        self.balance = float(self.initial_balance)
        self.assets  = float(self.initial_assets)
        self.performance_history = []
        self.exploration_rate = max(self.exploration_rate, self.min_exploration)
        # optional: reset memory if you want episodic behavior
