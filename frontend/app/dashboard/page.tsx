"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, ReferenceLine
} from "recharts";
import { saveAs } from "file-saver";
import JSZip from "jszip";

const DATA_KEYS = ["price", "volume", "volatility"];

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "/api";

const WS_URL =
  process.env.NEXT_PUBLIC_WS_URL ??
  (typeof window !== "undefined"
    ? `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`
    : ""); 

// -------- utils --------
function decimate<T>(arr: T[], maxPoints: number): T[] {
  if (arr.length <= maxPoints) return arr;
  const stride = Math.ceil(arr.length / maxPoints);
  const out: T[] = [];
  for (let i = 0; i < arr.length; i += stride) out.push(arr[i]);
  if (out[out.length - 1] !== (arr as any)[arr.length - 1]) out.push((arr as any)[arr.length - 1]);
  return out;
}

const normBookSide = (side: any[]): { price: number; quantity: number }[] =>
  Array.isArray(side)
    ? side
        .map((r: any) => ({ price: Number(r.price), quantity: Number(r.quantity) }))
        .filter((r) => Number.isFinite(r.price) && Number.isFinite(r.quantity) && r.quantity > 0)
    : [];

// -------- modal --------
function Modal({
  open,
  onClose,
  children,
  title,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute inset-x-0 top-14 mx-auto w-[95%] max-w-4xl rounded-2xl shadow-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900">
        <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-200 dark:border-zinc-800">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            Close
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export default function SimulationDashboard() {
  const [simulationRunning, setSimulationRunning] = useState(false);
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>(["price"]);
  const toggleMetric = (key: string) =>
    setSelectedMetrics((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  const [liveData, setLiveData] = useState<any[]>([]);
  const [fullData, setFullData] = useState<any[]>([]);
  const [trades, setTrades] = useState<any[]>([]);
  const socketRef = useRef<WebSocket | null>(null);
  const [darkMode, setDarkMode] = useState(false);
  const [orderbook, setOrderbook] = useState<any>({ bids: [], asks: [] });
  const [zoomOut, setZoomOut] = useState(false);
  const [userTraderId, setUserTraderId] = useState<string | null>(null);

  // NEW: user participation toggle (persisted)
  const [userParticipation, setUserParticipation] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const raw = localStorage.getItem("userParticipation");
    return raw === null ? true : raw === "true";
  });

  // modal state
  const [selectedTraderId, setSelectedTraderId] = useState<string | null>(null);
  const [traderModalOpen, setTraderModalOpen] = useState(false);

  // initial params cache (from Initialize page: store `init_traders` there)
  const [initParamsById, setInitParamsById] = useState<Record<string, any>>({});
  useEffect(() => {
    const savedUser = typeof window !== "undefined" ? localStorage.getItem("userTraderId") : null;
    if (savedUser) setUserTraderId(savedUser);

    const rawInit = typeof window !== "undefined" ? localStorage.getItem("init_traders") : null;
    if (rawInit) {
      try {
        const arr = JSON.parse(rawInit);
        const map: Record<string, any> = {};
        for (const t of arr) map[t.id] = t;
        setInitParamsById(map);
      } catch {}
    }
  }, []);

  useEffect(() => {
    if (darkMode) document.documentElement.classList.add("dark");
    else document.documentElement.classList.remove("dark");
  }, [darkMode]);

  // Persist + (optional) inform backend about participation
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("userParticipation", String(userParticipation));
    }
  }, [userParticipation]);

  const MAX_SNIPPET = 100;
  const MAX_TRADES_SNIPPET = 50;
  const MAX_FULL = 50000;
  const MAX_DRAW_POINTS = 5000;

  const SERIES_COLORS: Record<string, string> = {
    price: "#2563eb",      // blue-600
    volume: "#16a34a",     // green-600
    volatility: "#dc2626", // red-600
  };
  
  useEffect(() => {
    if (simulationRunning) {
      socketRef.current = new WebSocket(WS_URL);

      socketRef.current.onmessage = (event) => {
        const data = JSON.parse(event.data);

        setLiveData((prev) => [...prev.slice(-(MAX_SNIPPET - 1)), data]);

        setFullData((prev) => {
          if (prev.length < MAX_FULL) return [...prev, data];
          return [...prev.slice(-(MAX_FULL - 1)), data];
        });

        if (data.trades && Array.isArray(data.trades)) {
          setTrades((prev) => [...prev.slice(-(MAX_TRADES_SNIPPET - 1)), ...data.trades]);
        }
        if (data.orderbook_snapshot) setOrderbook(data.orderbook_snapshot);
      };

      socketRef.current.onerror = (err) => console.error("WebSocket error:", err);
      socketRef.current.onclose = () => console.log("WebSocket closed");
    } else {
      socketRef.current?.close();
      socketRef.current = null;
    }
    return () => socketRef.current?.close();
  }, [simulationRunning]);

  const handleStartPause = () => setSimulationRunning((prev) => !prev);

  const handleReset = async () => {
    try {
      await fetch(`${API_URL}/reset`, { method: "POST" });

      setLiveData([]);
      setFullData([]);
      setTrades([]);
      setOrderbook({ bids: [], asks: [] });
      setSimulationRunning(false);
    } catch (error) {
      console.error("Error resetting simulation:", error);
    }
  };

  const handleDownload = () => {
    const zip = new JSZip();

    // Market history
    const marketHeaders = "time_step,price,volume,volatility";
    const marketRows = fullData.map((d) => `${d.time_step},${d.price},${d.volume},${d.volatility}`);
    zip.file("market_history.csv", [marketHeaders, ...marketRows].join("\n"));

    // Trader history
    const traderLines: string[] = ["time_step,trader_id,pnl,win_rate,balance,assets,alpha_pnl,max_drawdown_pct"];
    fullData.forEach((d) => {
      Object.entries(d.traders || {}).forEach(([id, t]) => {
        const r: any = t;
        traderLines.push(
          `${d.time_step},${id},${r.pnl},${r.win_rate},${r.balance},${r.assets},${r.alpha_pnl ?? ""},${r.max_drawdown_pct ?? ""}`
        );
      });
    });
    zip.file("trader_history.csv", traderLines.join("\n"));

    // Trade history
    const tradeLines = ["time_step,buyer,seller,quantity,price"];
    trades.forEach((t) => {
      tradeLines.push(`${t.time_step},${t.buyer},${t.seller},${t.quantity},${t.price}`);
    });
    zip.file("trade_history.csv", tradeLines.join("\n"));

    zip.generateAsync({ type: "blob" }).then((content: Blob) => {
      saveAs(content, "simulation_export.zip");
    });
  };

  // latest snapshot
  const latest = fullData.length ? fullData[fullData.length - 1] : null;
  const user = userTraderId ? latest?.traders?.[userTraderId] : null;

  // sorted best bid/ask
  const sortedBids = normBookSide(orderbook.bids).sort((a, b) => b.price - a.price);
  const sortedAsks = normBookSide(orderbook.asks).sort((a, b) => a.price - b.price);
  const bestBid = sortedBids[0]?.price ?? null;
  const bestAsk = sortedAsks[0]?.price ?? null;

  const processUserTrade = (side: "buy" | "sell", px?: number) => {
    if (!userParticipation) return; // guard when participation is OFF
    const price = px ?? (side === "buy" ? bestAsk : bestBid);
    if (price == null) {
      console.error("No liquidity (missing best bid/ask).");
      return;
    }
    const trade = {
      trader_id: userTraderId ?? "USER",
      type: side,
      price,
      quantity: 1,
    };
    fetch(`${API_URL}/user_trade`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(trade),
    }).catch((err) => console.error("User Trade Error:", err));
  };

  // chart data
  const chartData = useMemo(() => {
    const base = zoomOut ? decimate(fullData, MAX_DRAW_POINTS) : liveData;
    if (!base.length) return base;

    // price range
    const pMin = Math.min(...base.map(d => Number(d.price)));
    const pMax = Math.max(...base.map(d => Number(d.price)));

    // volume & vol ranges
    const vMin = Math.min(...base.map(d => Number(d.volume)));
    const vMax = Math.max(...base.map(d => Number(d.volume)));
    const volMin = Math.min(...base.map(d => Number(d.volatility)));
    const volMax = Math.max(...base.map(d => Number(d.volatility)));

    // attach scaled series
    return base.map(d => ({
      ...d,
      volume_rel: scaleToRange(Number(d.volume), [vMin, vMax], [pMin, pMax]),
      volatility_rel: scaleToRange(Number(d.volatility), [volMin, volMax], [pMin, pMax]),
    }));
  }, [zoomOut, fullData, liveData]);

  // order book utils
  type Level = { price: number; bid: number; ask: number; priceLabel: string };

  function roundPrice(px: number, tick = 0.01) {
    return Math.round(px / tick) * tick;
  }

  function buildDepthData(
    book: { bids: any[]; asks: any[] },
    { levels = 20, tick = 0.01 }: { levels?: number; tick?: number } = {}
  ): Level[] {
    const bids = normBookSide(book.bids).sort((a, b) => b.price - a.price).slice(0, levels);
    const asks = normBookSide(book.asks).sort((a, b) => a.price - b.price).slice(0, levels);

    // bucket by tick per side
    const bidMap = new Map<number, number>();
    for (const r of bids) {
      const p = roundPrice(r.price, tick);
      bidMap.set(p, (bidMap.get(p) ?? 0) + r.quantity);
    }
    const askMap = new Map<number, number>();
    for (const r of asks) {
      const p = roundPrice(r.price, tick);
      askMap.set(p, (askMap.get(p) ?? 0) + r.quantity);
    }

    // cumulative from best outward
    const cumBid = new Map<number, number>();
    {
      let run = 0;
      const arr = Array.from(bidMap.entries()).sort((a, b) => b[0] - a[0]);
      for (const [p, q] of arr) {
        run += q;
        cumBid.set(p, -run);
      }
    }
    const cumAsk = new Map<number, number>();
    {
      let run = 0;
      const arr = Array.from(askMap.entries()).sort((a, b) => a[0] - b[0]);
      for (const [p, q] of arr) {
        run += q;
        cumAsk.set(p, run);
      }
    }

    // merge
    const allPrices = Array.from(new Set([...cumBid.keys(), ...cumAsk.keys()])).sort((a, b) => a - b);
    return allPrices.map((price) => ({
      price,
      bid: cumBid.get(price) ?? 0,
      ask: cumAsk.get(price) ?? 0,
      priceLabel: price.toFixed(2),
    }));
  }

  // trader details
  const selectedTraderParams = selectedTraderId ? initParamsById[selectedTraderId] : null;
  function scaleToRange(x: number, [aMin, aMax]: [number, number], [bMin, bMax]: [number, number]) {
    if (!Number.isFinite(x) || aMax === aMin) return (bMin + bMax) / 2;
    return bMin + ((x - aMin) * (bMax - bMin)) / (aMax - aMin);
  }

  const traderSeries = useMemo(() => {
    if (!selectedTraderId) return [];
    return fullData
      .map((d) => {
        const t = d.traders?.[selectedTraderId];
        if (!t) return null;
        return {
          time_step: d.time_step,
          pnl: typeof t.pnl === "number" ? t.pnl : null,
          alpha_pnl: typeof t.alpha_pnl === "number" ? t.alpha_pnl : null,
          balance: t.balance,
          assets: t.assets,
          win_rate: t.win_rate,
          max_dd: t.max_drawdown_pct,
        };
      })
      .filter(Boolean) as any[];
  }, [selectedTraderId, fullData]);

  const depthData = useMemo(() => buildDepthData(orderbook, { levels: 20, tick: 0.01 }), [orderbook]);

  const openTraderModal = (id: string) => {
    setSelectedTraderId(id);
    setTraderModalOpen(true);
  };

  const renderTraderStats = () => {
    if (fullData.length === 0) return null;
    const latestLocal = fullData[fullData.length - 1];
    const entries = Object.entries(latestLocal?.traders || {});
    const sortedTraders = entries.sort((a, b) => {
      const A = a[1] as any, B = b[1] as any;
      return (B.pnl || 0) - (A.pnl || 0);
    });

    return (
      <div className="space-y-1 overflow-y-auto pr-2" style={{ maxHeight: 240 }}>
        {sortedTraders.map(([id, t]) => {
          const trader = t as any;
          const color = trader.pnl >= 0 ? "text-green-700" : "text-red-700";
          return (
            <div
              key={id}
              className="flex justify-between items-center text-sm border-b border-gray-200 pb-1"
            >
              <button
                onClick={() => openTraderModal(id)}
                className="text-left text-blue-600 dark:text-blue-300 hover:underline whitespace-nowrap overflow-hidden text-ellipsis mr-2"
                title="View details"
              >
                {id}
              </button>
              <span className={`${color} whitespace-nowrap mr-2`}>
                P&L: ${typeof trader.pnl === "number" ? trader.pnl.toFixed(2) : "0.00"}
              </span>
              <span className="whitespace-nowrap">
                Win Rate: {typeof trader.win_rate === "number" ? trader.win_rate.toFixed(2) : "0.00"}
              </span>
              <span className="whitespace-nowrap">
                Max Drawdown:{" "}
                {typeof trader.max_drawdown_pct === "number" ? trader.max_drawdown_pct.toFixed(2) : "0.00"}
              </span>
              <span className="whitespace-nowrap">
                Position: {typeof trader.assets === "number" ? trader.assets.toFixed() : "0.00"}
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  const totalVolume = trades.reduce((s, t) => s + (t.quantity || 0), 0);
  const vwap = totalVolume > 0 ? trades.reduce((s, t) => s + t.price * t.quantity, 0) / totalVolume : null;
  const firstPrice = fullData[0]?.price ?? null;
  const priceChangePct = latest && firstPrice ? ((latest.price - firstPrice) / firstPrice) * 100 : null;
  const sortedBidsTop10 = sortedBids.slice(0, 10);
  const sortedAsksTop10 = sortedAsks.slice(0, 10);
  const liquidityDepth =
    sortedBidsTop10.reduce((s, b) => s + b.quantity, 0) +
    sortedAsksTop10.reduce((s, a) => s + a.quantity, 0);
  const recentVol =
    liveData.length > 1
      ? Math.sqrt(
          liveData.reduce((sum, d) => sum + Math.pow(d.price - (latest?.price ?? d.price), 2), 0) /
            liveData.length
        )
      : null;

  // NOTE: second Modal definition exists below in your original; keeping it to avoid broad refactors.
  function Modal({
    open,
    onClose,
    children,
    title,
  }: {
    open: boolean;
    onClose: () => void;
    children: React.ReactNode;
    title?: string;
  }) {
    if (!open) return null;
    return (
      <div className="fixed inset-0 z-50">
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
        <div className="absolute inset-4 md:inset-8">
          <div className="h-full w-full rounded-2xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-800">
              <h3 className="text-lg font-semibold">{title}</h3>
              <button
                onClick={onClose}
                className="rounded-md px-2 py-1 text-sm border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                Close
              </button>
            </div>
            <div className="p-6 overflow-auto h-[calc(100%-56px)]">
              {children}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const handleCloseTraderModal = () => {
    setTraderModalOpen(false);
    setSelectedTraderId(null);
  };

  // Toggle handler
  const toggleParticipation = () => setUserParticipation((p) => !p);

  return (
    <main className="min-h-screen bg-white text-black dark:bg-zinc-900 dark:text-white px-6 py-8 font-mono">
      <div
        className={`border rounded-lg p-4 flex justify-between items-end mb-6 bg-white dark:bg-zinc-900 ${
          darkMode ? "border-white" : "border-black"
        }`}
      >
        <h1 className="text-3xl font-bold tracking-tight">Trading Simulation</h1>
        <div>
          <Link href="/" className="text-black-600 hover:underline dark:text-white mr-4">
            Home
          </Link>
          <Link href="/about" className="text-black-600 hover:underline dark:text-white mr-4">
            About
          </Link>
          <Link href="/docs" className="text-black-600 hover:underline dark:text-white">
            API
          </Link>
        </div>
      </div>

      {/* Controls */}
      <div className="flex justify-between mb-6">
        <div className="flex gap-4">
          <Link href="/initialize">
            <Button className="bg-blue-500 hover:bg-blue-600 border border-blue-600 text-white">Configure</Button>
          </Link>

          <Button
            onClick={handleStartPause}
            className={`${simulationRunning ? "bg-red-500 hover:bg-red-700" : "bg-green-500 hover:bg-green-700"} text-white dark:text-black`}
          >
            {simulationRunning ? "Pause" : "Start"}
            </Button>
            <Button
            variant="outline"
            onClick={handleReset}
            className={`bg-black border-black text-white hover:bg-gray-800 ${
              darkMode ? "bg-white border-white hover:bg-gray-200" : ""
            }`}
            >
            Reset
            </Button>

          <Button
            variant="outline"
            onClick={handleDownload}
            className="bg-gray-500 text-white border-gray-600 hover:bg-gray-600 dark:bg-gray-700 dark:text:white dark:border-gray-800 dark:hover:bg-gray-800"
          >
            Download CSV
          </Button>

          <div className="flex-1" />

          {/* Chart options */}
          <div className="absolute right-6 flex items-center space-x-2">
            <div className="text-sm font-semibold mr-2 my-auto">Chart:</div>
            {DATA_KEYS.map((key) => {
              const active = selectedMetrics.includes(key);
              return (
                <Button
                  key={key}
                  variant={active ? "default" : "outline"}
                  onClick={() => toggleMetric(key)}
                  className={`text-xs px-3 py-1 h-8 ${active ? "bg-blue-500 text-white" : "border-gray-300 dark:border-gray-600"}`}
                >
                  {key.charAt(0).toUpperCase() + key.slice(1)}
                </Button>
              );
            })}
            <Button
              variant="outline"
              onClick={() => setZoomOut((z) => !z)}
              className="text-xs px-3 py-1 h-8 border-gray-300 dark:border-gray-600"
              title="Toggle between full history and recent snippet"
            >
              Toggle Zoom
            </Button>
          </div>
        </div>
      </div>

      {/* Chart */}
      <Card className="border border-black dark:border-white mb-6 bg:white dark:bg-zinc-800">
        <CardContent className="pt-4">
        <h2 className="text-xl font-semibold mb-2">
          {selectedMetrics.length ? selectedMetrics.map(s => s.toUpperCase()).join(", ") : "No Series Selected"} Over Time {zoomOut ? "(Full)" : "(Recent)"}
        </h2>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <XAxis dataKey="time_step" axisLine={false} tickLine={false} tick={false} />
              <YAxis domain={["auto", "auto"]} allowDataOverflow={false} tickCount={8} type="number" allowDecimals />
              <Tooltip />
              <Legend />
              {selectedMetrics.map((key) => {
                const isPrice = key === "price";
                const dataKey = isPrice ? "price" : `${key}_rel`;
                const name = isPrice ? "Price" : `${key[0].toUpperCase() + key.slice(1)} (rel)`;
                return (
                  <Line
                    key={key}
                    type="monotone"
                    dataKey={dataKey}
                    name={name}
                    stroke={SERIES_COLORS[key] ?? (darkMode ? "#fff" : "#000")}
                    strokeWidth={2}
                    isAnimationActive={false}
                    dot={!zoomOut}
                  />
                );
              })}
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Traders & Trades */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="border border-black dark:border-white bg:white dark:bg-zinc-800">
          <CardContent className="pt-4">
            <h2 className="text-xl font-semibold mb-2">Trader Statistics</h2>
            {renderTraderStats()}
          </CardContent>
        </Card>

        <Card className="border border-black dark:border-white bg:white dark:bg-zinc-800">
          <CardContent className="pt-4 h-full overflow-y-auto max-h-[300px]">
            <h2 className="text-xl font-semibold mb-2">Trade History</h2>
            <div className="grid grid-cols-4 font-bold border-b border-black dark:border-white pb-1 mb-1 text-sm">
              <div>Buyer</div>
              <div>Seller</div>
              <div>Quantity @ Price</div>
              <div>Time Step</div>
            </div>
            <div className="flex flex-col gap-2 text-sm">
              {trades.length > 0 ? (
                trades
                  .slice(-Math.floor(300 / 36))
                  .reverse()
                  .map((trade, idx) => (
                    <div key={idx} className="grid grid-cols-4 border-b border-gray-200 dark:border-zinc-700 py-1">
                      <div className="font-bold">{trade.buyer ?? "--"}</div>
                      <div className="font-bold">{trade.seller ?? "--"}</div>
                      <div>
                        {trade.quantity} @ ${typeof trade.price === "number" ? trade.price.toFixed(2) : "0.00"}
                      </div>
                      <div>{trade.time_step}</div>
                    </div>
                  ))
              ) : (
                <div className="text-gray-500 italic dark:text-zinc-400">No trades yet</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="my-6 grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
        {/* Order Book Depth */}
        <Card className="border border-black dark:border:white bg:white dark:bg-zinc-900 h-[420px]">
          <CardContent className="py-4 px-4 h-full flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold text-lg">Order Book Depth (Top 20 levels each side)</span>
              <div className="text-sm text-zinc-500">
                {bestBid != null && bestAsk != null ? (
                  <>Mid: {(0.5 * (bestBid + bestAsk)).toFixed(2)} | Spread: {(bestAsk - bestBid).toFixed(2)}</>
                ) : <>No quotes</>}
              </div>
            </div>

            <div className="flex-1 min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={depthData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                  <XAxis
                    dataKey="priceLabel"
                    tick={{ fontSize: 11 }}
                    interval="preserveStartEnd"
                    minTickGap={16}
                  />
                  <YAxis
                    domain={['dataMin', 'dataMax']}
                    tickFormatter={(v) => Math.abs(Number(v)).toFixed(0)}
                    tick={{ fontSize: 11 }}
                  />
                  <Tooltip
                    formatter={(val: any, key) => [Math.abs(Number(val)).toFixed(2), typeof key === "string" ? key.toUpperCase() : String(key)]}
                    labelFormatter={(label) => `Price: ${label}`}
                  />
                  <ReferenceLine y={0} stroke={darkMode ? '#fff' : '#000'} strokeOpacity={0.35} />
                  <Bar dataKey="bid" name="Bid Depth" stackId="depth" isAnimationActive={false} fill="#16a34a" />
                  <Bar dataKey="ask" name="Ask Depth" stackId="depth" isAnimationActive={false} fill="#dc2626" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Best bid / ask badges */}
            <div className="mt-3 flex gap-6 text-base">
              <div>
                <span className="font-semibold">Best Bid: </span>
                <span className="text-green-600 dark:text-green-300">
                  {bestBid != null ? `$${bestBid.toFixed(2)}` : '--'}
                </span>
              </div>
              <div>
                <span className="font-semibold">Best Ask: </span>
                <span className="text-red-600 dark:text-red-300">
                  {bestAsk != null ? `$${bestAsk.toFixed(2)}` : '--'}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* User Trader (toggleable) */}
        {userParticipation ? (
          <Card className="border border-black dark:border:white bg:white dark:bg-zinc-900 h-[420px]">
            <CardContent className="pt-6 h-full flex flex-col md:flex-row items-stretch justify-between gap-8">
              <div className="flex-1 flex flex-col gap-4 items-center md:items-start justify-center">
                <div>
                  <span className="text-3xl font-bold">Bid: </span>
                  <span className="text-3xl font-bold text-green-600 dark:text-green-300">
                    {bestBid != null ? `$${bestBid.toFixed(2)}` : "--"}
                  </span>
                </div>
                <div>
                  <span className="text-3xl font-bold">Ask: </span>
                  <span className="text-3xl font-bold text-red-600 dark:text-red-300">
                    {bestAsk != null ? `$${bestAsk.toFixed(2)}` : "--"}
                  </span>
                </div>
              </div>

              <div className="flex-1 flex flex-col gap-4 items-center md:items-center justify-center mr-8 md:mr-20">
                <div className="mb-2">
                  <span className="text-3xl font-bold">Cash: </span>
                  <span className="text-3xl font-bold text-blue-600 dark:text-blue-300">
                    {typeof user?.balance === "number" ? `$${user.balance.toFixed(2)}` : "--"}
                  </span>
                </div>
                <div>
                  <span className="text-3xl font-bold">Position: </span>
                  <span className="text-3xl font-bold text-green-600 dark:text-green-300">
                    {typeof user?.assets === "number" ? user.assets : "--"}
                  </span>
                </div>
              </div>

              <div className="flex-1 flex flex-col gap-6 items-center justify-center">
                <div className="flex flex-col gap-6 w-full">
                  <Button
                    className="bg-green-600 hover:bg-green-700 text-white text-3xl rounded-xl font-bold w-full h-20"
                    onClick={() => processUserTrade("buy")}
                    disabled={!latest}
                    style={{ minWidth: 180, minHeight: 80 }}
                  >
                    Buy
                  </Button>
                  <Button
                    className="bg-red-600 hover:bg-red-700 text-white text-3xl rounded-xl font-bold w-full h-20"
                    onClick={() => processUserTrade("sell")}
                    disabled={!latest}
                    style={{ minWidth: 180, minHeight: 80 }}
                  >
                    Sell
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="border border-black dark:border:white bg:white dark:bg-zinc-900 h-[420px]">
            <CardContent className="h-full flex items-center justify-center">
              <div className="text-center">
                <div className="font-semibold mb-2">User participation is OFF</div>
                <Button variant="outline" onClick={() => setUserParticipation(true)}>
                  Enable User Trader
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>


      {/* Dark Mode Toggle */}
      <button
        onClick={() => setDarkMode((prev) => !prev)}
        className={`fixed bottom-4 right-4 w-10 h-10 rounded-full ${
          darkMode ? "bg-white text-black" : "bg-black text-white"
        } flex items-center justify-center shadow-lg hover:opacity-80 transition-opacity z-10`}
        aria-label="Toggle dark mode"
      >
        {darkMode ? "☀️" : "🌙"}
      </button>

      {/* Participation Toggle */}
      <button
        onClick={toggleParticipation}
        className={`fixed bottom-4 left-4 px-3 h-10 rounded-full border shadow-lg transition-opacity z-10
          ${userParticipation
        ? "bg-green-600 text-white border-green-700 hover:opacity-90"
        : "bg-zinc-200 text-zinc-900 border-zinc-300 hover:opacity-90 dark:bg-zinc-800 dark:text-white dark:border-zinc-700"}`}
        aria-label="Toggle user participation"
        title="Toggle user participation"
      >
        {userParticipation ? "User: ON" : "User: OFF"}
      </button>


      {/* Trader Detail Modal */}
      <Modal
        open={traderModalOpen && !!selectedTraderId}
        onClose={handleCloseTraderModal}
        title={selectedTraderId ? `Trader Details — ${selectedTraderId}` : "Trader Details"}
      >
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 mb-8 text-[1.1rem]">
          {/* Key Metrics */}
          <Card className="bg-white/70 dark:bg-zinc-800/70">
            <CardContent className="pt-6">
              <h4 className="font-semibold mb-4 text-lg">Key Metrics</h4>
              {(() => {
                const last = latest?.traders?.[selectedTraderId ?? ""] as any;
                return last ? (
                  <div className="grid grid-cols-2 gap-x-12 gap-y-2">
                    <div className="flex justify-between gap-6">
                      <span className="text-zinc-500 whitespace-nowrap">P&L</span>
                      <span className="font-bold tabular-nums">{typeof last.pnl === "number" ? `$${last.pnl.toFixed(2)}` : "--"}</span>
                    </div>
                    <div className="flex justify-between gap-6">
                      <span className="text-zinc-500 whitespace-nowrap">Alpha PnL</span>
                      <span className="font-bold tabular-nums">{typeof last.alpha_pnl === "number" ? `$${last.alpha_pnl.toFixed(2)}` : "--"}</span>
                    </div>
                    <div className="flex justify-between gap-6">
                      <span className="text-zinc-500 whitespace-nowrap">Win Rate</span>
                      <span className="font-bold tabular-nums">{typeof last.win_rate === "number" ? last.win_rate.toFixed(2) : "--"}</span>
                    </div>
                    <div className="flex justify-between gap-6">
                      <span className="text-zinc-500 whitespace-nowrap">Max DD</span>
                      <span className="font-bold tabular-nums">
                        {typeof last.max_drawdown_pct === "number" ? (last.max_drawdown_pct * 100).toFixed(2) + "%" : "--"}
                      </span>
                    </div>
                    <div className="flex justify-between gap-6">
                      <span className="text-zinc-500 whitespace-nowrap">Balance</span>
                      <span className="font-bold tabular-nums">{typeof last.balance === "number" ? `$${last.balance.toFixed(2)}` : "--"}</span>
                    </div>
                    <div className="flex justify-between gap-6">
                      <span className="text-zinc-500 whitespace-nowrap">Position</span>
                      <span className="font-bold tabular-nums">{typeof last.assets === "number" ? last.assets : "--"}</span>
                    </div>
                  </div>
                ) : (
                  <div className="text-zinc-500">No data</div>
                );
              })()}
            </CardContent>
          </Card>

          {/* Agent Parameters */}
          <Card className="bg-white/70 dark:bg-zinc-800/70">
            <CardContent className="pt-6">
              <h4 className="font-semibold mb-4 text-lg">Agent Parameters</h4>
              {selectedTraderParams ? (
                <div className="grid grid-cols-2 gap-x-12 gap-y-2">
                  <div className="flex justify-between gap-6">
                    <span className="text-zinc-500 whitespace-nowrap">Risk Aversion</span>
                    <span className="font-bold tabular-nums">{selectedTraderParams.risk_aversion}</span>
                  </div>
                  <div className="flex justify-between gap-6">
                    <span className="text-zinc-500 whitespace-nowrap">Learning Rate</span>
                    <span className="font-bold tabular-nums">{selectedTraderParams.learning_rate}</span>
                  </div>
                  <div className="flex justify-between gap-6">
                    <span className="text-zinc-500 whitespace-nowrap">Gamma</span>
                    <span className="font-bold tabular-nums">{selectedTraderParams.gamma}</span>
                  </div>
                  <div className="flex justify-between gap-6">
                    <span className="text-zinc-500 whitespace-nowrap">Epsilon</span>
                    <span className="font-bold tabular-nums">{selectedTraderParams.epsilon}</span>
                  </div>
                </div>
              ) : (
                <div className="text-zinc-500">
                  Parameters unavailable. (Save them in <code>localStorage.init_traders</code> on initialize.)
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* PnL history */}
        <div className="mb-3 font-semibold text-lg">PnL History</div>
        <div className="w-full h-[520px]">
          <ResponsiveContainer key={selectedTraderId ?? 'none'} width="100%" height="100%">
            <LineChart data={decimate(traderSeries, 3000)}>
              <XAxis dataKey="time_step" axisLine={false} tickLine={false} tick={false} />
              <YAxis domain={["auto", "auto"]} tickCount={8} allowDecimals />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="pnl" stroke={darkMode ? "#fff" : "#000"} strokeWidth={3} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Modal>
    </main>
  );
}
