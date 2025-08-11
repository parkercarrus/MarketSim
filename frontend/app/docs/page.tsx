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
          <Link href="/about" className="text-black-600 hover:underline dark:text-white mr-4">
            About
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
          <div className="grid grid-cols-1 gap-10 md:gap-12 pr-0 md:pr-4">
            {/* Overview */}
            <Section id="overview" title="About This Simulation">
              <p>
                This site hosts an interactive agent-based market simulation, where autonomous trading agents
                compete to maximize profit within a simulated market. The core of the agent population is composed of{" "}
                <Link href="/rl" className="underline decoration-dotted">
                  reinforcement learning
                </Link>{" "}
                (RL) agents, which use a certain policy function to generate trading decisions. RL agents update
                their policy function after a certain number of steps in a dynamic training process. For more
                information on how RL agents operate, look{" "}
                <Link href="/rl" className="underline decoration-dotted">
                  here
                </Link>
                .
              </p>
            </Section>

            {/* Agents & Strategies */}
            <Section id="agents" title="Agents & Strategies">
              <div className="space-y-8">
                <div id="agents-rl" className="scroll-mt-28">
                  <h3 className="text-xl font-semibold mb-2">Reinforcement Learning</h3>
                  <p>
                    RL agents select actions via a policy function and periodically update that policy from experience.
                    They may occasionally explore non-greedy actions (e.g., epsilon-greedy) during training.
                  </p>
                </div>

                <div id="agents-quant" className="scroll-mt-28">
                  <h3 className="text-xl font-semibold mb-2">Additional Quantitative Strategies</h3>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>
                      <span className="font-semibold">Momentum Traders:</span> AKA trend-followers, buy when recent
                      trends are up, sell when recent trends are down.
                    </li>
                    <li>
                      <span className="font-semibold">Mean-Reversion Traders:</span> Bet on price reverting to
                      historical mean, believe in market coercivity.
                    </li>
                  </ul>
                </div>
              </div>
            </Section>

            {/* Market Flow */}
            <Section id="flow" title="Market Flow">
              <ol className="list-decimal pl-6 space-y-2">
                <li>
                  Agents <span className="font-semibold">observe</span> a state vector containing market and
                  agent-specific features (price, volume, volatility, cash, position, recent price trend).
                </li>
                <li>
                  Each agent’s <span className="font-semibold">policy function</span> produces confidence values for
                  each possible action (buy, sell, hold). Non-RL agents act greedily; RL agents sometimes take{" "}
                  <em>non-greedy</em> actions based on their{" "}
                  <a
                    href="https://en.wikipedia.org/wiki/Multi-armed_bandit#:~:text=Epsilon%2Dgreedy%20strategy,circumstances%20and%20predilections."
                    target="_blank"
                    rel="noreferrer"
                    className="underline decoration-dotted"
                  >
                    epsilon-greedy
                  </a>{" "}
                  policy.
                </li>
                <li>
                  Orders are submitted to the market, with pricing determined by the agent’s configuration and action
                  output.
                </li>
                <li>
                  The <span className="font-semibold">order matching engine</span> executes trades based on price–time
                  priority.
                </li>
                <li>
                  <span className="font-semibold">PnL is computed</span> from executed trades, and rewards are used to
                  update the agent’s policy from stored experience.
                </li>
              </ol>
            </Section>

            {/* Metrics Tracked */}
            <Section id="metrics" title="Metrics Tracked">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div id="metrics-agent" className="scroll-mt-28">
                  <h3 className="text-lg font-semibold mb-2">Per-agent</h3>
                  <ul className="list-disc pl-6 space-y-1">
                    <li>Net PnL</li>
                    <li>Alpha PnL (relative to market benchmark)</li>
                    <li>Win rate</li>
                    <li>Maximum drawdown</li>
                    <li>Position size and cash balance</li>
                    <li>PnL history over time</li>
                  </ul>
                </div>
                <div id="metrics-market" className="scroll-mt-28">
                  <h3 className="text-lg font-semibold mb-2">Market-wide</h3>
                  <ul className="list-disc pl-6 space-y-1">
                    <li>Price history</li>
                    <li>Trading volume per timestep</li>
                    <li>Rolling volatility</li>
                    <li>Depth and spread of the live order book</li>
                  </ul>
                </div>
              </div>
            </Section>

            {/* Participating */}
            <Section id="participate" title="Participating in the Market">
              <p>
                You may participate as a <span className="font-semibold">discretionary trader</span> alongside
                autonomous agents. The task is straightforward: buy and sell at times you consider advantageous,
                competing for fills and PnL under the same market rules. Your behavior is not learned by a policy
                function—you bring your own strategy and timing.
              </p>
            </Section>

            {/* Emergent Dynamics */}
            <Section id="emergent" title="Purpose and Emergent Dynamics">
              <p>
                The system is designed to study <span className="font-semibold">emergent market dynamics</span> in a
                multi-agent RL setting. Each agent optimizes locally based on its reward structure, yet the aggregate
                feedback loop produces system-level phenomena—price trends, volatility clustering, liquidity shocks,
                and regime shifts. By observing these interactions over many timesteps, we can examine how learning
                dynamics, competitive pressure, and market microstructure collectively shape the evolution of the
                market.
              </p>
            </Section>

            {/* Footer link */}
            <div className="flex items-center justify-between pt-2">
              <a href="#overview" className="text-sm underline decoration-dotted">
                ↑ Back to top
              </a>
              <div className="text-xs text-zinc-500">Last updated: {/* fill if desired */}</div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
