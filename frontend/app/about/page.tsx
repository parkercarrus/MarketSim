"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";

type TocItem = {
  id: string;
  label: string;
  children?: { id: string; label: string }[];
};

const TOC: TocItem[] = [
  { id: "overview", label: "Overview" },
  {
    id: "agents",
    label: "Agents & Strategies",
    children: [
      { id: "agents-rl", label: "Reinforcement Learning" },
      { id: "agents-quant", label: "Quant Strategies" },
    ],
  },
  { id: "flow", label: "Market Flow" },
  {
    id: "metrics",
    label: "Metrics Tracked",
    children: [
      { id: "metrics-agent", label: "Per-Agent" },
      { id: "metrics-market", label: "Market-Wide" },
    ],
  },
  { id: "participate", label: "Participating in the Market" },
  { id: "emergent", label: "Purpose & Emergent Dynamics" },
];

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-28">
      <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-4">
        <a href={`#${id}`} className="hover:underline decoration-dotted">
          {title}
        </a>
      </h2>
      <Card className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
        <CardContent className="pt-6 space-y-4">{children}</CardContent>
      </Card>
    </section>
  );
}

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-white text-black dark:bg-zinc-900 dark:text-white px-6 py-8 font-mono">
      {/* PRESERVED HEADER BAR (structure & styling) */}
      <div
        className={`border rounded-lg p-4 flex justify-between items-end mb-8 bg-white dark:bg-zinc-900 ${
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

      {/* FULL-WIDTH LAYOUT: sticky TOC + expansive content */}
      <div className="w-full flex gap-10">
        {/* Left TOC rail */}
        <aside className="hidden lg:block lg:w-80 xl:w-96 shrink-0">
          <nav className="sticky top-28">
            <Card className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
              <CardContent className="pt-6">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-500 mb-3">
                  On this page
                </h3>
                <ul className="space-y-2 text-sm">
                  {TOC.map((item) => (
                    <li key={item.id}>
                      <a href={`#${item.id}`} className="hover:underline decoration-dotted">
                        {item.label}
                      </a>
                      {item.children && (
                        <ul className="mt-2 ml-3 space-y-1 border-l border-zinc-200 dark:border-zinc-800 pl-3">
                          {item.children.map((sub) => (
                            <li key={sub.id}>
                              <a
                                href={`#${sub.id}`}
                                className="hover:underline decoration-dotted text-zinc-700 dark:text-zinc-300"
                              >
                                {sub.label}
                              </a>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </nav>
        </aside>

        {/* Content column */}
        <div className="flex-1 min-w-0 pb-12">
          <div className="grid grid-cols-1 gap-10 md:gap-12 pr-0 md:pr-4 text-[1.05rem] leading-7 md:text-[1.2rem] md:leading-8">
            {/* Overview */}
            <Section id="overview" title="About This Simulation">
              <p>
                This project is an agent-based market in discrete time. Think of it as a sandboxed limit-order book
                where heterogeneous agents—reinforcement learners and simple quantitative rules—compete under the same
                microstructure. The goal isn’t to “beat” a fixed strategy so much as to watch how interaction effects
                produce recognizable market patterns.
              </p>
              <p>
                By default, there’s a single tradeable asset and a price–time–priority matching engine. Agents see a
                compact state vector: current price and volume, rolling volatility, their own cash/position, and a few
                simple trend features. Actions are small limit orders (buy/sell/hold) with sizes derived from risk
                aversion and wallet constraints. Everything is reproducible: when you export a token, you’re really
                exporting the config + seed so a peer can recreate the exact same run.
              </p>
              <p className="text-zinc-600 dark:text-zinc-300">
                If you want the short version: it’s a toy exchange where learning agents adapt locally, and the
                aggregate dynamics—spreads, bursts, queues—emerge globally.
              </p>
            </Section>

            {/* Agents & Strategies */}
            <Section id="agents" title="Agents & Strategies">
              <div className="space-y-8">
                <div id="agents-rl" className="scroll-mt-28">
                  <h3 className="text-xl md:text-2xl font-semibold mb-2">Reinforcement Learning</h3>
                  <p>
                    The RL agent is a small dueling Q-network: a shared hidden layer feeds two heads, one estimating a
                    state value <em>V(s)</em> and one estimating advantages <em>A(s,a)</em>. We combine them as{" "}
                    <code>Q(s,a) = V(s) + A(s,a) − mean_a A(s,a)</code>. This tends to stabilize value estimates when
                    many actions are near-substitutes (common in small limit ticks).
                  </p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>
                      <span className="font-semibold">Exploration:</span> ε-greedy (ε decays to a floor). Exploration
                      noise is seeded so reruns are deterministic under the same token.
                    </li>
                    <li>
                      <span className="font-semibold">Learning:</span> experience replay + soft target updates. After a
                      batch, we compute double-DQN targets and update via Huber loss, which is friendlier to outliers
                      from rare large fills.
                    </li>
                    <li>
                      <span className="font-semibold">Action space:</span> a small grid over quantity bins × price
                      offsets (both longs and shorts if enabled). “Hold” is a real action; starving the book is allowed
                      and sometimes optimal.
                    </li>
                    <li>
                      <span className="font-semibold">Risk:</span> sizing shrinks with higher risk aversion and wallet
                      constraints. Shorts are hard-capped by a <code>max_short_units</code>.
                    </li>
                  </ul>
                </div>

                <div id="agents-quant" className="scroll-mt-28">
                  <h3 className="text-xl md:text-2xl font-semibold mb-2">Quant Strategies</h3>
                  <p>
                    The non-learning baselines are intentionally simple—good for sanity checks and as moving targets:
                  </p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>
                      <span className="font-semibold">Momentum:</span> act on the sign/magnitude of recent returns.
                      Two lookbacks (short/long) and an entry/exit threshold control how jumpy or patient the trader
                      is. These agents act greedily with respect to their score.
                    </li>
                    <li>
                      <span className="font-semibold">Mean Reversion:</span> use a z-score of price vs a rolling mean.
                      Enter when |z| &gt; threshold, exit near zero. In practice they provide a stabilizing force until
                      momentum overwhelms them.
                    </li>
                  </ul>
                  <p className="text-zinc-600 dark:text-zinc-300">
                    Mixing a few of each gives you enough “ecology” to see interesting order-book shapes without
                    overfitting on a single behavior.
                  </p>
                </div>
              </div>
            </Section>

            {/* Market Flow */}
            <Section id="flow" title="Market Flow">
              <ol className="list-decimal pl-6 space-y-3">
                <li>
                  <span className="font-semibold">Observe:</span> Each agent receives a state vector with price,
                  volume, recent trend, rolling volatility, and its own wallet (cash/position). The state is deliberately
                  low-dimensional; we want behavior, not feature engineering.
                </li>
                <li>
                  <span className="font-semibold">Decide:</span> RL computes Q(s,·) and picks argmax with ε-greedy
                  exploration; quant agents act greedily on their signals. The chosen action maps to a limit price (a
                  small ±% around mid) and an integer quantity.
                </li>
                <li>
                  <span className="font-semibold">Place:</span> Orders enter a central limit order book. Matching is
                  price–time priority; partial fills are possible. Best bid/ask define the spread; the mid drives
                  mark-to-market PnL.
                </li>
                <li>
                  <span className="font-semibold">Settle & learn:</span> Filled trades update balances/positions. RL
                  stores the transition and periodically samples a replay batch to update the network and softly update
                  the target (τ).
                </li>
              </ol>
              <p className="text-zinc-600 dark:text-zinc-300">
                Implementation details: ticks are rounded to a fixed grid; position/short limits are enforced before
                order submission; rewards are derived from incremental PnL.
              </p>
            </Section>

            {/* Metrics Tracked */}
            <Section id="metrics" title="Metrics Tracked">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div id="metrics-agent" className="scroll-mt-28">
                  <h3 className="text-xl md:text-2xl font-semibold mb-2">Per-Agent</h3>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>
                      <span className="font-semibold">Net PnL:</span> realized + unrealized. Unrealized is position ×
                      mid.
                    </li>
                    <li>
                      <span className="font-semibold">Alpha PnL:</span> PnL relative to a simple market benchmark
                      (think “how much did you add beyond drift?”).
                    </li>
                    <li>
                      <span className="font-semibold">Win rate:</span> share of closed trades with positive PnL. High
                      win rate with tiny size isn’t automatically good.
                    </li>
                    <li>
                      <span className="font-semibold">Max drawdown:</span> worst peak-to-trough on the equity curve.
                      Good reality check for “works on average” strategies.
                    </li>
                    <li>
                      <span className="font-semibold">Exposures:</span> position size, cash balance, and a PnL history
                      so you can eyeball regime shifts.
                    </li>
                  </ul>
                </div>
                <div id="metrics-market" className="scroll-mt-28">
                  <h3 className="text-xl md:text-2xl font-semibold mb-2">Market-Wide</h3>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>
                      <span className="font-semibold">Price & volume:</span> time series for context and validation.
                    </li>
                    <li>
                      <span className="font-semibold">Rolling volatility:</span> short-horizon std of returns—watch for
                      clustering after shocks.
                    </li>
                    <li>
                      <span className="font-semibold">Order book depth & spread:</span> top-of-book and cumulative
                      depth, which reveal whether liquidity is “thick” or fragile.
                    </li>
                    <li>
                      <span className="font-semibold">Trade tape:</span> recent fills with buyer/seller IDs for quick
                      forensic checks.
                    </li>
                  </ul>
                </div>
              </div>
            </Section>

            {/* Participating */}
            <Section id="participate" title="Participating in the Market">
              <p>
                You can join as a discretionary trader. In <span className="font-semibold">Play mode</span> you’ll see
                your own “user” card with cash, position, and one-click buy/sell at the best prices. Your orders go
                through the same matching engine as the bots—no special latency or permissions.
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>
                  <span className="font-semibold">Fair rules:</span> same tick size, same queueing, same position/short
                  limits as everyone else.
                </li>
                <li>
                  <span className="font-semibold">Good hygiene:</span> start small, watch the spread, and avoid chasing
                  your own orders (classic retail leak).
                </li>
                <li>
                  <span className="font-semibold">Reproducibility:</span> export a token after init; anyone can import
                  it to replay the exact market (seeded RNGs).
                </li>
              </ul>
            </Section>

            {/* Emergent Dynamics */}
            <Section id="emergent" title="Purpose & Emergent Dynamics">
              <p>
                The interesting part isn’t that any single agent “wins.” It’s that simple local rules often create
                familiar global structure. With a mix of momentum and mean-reversion, plus RL adapting to the path it
                experiences, you’ll typically see:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>
                  <span className="font-semibold">Volatility clustering:</span> bursts of activity after shocks as
                  order books thin and queues reshuffle.
                </li>
                <li>
                  <span className="font-semibold">Spread dynamics:</span> spreads widen when inventory risk is high or
                  when the book is one-sided; tighten again as liquidity returns.
                </li>
                <li>
                  <span className="font-semibold">Regime shifts:</span> extended periods where one narrative (trend vs.
                  revert) dominates, then flips.
                </li>
              </ul>
              <p className="text-zinc-600 dark:text-zinc-300">
                None of this proves market efficiency or inefficiency—this is a controlled playground. But it’s a good
                way to build intuition for how microstructure + learning interact.
              </p>
            </Section>

            {/* Footer link */}
            <div className="flex items-center justify-between pt-2">
              <a href="#overview" className="text-base underline decoration-dotted">
                ↑ Back to top
              </a>
              <div className="text-xs text-zinc-500">
                Last updated: {/* drop a date if you want */}
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
