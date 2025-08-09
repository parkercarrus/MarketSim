"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

type TraderParam = {
  id: string;
  balance: number;
  assets: number;
  risk_aversion: number;
  learning_rate: number;
  gamma: number;
  epsilon: number;
  is_user?: boolean;
};

export default function InitializeSimulation() {
  const router = useRouter();

  const [numTraders, setNumTraders] = useState(20);
  const [volatility, setVolatility] = useState(0.03);
  const [initialPrice, setInitialPrice] = useState(100);
  const [initialQuantity, setInitialQuantity] = useState(1000);

  const [userId, setUserId] = useState("PARKER");
  const [userBalance, setUserBalance] = useState(1000);
  const [userAssets, setUserAssets] = useState(5);

  // NEW: global toggle for short selling
  const [allowShortSelling, setAllowShortSelling] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    const saved = localStorage.getItem("allow_short_selling");
    return saved ? saved === "true" : false;
  });

  const API_URL =
    process.env.NEXT_PUBLIC_API_URL ?? "/api";


  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("allow_short_selling", String(allowShortSelling));
    }
  }, [allowShortSelling]);

  // ----- helpers
  const clampNum = (v: any, def = 0) => (Number.isFinite(v) ? v : def);
  const randomInRange = (min: number, max: number, decimals = 2) =>
    parseFloat((Math.random() * (max - min) + min).toFixed(decimals));
  const randomLogUniform = (minExp: number, maxExp: number, decimals = 6) => {
    const e = randomInRange(minExp, maxExp, 6);
    return parseFloat((10 ** e).toFixed(decimals));
  };

  // Better defaults (you can tweak ranges)
  const buildRandomTrader = (i: number): TraderParam => ({
    id: `BOT_${i + 1}`,
    balance: 1000,
    assets: 10,
    risk_aversion: randomInRange(0.1, 1.0, 2),
    learning_rate: randomLogUniform(-4, -2, 6),
    gamma: randomInRange(0.95, 0.9995, 4),
    epsilon: randomInRange(0.1, 0.4, 2),
    is_user: false,
  });

  // Initial bot list
  const initialBots = useMemo<TraderParam[]>(
    () => Array.from({ length: numTraders }, (_, i) => buildRandomTrader(i)),
    [] // only once on mount; we handle subsequent changes below
  );
  const [traderParams, setTraderParams] = useState<TraderParam[]>(initialBots);

  // When numTraders changes, resize array: keep existing edited bots, add randomized new ones, or truncate
  useEffect(() => {
    setTraderParams((prev) => {
      if (numTraders === prev.length) return prev;

      if (numTraders > prev.length) {
        const add = Array.from(
          { length: numTraders - prev.length },
          (_, k) => buildRandomTrader(prev.length + k)
        );
        return [...prev, ...add];
      } else {
        const sliced = prev.slice(0, numTraders).map((t, i) => ({ ...t, id: `BOT_${i + 1}` }));
        return sliced;
      }
    });
  }, [numTraders]);

  const updateTrader = (index: number, key: keyof TraderParam, value: number) => {
    setTraderParams((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [key]: value } as TraderParam;
      return next;
    });
  };

  const regenerateBots = () => {
    setTraderParams(Array.from({ length: numTraders }, (_, i) => buildRandomTrader(i)));
  };

  const handleSubmit = async () => {
    const userTrader: TraderParam = {
      id: userId || "USER",
      balance: clampNum(userBalance, 0),
      assets: clampNum(userAssets, 0),
      risk_aversion: 0.5,
      learning_rate: 0.01,
      gamma: 0.99,
      epsilon: 0.1,
      is_user: true,
    };

    localStorage.setItem("userTraderId", userTrader.id);

    const bots = traderParams.map((t, i) => ({
      ...t,
      id: `BOT_${i + 1}`,
      balance: clampNum(t.balance, 0),
      assets: clampNum(t.assets, 0),
      is_user: false,
    }));

    const payload = {
      initial_price: clampNum(initialPrice, 1),
      initial_quantity: clampNum(initialQuantity, 0),
      volatility: clampNum(volatility, 0.01),
      allow_short_selling: allowShortSelling,        // NEW — primary key
      short_selling_enabled: allowShortSelling,      // NEW — alias if your API uses this
      traders: [userTrader, ...bots],
    };

    await fetch(`${API_URL}/init`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    router.push("/dashboard");
  };

  return (
    <main className="min-h-screen bg-white text-black dark:bg-zinc-950 dark:text-white px-6 py-8 font-mono">
      <h1 className="text-3xl font-bold mb-6 tracking-tight">Initialize Market Simulation</h1>

      {/* User trader */}
      <Card className="border border-blue-500 dark:border-blue-400 mb-6 bg-blue-50 dark:bg-zinc-800">
        <CardContent className="pt-4">
          <h2 className="text-lg font-semibold mb-4 text-blue-900 dark:text-blue-200">Your Trader</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="user-id" className="dark:text-zinc-300 mb-1 block">Self Trader Name</Label>
              <Input
                id="user-id"
                type="text"
                placeholder="Your Name"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                className="bg-white text-black border border-blue-500 dark:bg-zinc-900 dark:text-white dark:border-blue-400"
              />
            </div>
            <div>
              <Label htmlFor="user-balance" className="dark:text-zinc-300 mb-1 block">Initial Balance</Label>
              <Input
                id="user-balance"
                type="number"
                min={0}
                step="1"
                placeholder="e.g. 1000"
                value={Number.isFinite(userBalance) ? userBalance : 0}
                onChange={(e) => setUserBalance(parseFloat(e.target.value))}
                className="bg-white text-black border border-blue-500 dark:bg-zinc-900 dark:text-white dark:border-blue-400"
              />
            </div>
            <div>
              <Label htmlFor="user-assets" className="dark:text-zinc-300 mb-1 block">Initial Position (Assets)</Label>
              <Input
                id="user-assets"
                type="number"
                min={0}
                step="1"
                placeholder="e.g. 5"
                value={Number.isFinite(userAssets) ? userAssets : 0}
                onChange={(e) => setUserAssets(parseFloat(e.target.value))}
                className="bg-white text-black border border-blue-500 dark:bg-zinc-900 dark:text-white dark:border-blue-400"
              />
            </div>
          </div>
          <p className="text-sm mt-3 text-blue-900/70 dark:text-blue-200/70">
            You will be added as a trading agent in the simulation alongside the bots.
          </p>
        </CardContent>
      </Card>

      {/* Global settings */}
      <Card className="border border-black dark:border-zinc-700 mb-6 bg-white dark:bg-zinc-900">
        <CardContent className="pt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label className="dark:text-zinc-300 mb-1">Number of Traders</Label>
            <Input
              type="number"
              value={numTraders}
              min={1}
              className="bg-white text-black border border-black dark:bg-zinc-800 dark:text-white dark:border-zinc-600"
              onChange={(e) => setNumTraders(Math.max(1, parseInt(e.target.value || "1", 10)))}
            />
          </div>
          <div>
            <Label className="dark:text-zinc-300 mb-1">Initial Price</Label>
            <Input
              type="number"
              value={initialPrice}
              onChange={(e) => setInitialPrice(parseFloat(e.target.value))}
              className="bg-white text-black border border-black dark:bg-zinc-800 dark:text-white dark:border-zinc-600"
            />
          </div>
          <div>
            <Label className="dark:text-zinc-300 mb-1">Initial Quantity</Label>
            <Input
              type="number"
              value={initialQuantity}
              onChange={(e) => setInitialQuantity(parseFloat(e.target.value))}
              className="bg-white text-black border border-black dark:bg-zinc-800 dark:text-white dark:border-zinc-600"
            />
          </div>

          {/* Short selling toggle */}
          <div className="flex items-center gap-2 mt-6 ml-4">
            <input
              id="allow-short-selling"
              type="checkbox"
              checked={allowShortSelling}
              onChange={(e) => setAllowShortSelling(e.target.checked)}
              className="w-7 h-7 accent-blue-500 rounded border-2 border-blue-400 focus:ring-2 focus:ring-blue-300 transition-all"
              style={{ marginLeft: "8px" }}
            />
            <Label
              htmlFor="allow-short-selling"
              className="dark:text-zinc-300 mb-0 pl-2 text-lg"
              style={{ fontSize: "1.15rem" }}
            >
              Allow Short Selling
            </Label>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3 mb-6">
        <h2 className="text-xl font-semibold">Trader Parameters</h2>
        <Button variant="secondary" onClick={regenerateBots}>
          Regenerate Bots
        </Button>
        <Button
          onClick={handleSubmit}
          className="px-4 py-2 rounded bg-blue-500 hover:bg-blue-600 text-white font-medium shadow dark:shadow-md"
        >
          Initialize and Launch
        </Button>
      </div>

      {traderParams.map((trader, i) => (
        <Card key={trader.id} className="border border-black dark:border-zinc-700 mb-4 bg-white dark:bg-zinc-900">
          <CardContent className="pt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label className="dark:text-zinc-300 mb-1">Balance (Trader {trader.id})</Label>
              <Input
                type="number"
                value={trader.balance}
                onChange={(e) => updateTrader(i, "balance", parseFloat(e.target.value))}
                className="bg-white text-black border border-black dark:bg-zinc-800 dark:text-white dark:border-zinc-600"
              />
            </div>
            <div>
              <Label className="dark:text-zinc-300 mb-1">Assets</Label>
              <Input
                type="number"
                value={trader.assets}
                onChange={(e) => updateTrader(i, "assets", parseFloat(e.target.value))}
                className="bg-white text-black border border-black dark:bg-zinc-800 dark:text-white dark:border-zinc-600"
              />
            </div>
            <div>
              <Label className="dark:text-zinc-300 mb-1">Risk Aversion</Label>
              <Input
                type="number"
                step="0.01"
                value={trader.risk_aversion}
                onChange={(e) => updateTrader(i, "risk_aversion", parseFloat(e.target.value))}
                className="bg-white text-black border border-black dark:bg-zinc-800 dark:text-white dark:border-zinc-600"
              />
            </div>
            <div>
              <Label className="dark:text-zinc-300 mb-1">Learning Rate</Label>
              <Input
                type="number"
                step="0.000001"
                value={trader.learning_rate}
                onChange={(e) => updateTrader(i, "learning_rate", parseFloat(e.target.value))}
                className="bg-white text-black border border-black dark:bg-zinc-800 dark:text-white dark:border-zinc-600"
              />
            </div>
            <div>
              <Label className="dark:text-zinc-300 mb-1">Gamma</Label>
              <Input
                type="number"
                step="0.0001"
                value={trader.gamma}
                onChange={(e) => updateTrader(i, "gamma", parseFloat(e.target.value))}
                className="bg-white text-black border border-black dark:bg-zinc-800 dark:text-white dark:border-zinc-600"
              />
            </div>
            <div>
              <Label className="dark:text-zinc-300 mb-1">Epsilon</Label>
              <Input
                type="number"
                step="0.01"
                value={trader.epsilon}
                onChange={(e) => updateTrader(i, "epsilon", parseFloat(e.target.value))}
                className="bg-white text-black border border-black dark:bg-zinc-800 dark:text-white dark:border-zinc-600"
              />
            </div>
          </CardContent>
        </Card>
      ))}
    </main>
  );
}
