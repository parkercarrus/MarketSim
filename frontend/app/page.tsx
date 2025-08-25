"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

const TITLE = "Multi-Agent Market Simulator";

export default function Home() {
  const [typed, setTyped] = useState("");
  const [done, setDone] = useState(false);
  const [apiHealthy, setApiHealthy] = useState<boolean | null>(null);

  // typewriter
  useEffect(() => {
    let i = 0;
    const speed = 28;
    const id = setInterval(() => {
      i++;
      setTyped(TITLE.slice(0, i));
      if (i >= TITLE.length) {
        clearInterval(id);
        setDone(true);
      }
    }, speed);
    return () => clearInterval(id);
  }, []);

  // health check (poll every 10s)
  useEffect(() => {
    const apiBase =
      (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, ""); // strip trailing slash
    const url = `${apiBase}/health`;

    async function check() {
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) return setApiHealthy(false);
        const data = await res.json();
        setApiHealthy(data?.status === "ok");
      } catch {
        setApiHealthy(false);
      }
    }

    check();
    const id = setInterval(check, 10_000);
    return () => clearInterval(id);
  }, []);

  return (
    <main className="min-h-screen bg-white text-black dark:bg-zinc-900 dark:text-white font-mono">
      <div className="mx-auto max-w-5xl h-screen flex items-center justify-center">
        <div className="text-center space-y-6 px-6">
          {/* Title with caret */}
          <h1 className="whitespace-nowrap text-3xl sm:text-4xl md:text-5xl tracking-tight overflow-hidden">
            {typed}
            <span
              className={`ml-1 inline-block h-[1.2em] align-bottom border-r-2 ${
                done ? "animate-pulse" : ""
              }`}
            />
          </h1>

          {/* CTA buttons */}
          <div className="flex flex-col items-center justify-center gap-2 pt-2">
            <div className="mb-4">
              <Link href={{ pathname: "/dashboard", query: { play: false } }}>
                <Button className="rounded-xl px-5 py-2">Simulate</Button>
              </Link>
              <Link href={{ pathname: "/dashboard", query: { play: true } }}>
                <Button className="rounded-xl px-5 py-2 ml-4">Play</Button>
              </Link>
              <span className="inline-block w-2" />
            </div>
            <div className="flex items-center justify-center gap-3">
              <Link href="/about">
                <Button
                  variant="ghost"
                  className="rounded-xl px-5 py-2 border border-black"
                >
                  Learn More
                </Button>
              </Link>
              <Link
                href="https://github.com/parkercarrus/trading-sim"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button
                  variant="ghost"
                  className="rounded-xl px-5 py-2 border border-black"
                >
                  Code
                </Button>
              </Link>
              <Link href="/docs">
                <Button
                  variant="ghost"
                  className="rounded-xl px-5 py-2 border border-black"
                >
                  API
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom-right API status dot */}
      <div className="fixed bottom-4 right-4">
        <div
          className={`w-3.5 h-3.5 rounded-full shadow-md border border-black/20 ${
            apiHealthy === null
              ? "bg-zinc-400"
              : apiHealthy
              ? "bg-green-500"
              : "bg-red-500"
          }`}
          title={
            apiHealthy === null
              ? "Checking API..."
              : apiHealthy
              ? "API is healthy"
              : "API is unreachable"
          }
          aria-label={
            apiHealthy === null
              ? "Checking API"
              : apiHealthy
              ? "API healthy"
              : "API down"
          }
        />
      </div>
    </main>
  );
}
