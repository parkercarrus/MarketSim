import React from 'react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';

const markdown = `
## About This Simulation

This site hosts an interactive **agent-based market simulation** where autonomous trading agents use reinforcement learning (RL)–driven policy functions to operate within a simulated market.

Each agent maintains a parameterized policy that maps observations of the market state to discrete trading actions (**buy**, **sell**, **hold**). These policies are updated over time using Q-learning–style updates, with parameters including:

- **Learning rate** — step size in parameter updates
- **Discount factor (gamma)** — weighting of future rewards
- **Exploration rate (epsilon)** — probability of selecting a non-greedy action
- **Risk aversion** — affects aggressiveness of pricing decisions

### How It Works
1. Agents **observe** a state vector containing normalized market and agent-specific features (price, volume, volatility, cash, position, recent price trend).
2. The **policy function** produces action values (Q-values) for each possible action.
3. An action is selected using an **epsilon-greedy** policy.
4. **Orders of quantity 1** are submitted to the market, with pricing determined by the agent’s configuration and action output.
5. The **order matching engine** executes trades based on price–time priority.
6. **PnL is computed** from executed trades, and rewards are used to update the agent’s policy from stored experience.

### Metrics Tracked
**Per-agent**
- Net PnL
- Alpha PnL (relative to market benchmark)
- Win rate
- Maximum drawdown
- Position size and cash balance
- PnL history over time

**Market-wide**
- Price history
- Trading volume per timestep
- Rolling volatility
- Depth and spread of the live order book

### Participating in the Market
You participate as a **discretionary trader** alongside autonomous RL agents. The task is straightforward: buy and sell at times you consider advantageous, competing for fills and PnL under the same market rules. Your behavior is not learned by a policy function—you bring your own strategy and timing.

### Purpose and Emergent Dynamics
The system is designed to study **emergent market dynamics** in a multi-agent RL setting. Each agent optimizes locally based on its reward structure, yet the aggregate feedback loop produces system-level phenomena—price trends, volatility clustering, liquidity shocks, and regime shifts. By observing these interactions over many timesteps, we can examine how learning dynamics, competitive pressure, and market microstructure collectively shape the evolution of the market.
`;

const AboutPage: React.FC = () => {
    return (
        <main className="min-h-screen bg-white text-black dark:bg-zinc-900 dark:text-white px-6 py-8 font-mono">
        <div
            className={`border rounded-lg p-4 flex justify-between items-end mb-6 bg-white dark:bg-zinc-900 ${
                "border-black"
            }`}
        >
            <h1 className="text-3xl font-bold tracking-tight">About</h1>
            <div>
            <Link href="/" className="text-black-600 hover:underline dark:text-white mr-4">
                Home
            </Link>
            <Link href="/docs" className="text-black-600 hover:underline dark:text-white mr-4">
                API
            </Link>
            <Link href="/dashboard" className="text-black-600 hover:underline dark:text-white">
                Simulation
            </Link>
            </div>
        </div>

            {/* Centered Markdown Content */}
            <div className="flex justify-center items-center w-full min-h-screen pt-24 pb-12">
                <div className="prose prose-lg dark:prose-invert prose-headings:font-bold prose-headings:tracking-tight prose-p:leading-relaxed prose-li:leading-relaxed whitespace-pre-line max-w-3xl w-full px-6">
                    <ReactMarkdown>{markdown}</ReactMarkdown>
                </div>
            </div>
        </main>
    );
};

export default AboutPage;
