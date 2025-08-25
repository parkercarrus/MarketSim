"use client";

import Link from "next/link";
import { Separator } from "@/components/ui/separator";

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="text-2xl font-semibold tracking-tight mb-2">{children}</h2>;
}
function H3({ children }: { children: React.ReactNode }) {
  return <h3 className="text-lg font-semibold mt-6 mb-2">{children}</h3>;
}
function P({ children }: { children: React.ReactNode }) {
  return <p className="text-muted-foreground">{children}</p>;
}
function UL({ children }: { children: React.ReactNode }) {
  return <ul className="list-disc pl-6 space-y-1 text-muted-foreground">{children}</ul>;
}
function OL({ children }: { children: React.ReactNode }) {
  return <ol className="list-decimal pl-6 space-y-2 text-muted-foreground">{children}</ol>;
}
function InlineCode({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-muted px-1 py-0.5 font-mono text-sm text-foreground">
      {children}
    </code>
  );
}

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-background text-foreground px-6 py-8 font-sans antialiased">
      {/* Header */}
      <div className="border border-black rounded-lg p-4 flex justify-between items-end mb-12 bg-background">
        <h1 className="text-3xl font-semibold tracking-tight">About</h1>
        <nav className="space-x-6">
          <Link href="/" className="hover:underline">Home</Link>
          <Link href="/docs" className="hover:underline">API</Link>
          <Link href="/dashboard" className="hover:underline">Simulation</Link>
        </nav>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto text-[17px] leading-8 sm:text-[18px] sm:leading-9 space-y-8">
        <section className="space-y-3">
          <H2>About</H2>
          <P>
            This project is a <strong>multi-agent market simulator</strong> designed to explore the
            emergent dynamics of heterogeneous trading agents. Each agent seeks to maximize personal
            profit while interacting in a sandbox environment. Agents place buy/sell orders against
            one another, and market prices arise naturally from supply–demand forces.
          </P>
          <P>
            Notably, <strong>no external shocks</strong> are injected: the entire trajectory of the
            market is determined by the <strong>initial configuration</strong>.
          </P>
          <P>Each agent observes:</P>
          <UL>
            <li>Price vector</li>
            <li>Volume vector</li>
            <li>Short-horizon volatility vector</li>
            <li>Own cash and inventory</li>
          </UL>
          <P>
            Agent types include <strong>Reinforcement Learning (RL) Traders, Momentum Traders,
            Mean-Reversion Traders,</strong> and <strong>Market Makers</strong>. Current RL traders
            begin naïve, with policies learned entirely from in-simulation historical data—making
            the environment a genuine RL sandbox.
          </P>
          <P>
            Research focus: emergent microstructure phenomena such as <em>spread dynamics, depth
            formation, volatility clustering,</em> and <em>regime shifts</em> induced by heterogeneous
            interactions. Given determinism, we are particularly interested in the possibility of
            <strong> deterministic non-periodic flow (chaos).</strong>
          </P>
        </section>

        <Separator />

        <section className="space-y-2">
          <H2>Agent Types</H2>

          <H3>Reinforcement Learning Traders</H3>
          <P>
            RL agents use a dueling Q-network with experience replay and soft target updates. They
            start from naïve policies but learn adaptively from simulation history. Unlike rule-based
            agents, RL traders explore new behaviors — sometimes converging to profitable niches,
            sometimes destabilizing the market. This makes them ideal for studying how adaptive
            strategies interact with fixed heuristics.
          </P>
          <P>
            Key features: ε-greedy exploration, Huber loss stabilization, and reproducible seeding.
            They capture the dynamics of “learning under feedback” often seen in real markets.
          </P>

          <H3>Momentum Traders</H3>
          <P>
            Momentum traders exploit directional trends. They compare short-term and long-term moving
            averages and act when the difference exceeds a threshold. If{" "}
            <InlineCode>(STMA – LTMA) &gt; threshold</InlineCode> they buy, and if{" "}
            <InlineCode>(LTMA – STMA) &gt; threshold</InlineCode> they sell.
          </P>
          <P>
            While simple, these agents reinforce existing trends, often causing runs of one-sided
            order flow. They are useful for creating volatility spikes and bubbles within the
            simulation.
          </P>

          <H3>Mean-Reversion Traders</H3>
          <P>
            Mean-reverters bet on price returning to a rolling mean, normalized by volatility.
            A large positive deviation triggers a sell; a large negative deviation triggers a buy.
          </P>
          <P>
            These agents act as natural stabilizers, counterbalancing momentum flow. They generate
            realistic microstructure features such as tighter spreads and rapid corrections when
            prices deviate too far from equilibrium.
          </P>

          <H3>Market Makers</H3>
          <P>
            Market makers continuously provide two-sided liquidity around the mid-price. Their
            spreads and sizes adjust with volatility and inventory, ensuring they remain solvent
            while keeping the market tradable.
          </P>
          <P>
            They thicken the order book and reduce transaction costs for others. Without them,
            markets in the simulation quickly dry up or become unstable. By interacting with
            momentum and mean-reversion flows, market makers are central to generating realistic
            spread and depth dynamics.
          </P>
        </section>

        <Separator />

        <section className="space-y-3">
          <H2>Simulation Flow</H2>
          <OL>
            <li>Agents observe the current state (prices, volumes, volatilities, balances).</li>
            <li>Each agent decides on an action and places a buy/sell/hold order.</li>
            <li>
              Orders enter the <strong>limit order book</strong>, matched by price–time priority.
            </li>
            <li>Trades update balances and inventories; RL agents update policies via replay.</li>
          </OL>
        </section>

        <Separator />

        <section className="space-y-3 pb-2">
          <H2>Participation</H2>
          <P>
            Users can join directly in <strong>Play Mode</strong> from the homepage, placing live
            buy/sell orders alongside simulated agents.
          </P>
        </section>
          <section className="space-y-3 pb-2">
            <H3>
              <span className="text-muted-foreground">Developed by </span>
              <a
              href="https://linkedin.com/in/parkercarrus"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:underline"
              >
              Parker Carrus
              </a>
            </H3>
          </section>
      </div>
    </main>
  );
}
