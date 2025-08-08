"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

const TITLE = "Artificial Intelligence Trading Simulator";
const SUB1 = "Market Simulation with Multi-Agent Reinforcement Learning";
const SUB2 = "Can You Outsmart AI?";

export default function Home() {
  const [typed, setTyped] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    let i = 0;
    const speed = 28; // ms per char
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
              <Link href="/dashboard">
              <Button className="rounded-xl px-5 py-2">Enter Simulation</Button>
              </Link>
              <span className="inline-block w-2" />
            </div>
            <div className="flex items-center justify-center gap-3">
              <Link href="/about">
              <Button
                variant="outline"
                className="rounded-xl px-5 py-2 border-zinc-300 bg-zinc-100 text-black"
              >
                Learn More
              </Button>
              </Link>
              <Link href="https://github.com/parkercarrus/marl" target="_blank" rel="noopener noreferrer">
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
    </main>
  );
}
