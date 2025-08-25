"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import {
  Accordion, AccordionItem, AccordionTrigger, AccordionContent,
} from "@/components/ui/accordion";

type TraderType = "rl" | "momentum" | "mean_reversion";
const typeKey = (t: TraderType) => (t === "rl" ? "rl" : t === "momentum" ? "mom" : "mr");

type BaseTrader = {
  id: string;
  type: TraderType;
  balance: number;
  assets: number;
  risk_aversion: number;
  is_user?: boolean;
  shorting_enabled?: boolean;
  max_long_units?: number;
  max_short_units?: number;
  base_qty?: number;
  limit_offset_pct?: number;
};

type RLFields = {
  learning_rate: number; gamma: number; epsilon: number;
  state_size: number; qty_bins: number[]; pct_bins: number[];
  hidden_size: number; huber_delta: number; batch_size: number;
  tau: number; replay_size: number; epsilon_decay: number; epsilon_min: number;
  random_state: number;
};

type MomentumFields = { mom_short: number; mom_long: number; entry_threshold: number; exit_threshold: number; };
type MRFields = { mr_lookback: number; mr_min_std: number; mr_entry_z: number; mr_exit_z: number; };
type TraderParam = BaseTrader & Partial<RLFields & MomentumFields & MRFields>;

export default function InitializeSimulation() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const playMode = (searchParams.get("play") ?? "true").toLowerCase() === "true";

  // counts per class
  const [numRL, setNumRL] = useState(10);
  const [numMomentum, setNumMomentum] = useState(5);
  const [numMR, setNumMR] = useState(5);
  const totalTraders = useMemo(() => numRL + numMomentum + numMR, [numRL, numMomentum, numMR]);

  // market settings
  const [initialPrice, setInitialPrice] = useState(100);
  const [initialQuantity, setInitialQuantity] = useState(1000);

  // user trader
  const [userId, setUserId] = useState("PARKER");
  const [userBalance, setUserBalance] = useState(1000);
  const [userAssets, setUserAssets] = useState(5);
  const [includeUserTrader, setIncludeUserTrader] = useState(playMode);

  // shorting
  const [allowShortSelling, setAllowShortSelling] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    const saved = localStorage.getItem("allow_short_selling");
    return saved ? saved === "true" : false;
  });

  const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "/api";
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("allow_short_selling", String(allowShortSelling));
    }
  }, [allowShortSelling]);

  // helpers
  const clampNum = (v: any, def = 0) => (Number.isFinite(v) ? v : def);
  const randomInRange = (min: number, max: number, decimals = 2) =>
    parseFloat((Math.random() * (max - min) + min).toFixed(decimals));
  const randomLogUniform = (minExp: number, maxExp: number, decimals = 6) => {
    const e = randomInRange(minExp, maxExp, 6);
    return parseFloat((10 ** e).toFixed(decimals));
  };

  // defaults
  const defaultCommon = (): Partial<BaseTrader> => ({
    shorting_enabled: allowShortSelling,
    max_long_units: 50,
    max_short_units: 50,
    base_qty: 2,
    limit_offset_pct: 0.002,
  });
  const defaultRL = (): RLFields => ({
    learning_rate: randomLogUniform(-4, -2, 6),
    gamma: randomInRange(0.95, 0.9995, 4),
    epsilon: randomInRange(0.1, 0.4, 2),
    state_size: 8, qty_bins: [1, 2, 5], pct_bins: [0.002, 0.005, 0.01],
    hidden_size: 64, huber_delta: 1.0, batch_size: 64, tau: 0.01,
    replay_size: 20000, epsilon_decay: 0.995, epsilon_min: 0.01,
    random_state: Math.floor(randomInRange(1, 1001, 6))
  });
  const defaultMomentum = (): MomentumFields => ({ mom_short: 3, mom_long: 10, entry_threshold: 0.003, exit_threshold: 0.0005 });
  const defaultMR = (): MRFields => ({ mr_lookback: 20, mr_min_std: 1e-3, mr_entry_z: 1.0, mr_exit_z: 0.25 });

  const buildTrader = (i: number, type: TraderType): TraderParam => {
    const base: BaseTrader = {
      id: `tmp_${i + 1}`,
      type, balance: 1000, assets: 10, risk_aversion: randomInRange(0.1, 1.0, 2),
      ...defaultCommon(),
    };
    if (type === "rl") return { ...base, ...defaultRL() };
    if (type === "momentum") return { ...base, ...defaultMomentum() };
    return { ...base, ...defaultMR() };
  };

  // initial roster
  const initialBots = useMemo<TraderParam[]>(() => {
    const bots: TraderParam[] = [];
    const pushN = (n: number, tp: TraderType) => {
      const start = bots.length;
      for (let k = 0; k < n; k++) bots.push(buildTrader(start + k, tp));
    };
    pushN(numRL, "rl"); pushN(numMomentum, "momentum"); pushN(numMR, "mean_reversion");
    return bots;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [traderParams, setTraderParams] = useState<TraderParam[]>(initialBots);

  // regen when counts or shorting change
  useEffect(() => {
    const bots: TraderParam[] = [];
    const pushN = (n: number, tp: TraderType) => {
      const start = bots.length;
      for (let k = 0; k < n; k++) bots.push(buildTrader(start + k, tp));
    };
    pushN(numRL, "rl"); pushN(numMomentum, "momentum"); pushN(numMR, "mean_reversion");
    setTraderParams(bots);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numRL, numMomentum, numMR, allowShortSelling]);

  const updateTrader = <K extends keyof TraderParam>(index: number, key: K, value: TraderParam[K]) => {
    setTraderParams((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [key]: value };
      return next;
    });
  };

  const changeType = (index: number, newType: TraderType) => {
    setTraderParams((prev) => {
      const t = prev[index];
      const kept: BaseTrader = {
        id: t.id, type: newType, balance: t.balance, assets: t.assets, risk_aversion: t.risk_aversion,
        is_user: false, shorting_enabled: allowShortSelling,
        max_long_units: t.max_long_units ?? 50, max_short_units: t.max_short_units ?? 50,
        base_qty: t.base_qty ?? 2, limit_offset_pct: t.limit_offset_pct ?? 0.002,
      };
      let seeded: TraderParam;
      if (newType === "rl") seeded = { ...kept, ...defaultRL() };
      else if (newType === "momentum") seeded = { ...kept, ...defaultMomentum() };
      else seeded = { ...kept, ...defaultMR() };
      const next = [...prev];
      next[index] = seeded;
      return next;
    });
  };

  const regenerateBots = () => {
    const bots: TraderParam[] = [];
    const pushN = (n: number, tp: TraderType) => {
      const start = bots.length;
      for (let k = 0; k < n; k++) bots.push(buildTrader(start + k, tp));
    };
    pushN(numRL, "rl"); pushN(numMomentum, "momentum"); pushN(numMR, "mean_reversion");
    setTraderParams(bots);
  };

  const handleSubmit = async () => {
    const stripUndefined = (obj: Record<string, any>) =>
      Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));

    const tradersList = [...traderParams];

    // add user only if play mode and toggled on
    if (playMode && includeUserTrader) {
      const userTrader: TraderParam = {
        id: userId || "USER",
        type: "rl",
        balance: clampNum(userBalance, 0),
        assets: clampNum(userAssets, 0),
        risk_aversion: 0.5,
        learning_rate: 0.01,
        gamma: 0.99,
        epsilon: 0.1,
        is_user: true,
        shorting_enabled: allowShortSelling,
      };
      localStorage.setItem("userTraderId", userTrader.id);
      tradersList.unshift(userTrader);
    }

    const counters: Record<TraderType, number> = { rl: 0, momentum: 0, mean_reversion: 0 };

    const payloadTraders = tradersList.map((t) => {
      if (t.is_user) {
        return stripUndefined({
          ...t,
          balance: clampNum(t.balance, 0),
          assets: clampNum(t.assets, 0),
          shorting_enabled: allowShortSelling,
        });
      }
      counters[t.type] += 1;
      const prefix = t.type === "mean_reversion" ? "MeanReversion" : t.type === "momentum" ? "Momentum" : "RL";
      const id = `${prefix}-${counters[t.type]}`;
      return stripUndefined({
        ...t,
        id,
        balance: clampNum(t.balance, 0),
        assets: clampNum(t.assets, 0),
        risk_aversion: clampNum(t.risk_aversion, t.risk_aversion ?? 0.5),
        is_user: false,
        shorting_enabled: allowShortSelling,
      });
    });

    const payload = stripUndefined({
      initial_price: clampNum(initialPrice, 1),
      initial_quantity: clampNum(initialQuantity, 0),
      allow_short_selling: allowShortSelling,
      short_selling_enabled: allowShortSelling,
      traders: payloadTraders,
    });

    const res = await fetch(`${API_URL}/init`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const json = await res.json();
    const token = json["token"];
    localStorage.setItem("last_state_token", token);
    router.push(`/dashboard?play=${playMode}`);
  };

  // import token dialog
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importToken, setImportToken] = useState("");

  const importHash = () => setIsImportOpen(true);

  const importDialog = null;

  useEffect(() => {
    if (isImportOpen) {
      const url = `/import?play=${playMode}`;
      router.push(url);
      setIsImportOpen(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isImportOpen]);

  // group by type for collapsible sections
  const groups: Record<TraderType, { label: string; items: [TraderParam, number][] }> = {
    rl: { label: "Reinforcement Learning Traders", items: [] },
    momentum: { label: "Momentum Traders", items: [] },
    mean_reversion: { label: "Mean-Reversion Traders", items: [] },
  };
  traderParams.forEach((t, idx) => groups[t.type].items.push([t, idx]));

  return (
    <main className="min-h-screen bg-white text-black dark:bg-zinc-950 dark:text-white px-6 py-8 font-mono">
      {importDialog}
      <h1 className="text-3xl font-bold mb-6 tracking-tight">Initialize Market Simulation</h1>

      {/* Your Trader — only when playMode is true */}
      {playMode && (
        <Card className="border border-blue-500 dark:border-blue-400 mb-6 bg-blue-50 dark:bg-zinc-800">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-blue-900 dark:text-blue-200">Your Trader</h2>
              <div className="flex items-center gap-2">
                <input
                  id="include-user-trader"
                  type="checkbox"
                  checked={includeUserTrader}
                  onChange={(e) => setIncludeUserTrader(e.target.checked)}
                  className="w-5 h-5 accent-blue-500 rounded border-2 border-blue-400 focus:ring-2 focus:ring-blue-300"
                />
                <Label htmlFor="include-user-trader" className="dark:text-zinc-300 mb-0">
                  Participate as Trader
                </Label>
              </div>
            </div>

            {includeUserTrader && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="user-id" className="dark:text-zinc-300 mb-1 block">
                      Self Trader Name
                    </Label>
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
                    <Label htmlFor="user-balance" className="dark:text-zinc-300 mb-1 block">
                      Initial Balance
                    </Label>
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
                    <Label htmlFor="user-assets" className="dark:text-zinc-300 mb-1 block">
                      Initial Position (Assets)
                    </Label>
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
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Global settings */}
      <Card className="border border-black dark:border-zinc-700 mb-6 bg-white dark:bg-zinc-900">
        <CardContent className="pt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label className="dark:text-zinc-300 mb-1"># RL Traders</Label>
            <Input
              type="number"
              value={numRL}
              min={0}
              onChange={(e) => setNumRL(Math.max(0, parseInt(e.target.value || "0", 10)))}
              className="bg-white text-black border border-black dark:bg-zinc-800 dark:text-white dark:border-zinc-600"
            />
          </div>
          <div>
            <Label className="dark:text-zinc-300 mb-1"># Momentum Traders</Label>
            <Input
              type="number"
              value={numMomentum}
              min={0}
              onChange={(e) => setNumMomentum(Math.max(0, parseInt(e.target.value || "0", 10)))}
              className="bg-white text-black border border-black dark:bg-zinc-800 dark:text-white dark:border-zinc-600"
            />
          </div>
          <div>
            <Label className="dark:text-zinc-300 mb-1"># Mean-Reversion Traders</Label>
            <Input
              type="number"
              value={numMR}
              min={0}
              onChange={(e) => setNumMR(Math.max(0, parseInt(e.target.value || "0", 10)))}
              className="bg-white text-black border border-black dark:bg-zinc-800 dark:text-white dark:border-zinc-600"
            />
          </div>

          <div>
            <Label className="dark:text-zinc-300 mb-1">Total Traders</Label>
            <Input
              type="number"
              value={totalTraders}
              readOnly
              className="bg-zinc-100 text-black border border-black dark:bg-zinc-800 dark:text-white dark:border-zinc-600"
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
          <div className="flex items-center gap-2 mt-6 ml-1">
            <input
              id="allow-short-selling"
              type="checkbox"
              checked={allowShortSelling}
              onChange={(e) => setAllowShortSelling(e.target.checked)}
              className="w-7 h-7 accent-blue-500 rounded border-2 border-blue-400 focus:ring-2 focus:ring-blue-300 transition-all"
            />
            <Label htmlFor="allow-short-selling" className="dark:text-zinc-300 mb-0 pl-2 text-lg">
              Allow Short Selling
            </Label>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3 mb-6">
        <h2 className="text-xl font-semibold">Trader Parameters</h2>
        <Button onClick={importHash} className="px-4 py-2 rounded bg-green-600 hover:bg-green-800 text-white font-medium shadow dark:shadow-md">
          Import from Token
        </Button>
        <Button variant="secondary" onClick={regenerateBots} className="hover:bg-zinc-300 dark:hover:bg-zinc-600">
          Regenerate Parameters
        </Button>
        <Button onClick={handleSubmit} className="px-4 py-2 rounded bg-blue-500 hover:bg-blue-600 text-white font-medium shadow dark:shadow-md">
          Initialize and Launch
        </Button>
      </div>

      {/* Collapsible sections per type */}
      <Accordion type="multiple" defaultValue={["rl", "momentum", "mean_reversion"]} className="mb-6">
        {(["rl", "momentum", "mean_reversion"] as TraderType[]).map((tp) => (
          <AccordionItem key={tp} value={tp} className="border border-black dark:border-zinc-700 rounded-xl mb-4">
            <AccordionTrigger className="px-4 py-3 text-lg">
              {groups[tp].label} <span className="ml-2 opacity-70 text-sm">({groups[tp].items.length})</span>
            </AccordionTrigger>
            <AccordionContent className="p-4 space-y-4">
              {groups[tp].items.length === 0 && (
                <p className="text-sm opacity-70">No traders of this type. Adjust counts above or change a trader’s type.</p>
              )}
              {groups[tp].items.map(([t, i]) => (
                <Card key={`${t.type}_${i}`} className="border border-black dark:border-zinc-700 bg-white dark:bg-zinc-900">
                  <CardContent className="pt-4">
                    <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
                      <div className="md:col-span-2">
                        <Label className="dark:text-zinc-300 mb-1">
                          Type (Name will be {typeKey(t.type)}_{i + 1})
                        </Label>
                        <Select value={t.type} onValueChange={(v) => changeType(i, v as TraderType)}>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Strategy type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="rl">Reinforcement Learning</SelectItem>
                            <SelectItem value="momentum">Momentum</SelectItem>
                            <SelectItem value="mean_reversion">Mean Reversion</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label className="dark:text-zinc-300 mb-1">Balance</Label>
                        <Input
                          type="number"
                          value={t.balance}
                          onChange={(e) => updateTrader(i, "balance", parseFloat(e.target.value))}
                          className="bg-white text-black border border-black dark:bg-zinc-800 dark:text-white dark:border-zinc-600"
                        />
                      </div>
                      <div>
                        <Label className="dark:text-zinc-300 mb-1">Assets</Label>
                        <Input
                          type="number"
                          value={t.assets}
                          onChange={(e) => updateTrader(i, "assets", parseFloat(e.target.value))}
                          className="bg-white text-black border border-black dark:bg-zinc-800 dark:text-white dark:border-zinc-600"
                        />
                      </div>
                      <div>
                        <Label className="dark:text-zinc-300 mb-1">Risk Aversion</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={t.risk_aversion}
                          onChange={(e) => updateTrader(i, "risk_aversion", parseFloat(e.target.value))}
                          className="bg-white text-black border border-black dark:bg-zinc-800 dark:text-white dark:border-zinc-600"
                        />
                      </div>
                      <div>
                        <Label className="dark:text-zinc-300 mb-1">Max Long</Label>
                        <Input
                          type="number"
                          value={t.max_long_units ?? 50}
                          onChange={(e) => updateTrader(i, "max_long_units", parseInt(e.target.value || "0", 10))}
                          className="bg-white text-black border border-black dark:bg-zinc-800 dark:text-white dark:border-zinc-600"
                        />
                      </div>
                      <div>
                        <Label className="dark:text-zinc-300 mb-1">Max Short</Label>
                        <Input
                          type="number"
                          value={t.max_short_units ?? 50}
                          onChange={(e) => updateTrader(i, "max_short_units", parseInt(e.target.value || "0", 10))}
                          className="bg-white text-black border border-black dark:bg-zinc-800 dark:text-white dark:border-zinc-600"
                        />
                      </div>
                    </div>

                    <details open className="mt-3">
                      <summary className="cursor-pointer select-none text-sm opacity-80">Advanced Parameters</summary>
                      <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-4">
                        {t.type === "rl" && (
                          <>
                            <div>
                              <Label className="dark:text-zinc-300 mb-1">Learning Rate</Label>
                              <Input
                                type="number"
                                step="0.000001"
                                value={t.learning_rate ?? 0.01}
                                onChange={(e) => updateTrader(i, "learning_rate", parseFloat(e.target.value))}
                                className="bg-white text-black border border-black dark:bg-zinc-800 dark:text-white dark:border-zinc-600"
                              />
                            </div>
                            <div>
                              <Label className="dark:text-zinc-300 mb-1">Gamma</Label>
                              <Input
                                type="number"
                                step="0.0001"
                                value={t.gamma ?? 0.99}
                                onChange={(e) => updateTrader(i, "gamma", parseFloat(e.target.value))}
                                className="bg-white text-black border border-black dark:bg-zinc-800 dark:text-white dark:border-zinc-600"
                              />
                            </div>
                            <div>
                              <Label className="dark:text-zinc-300 mb-1">Epsilon</Label>
                              <Input
                                type="number"
                                step="0.01"
                                value={t.epsilon ?? 0.1}
                                onChange={(e) => updateTrader(i, "epsilon", parseFloat(e.target.value))}
                                className="bg-white text-black border border-black dark:bg-zinc-800 dark:text-white dark:border-zinc-600"
                              />
                            </div>
                            <div>
                              <Label className="dark:text-zinc-300 mb-1">Hidden Size</Label>
                              <Input
                                type="number"
                                value={t.hidden_size ?? 64}
                                onChange={(e) => updateTrader(i, "hidden_size", parseInt(e.target.value || "0", 10))}
                                className="bg-white text-black border border-black dark:bg-zinc-800 dark:text-white dark:border-zinc-600"
                              />
                            </div>
                            <div>
                              <Label className="dark:text-zinc-300 mb-1">Batch Size</Label>
                              <Input
                                type="number"
                                value={t.batch_size ?? 64}
                                onChange={(e) => updateTrader(i, "batch_size", parseInt(e.target.value || "0", 10))}
                                className="bg-white text-black border border-black dark:bg-zinc-800 dark:text-white dark:border-zinc-600"
                              />
                            </div>
                            <div>
                              <Label className="dark:text-zinc-300 mb-1">Tau</Label>
                              <Input
                                type="number"
                                step="0.0001"
                                value={t.tau ?? 0.01}
                                onChange={(e) => updateTrader(i, "tau", parseFloat(e.target.value))}
                                className="bg-white text-black border border-black dark:bg-zinc-800 dark:text-white dark:border-zinc-600"
                              />
                            </div>
                            <div>
                              <Label className="dark:text-zinc-300 mb-1">Random State</Label>
                              <Input
                                type="number"
                                step="1"
                                value={t.random_state ?? 17}
                                onChange={(e) => updateTrader(i, "random_state", parseInt(e.target.value))}
                                className="bg-white text-black border border-black dark:bg-zinc-800 dark:text-white dark:border-zinc-600"
                              />
                            </div>
                          </>
                        )}

                        {t.type === "momentum" && (
                          <>
                            <div>
                              <Label className="dark:text-zinc-300 mb-1">Short Lookback</Label>
                              <Input
                                type="number"
                                value={t.mom_short ?? 3}
                                onChange={(e) => updateTrader(i, "mom_short", parseInt(e.target.value || "0", 10))}
                                className="bg-white text-black border border-black dark:bg-zinc-800 dark:text-white dark:border-zinc-600"
                              />
                            </div>
                            <div>
                              <Label className="dark:text-zinc-300 mb-1">Long Lookback</Label>
                              <Input
                                type="number"
                                value={t.mom_long ?? 10}
                                onChange={(e) => updateTrader(i, "mom_long", parseInt(e.target.value || "0", 10))}
                                className="bg-white text-black border border-black dark:bg-zinc-800 dark:text-white dark:border-zinc-600"
                              />
                            </div>
                            <div>
                              <Label className="dark:text-zinc-300 mb-1">Entry Threshold</Label>
                              <Input
                                type="number"
                                step="0.0001"
                                value={t.entry_threshold ?? 0.003}
                                onChange={(e) => updateTrader(i, "entry_threshold", parseFloat(e.target.value))}
                                className="bg-white text-black border border-black dark:bg-zinc-800 dark:text-white dark:border-zinc-600"
                              />
                            </div>
                            <div>
                              <Label className="dark:text-zinc-300 mb-1">Exit Threshold</Label>
                              <Input
                                type="number"
                                step="0.0001"
                                value={t.exit_threshold ?? 0.0005}
                                onChange={(e) => updateTrader(i, "exit_threshold", parseFloat(e.target.value))}
                                className="bg-white text-black border border-black dark:bg-zinc-800 dark:text-white dark:border-zinc-600"
                              />
                            </div>
                          </>
                        )}

                        {t.type === "mean_reversion" && (
                          <>
                            <div>
                              <Label className="dark:text-zinc-300 mb-1">Lookback</Label>
                              <Input
                                type="number"
                                value={t.mr_lookback ?? 20}
                                onChange={(e) => updateTrader(i, "mr_lookback", parseInt(e.target.value || "0", 10))}
                                className="bg-white text-black border border-black dark:bg-zinc-800 dark:text-white dark:border-zinc-600"
                              />
                            </div>
                            <div>
                              <Label className="dark:text-zinc-300 mb-1">Entry Z</Label>
                              <Input
                                type="number"
                                step="0.01"
                                value={t.mr_entry_z ?? 1.0}
                                onChange={(e) => updateTrader(i, "mr_entry_z", parseFloat(e.target.value))}
                                className="bg-white text-black border border-black dark:bg-zinc-800 dark:text-white dark:border-zinc-600"
                              />
                            </div>
                            <div>
                              <Label className="dark:text-zinc-300 mb-1">Exit Z</Label>
                              <Input
                                type="number"
                                step="0.01"
                                value={t.mr_exit_z ?? 0.25}
                                onChange={(e) => updateTrader(i, "mr_exit_z", parseFloat(e.target.value))}
                                className="bg-white text-black border border-black dark:bg-zinc-800 dark:text-white dark:border-zinc-600"
                              />
                            </div>
                          </>
                        )}
                      </div>
                    </details>
                  </CardContent>
                </Card>
              ))}
            </AccordionContent>
          </AccordionItem>
        ))}
        <div className="h-4" />
      </Accordion>
    </main>
  );
}
