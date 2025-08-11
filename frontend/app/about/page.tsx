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
      { id: "rl", label: "Reinforcement Learning (RL)" },
      { id: "momentum", label: "Momentum" },
      { id: "mean-reversion", label: "Mean Reversion" },
      { id: "market-maker", label: "Market Maker" },
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
      {/* Header bar (preserved structure & spacing) */}
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

      {/* Layout: sticky TOC + expansive content */}
      <div className="w-full flex gap-10">
        {/* TOC rail */}
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

        {/* Content */}
        <div className="flex-1 min-w-0 pb-12">
          <div className="grid grid-cols-1 gap-10 md:gap-12 pr-0 md:pr-4 text-[1.05rem] leading-7 md:text-[1.2rem] md:leading-8">

            {/* Overview */}
            <Section id="overview" title="Overview">
              <p>
                The system is a discrete-time, agent-based limit-order book (LOB). Agents submit limit orders to buy or sell a single asset; matching follows price–time priority. The state presented to each agent includes market variables (price, volume, short-horizon volatility, recent return features) and self-variables (cash, inventory). Actions map to discrete order templates: hold or place a limit order at a small percentage offset from the prevailing mid, with integer quantity subject to risk limits.
              </p>
              <p>
                The objective is not only individual profitability but also the study of emergent microstructure: spread dynamics, depth formation, volatility clustering, and regime changes induced by interaction among heterogeneous agents. All runs are deterministic given a configuration token (configuration + seeds).
              </p>
            </Section>

            {/* Agents overview (brief) */}
            <Section id="agents" title="Agents & Strategies">
              <p>
                Four trader classes are provided: Reinforcement Learning (RL), Momentum, Mean Reversion, and Market Maker. The non-learning baselines serve as steady references and provide diverse order flow; the RL agent adapts to this environment under explicit constraints.
              </p>
            </Section>

            {/* RL */}
            <Section id="rl" title="Reinforcement Learning (RL)">
              <p>
                The RL trader implements a dueling Q-network with experience replay and soft target updates. A shared hidden layer feeds a value head <em>V(s)</em> and an advantage head <em>A(s,a)</em>, combined as <code>Q(s,a) = V(s) + A(s,a) − mean_a A(s,a)</code>. Targets follow the Double-DQN scheme:
                <code className="ml-1">y = r + γ(1 − done) · Q<sub>target</sub>(s′, argmax<sub>a</sub> Q<sub>online</sub>(s′, a)).</code>
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="font-semibold mb-2">Observation & State</h3>
                  <ul className="list-disc pl-6 space-y-1">
                    <li>Price, volume, short-horizon volatility.</li>
                    <li>Agent cash and inventory.</li>
                    <li>Recent trend features (e.g., short returns, simple momentum proxies).</li>
                    <li>Optional normalization and padding to a fixed state dimension.</li>
                  </ul>
                </div>
                <div>
                  <h3 className="font-semibold mb-2">Action Space</h3>
                  <ul className="list-disc pl-6 space-y-1">
                    <li>Hold (no order).</li>
                    <li>Limit buy/sell with quantity from <code>qty_bins</code> and price offset from <code>pct_bins</code> about the mid.</li>
                    <li>Short selling optional; constrained by <code>max_short_units</code>.</li>
                  </ul>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="font-semibold mb-2">Learning & Stability</h3>
                  <ul className="list-disc pl-6 space-y-1">
                    <li>Experience replay with uniform sampling.</li>
                    <li>Huber loss on Q-values; soft target update with parameter <code>τ</code>.</li>
                    <li>ε-greedy exploration with exponential decay to a floor.</li>
                    <li>All randomness seeded for reproducibility.</li>
                  </ul>
                </div>
                <div>
                  <h3 className="font-semibold mb-2">Risk & Constraints</h3>
                  <ul className="list-disc pl-6 space-y-1">
                    <li>Position and short limits enforced pre-trade.</li>
                    <li>Quantity scaled by risk aversion and wallet capacity.</li>
                    <li>Tick rounding on prices; partial fills permitted.</li>
                  </ul>
                </div>
              </div>
              <p className="text-zinc-600 dark:text-zinc-300">
                Recommended starting hyperparameters: hidden size 64–128; batch 64; learning rate 1e-3–1e-4; γ≈0.99; τ≈0.01; ε decaying from 0.2–0.4 to 0.01.
              </p>
            </Section>

            {/* Momentum */}
            <Section id="momentum" title="Momentum">
              <p>
                Momentum traders act on recent return direction and magnitude. The signal is computed from two lookbacks (short and long) and thresholded to reduce churn. Orders are placed as limit orders around the mid; sizing is deterministic given risk aversion and inventory bounds.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-2">
                  <h3 className="font-semibold mb-2">Signal Definition</h3>
                  <ul className="list-disc pl-6 space-y-1">
                    <li>Short/long momentum windows (e.g., 3 and 10 steps).</li>
                    <li>Entry threshold for activation; tighter exit threshold to flatten.</li>
                    <li>Optional dampening under high short-horizon volatility.</li>
                  </ul>
                </div>
                <div>
                  <h3 className="font-semibold mb-2">Execution Logic</h3>
                  <ul className="list-disc pl-6 space-y-1">
                    <li>Greedy mapping from signal sign to buy/sell.</li>
                    <li>Limit price offset by a small percentage from mid in the favorable direction.</li>
                    <li>Inventory and cash constraints applied before order placement.</li>
                  </ul>
                </div>
              </div>
              <p className="text-zinc-600 dark:text-zinc-300">
                Momentum agents contribute directional pressure and generate trends; in combination with mean-reversion and market making, they shape spread and depth dynamics.
              </p>
            </Section>

            {/* Mean Reversion */}
            <Section id="mean-reversion" title="Mean Reversion">
              <p>
                Mean-reversion traders operate on the deviation of price from a rolling mean, scaled by rolling standard deviation. Entry and exit are governed by z-score thresholds. The design is intentionally conservative to avoid runaway inventory under sustained trends.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-2">
                  <h3 className="font-semibold mb-2">Signal Definition</h3>
                  <ul className="list-disc pl-6 space-y-1">
                    <li>Rolling lookback for mean and volatility (e.g., 20 steps).</li>
                    <li>Entry when |z| &gt; z<sub>enter</sub>; exit when |z| &lt; z<sub>exit</sub>.</li>
                    <li>Minimum volatility floor to prevent division instability.</li>
                  </ul>
                </div>
                <div>
                  <h3 className="font-semibold mb-2">Execution & Risk</h3>
                  <ul className="list-disc pl-6 space-y-1">
                    <li>Contrarian limit orders placed toward the mid.</li>
                    <li>Position caps and optional shorting controls.</li>
                    <li>Graceful flattening once deviation normalizes.</li>
                  </ul>
                </div>
              </div>
              <p className="text-zinc-600 dark:text-zinc-300">
                Mean-reversion agents supply counter-flow liquidity and tend to tighten spreads in stable regimes.
              </p>
            </Section>

            {/* Market Maker */}
            <Section id="market-maker" title="Market Maker">
              <p>
                The market maker provides two-sided quotes around the mid and adjusts spreads and skew based on volatility and inventory. The implementation is lightweight and practical: it is inspired by inventory-aware quoting (e.g., widening with volatility and skewing quotes to reduce inventory), without relying on continuous-time analytics.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="font-semibold mb-2">Quote Construction</h3>
                  <ul className="list-disc pl-6 space-y-1">
                    <li>Base spread plus volatility-scaled component.</li>
                    <li>Inventory skew: tighten on the side that reduces inventory, widen on the side that increases it.</li>
                    <li>Tick-aligned quotes; periodic refresh; immediate cancel-replace on state change.</li>
                  </ul>
                </div>
                <div>
                  <h3 className="font-semibold mb-2">Risk & Controls</h3>
                  <ul className="list-disc pl-6 space-y-1">
                    <li>Hard caps on absolute inventory.</li>
                    <li>Quote suspension under extreme volatility or insufficient cash.</li>
                    <li>Optional asymmetric sizes to accelerate inventory mean-reversion.</li>
                  </ul>
                </div>
              </div>
              <p className="text-zinc-600 dark:text-zinc-300">
                The market maker thickens top-of-book depth and stabilizes the spread; interaction with directional agents produces realistic queue dynamics.
              </p>
            </Section>

            {/* Market Flow */}
            <Section id="flow" title="Market Flow">
              <ol className="list-decimal pl-6 space-y-3">
                <li><span className="font-semibold">Observe:</span> state vector with price, volume, short-horizon volatility, trend features, and agent balances.</li>
                <li><span className="font-semibold">Decide:</span> RL chooses via ε-greedy over Q(s,·); baselines apply deterministic rules.</li>
                <li><span className="font-semibold">Place:</span> limit orders enter the LOB; matching is price–time, partial fills allowed.</li>
                <li><span className="font-semibold">Settle & Learn:</span> balances/positions update; RL performs replay and soft target updates.</li>
              </ol>
            </Section>

            {/* Metrics */}
            <Section id="metrics" title="Metrics Tracked">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div id="metrics-agent" className="scroll-mt-28">
                  <h3 className="text-xl md:text-2xl font-semibold mb-2">Per-Agent</h3>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>Net and alpha PnL (mark-to-market).</li>
                    <li>Win rate and maximum drawdown.</li>
                    <li>Inventory, cash, and full PnL history.</li>
                  </ul>
                </div>
                <div id="metrics-market" className="scroll-mt-28">
                  <h3 className="text-xl md:text-2xl font-semibold mb-2">Market-Wide</h3>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>Price, volume, and rolling volatility.</li>
                    <li>Order-book depth and bid-ask spread.</li>
                    <li>Recent trade tape (buyer/seller, price, size, time).</li>
                  </ul>
                </div>
              </div>
            </Section>

            {/* Participation */}
            <Section id="participate" title="Participating in the Market">
              <p>
                In Play mode, a discretionary user trader may submit buy and sell orders through the same matching engine and constraints as autonomous agents. Results are fully reproducible under a shared configuration token.
              </p>
            </Section>

            {/* Emergent Dynamics */}
            <Section id="emergent" title="Purpose & Emergent Dynamics">
              <p>
                The combination of directional flow, contrarian flow, and inventory-aware quoting yields familiar stylized facts: volatility clustering, spread widening during shocks and subsequent normalization, and regime shifts between trend-dominant and mean-reverting phases. The simulator provides a controlled setting to study how local learning and simple heuristics generate these aggregate phenomena.
              </p>
            </Section>

            {/* Footer */}
            <div className="flex items-center justify-between pt-2">
              <a href="#overview" className="text-base underline decoration-dotted">↑ Back to top</a>
              <div className="text-xs text-zinc-500">Last updated: {/* optional date */}</div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
