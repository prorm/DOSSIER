"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import CountUp from "@/components/reactbits/CountUp";
import { cn } from "@/lib/utils";
import { useRealtime } from "./realtime";

interface HudState {
  score: number;
  rank: number | null;
  teams: number;
}

/**
 * Score HUD. Animates on change (score count-up) and flashes the delta.
 * Refreshes from the tiny /api/play/state endpoint on leaderboard signals.
 */
export function HudScore({ initial }: { initial: HudState }) {
  const [s, setS] = useState(initial);
  const [delta, setDelta] = useState<{ n: number; k: number } | null>(null);
  const prev = useRef(initial.score);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const refresh = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch("/api/play/state", { cache: "no-store" });
        if (!res.ok) return;
        const next = (await res.json()) as HudState;
        if (next.score !== prev.current) {
          setDelta({ n: next.score - prev.current, k: Date.now() });
          prev.current = next.score;
        }
        setS({ score: next.score, rank: next.rank, teams: next.teams });
      } catch {
        /* offline: keep last known */
      }
    }, 200 + Math.random() * 600);
  }, []);

  useRealtime(refresh, ["leaderboard", "solve", "checkpoint", "accusation", "team-changed", "reconnected"]);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (!delta) return;
    const t = setTimeout(() => setDelta(null), 2400);
    return () => clearTimeout(t);
  }, [delta]);

  return (
    <div className="relative flex items-center gap-3 font-mono" aria-live="polite">
      <div className="flex flex-col items-end leading-none">
        <span className="label-mono !text-[0.6rem]">Score</span>
        <CountUp to={s.score} from={initial.score} className="text-base font-semibold text-signal sm:text-lg" />
      </div>
      <div className="hidden h-7 w-px bg-line sm:block" aria-hidden="true" />
      <div className="hidden flex-col items-end leading-none sm:flex">
        <span className="label-mono !text-[0.6rem]">Rank</span>
        <span className="num text-base font-semibold text-ink">
          {s.rank ? `#${s.rank}` : "—"}
          <span className="text-[0.7rem] text-faint">/{s.teams}</span>
        </span>
      </div>
      {delta ? (
        <span
          key={delta.k}
          className={cn(
            "pointer-events-none absolute -bottom-5 right-0 animate-reveal-up font-mono text-[0.7rem] font-semibold",
            delta.n >= 0 ? "text-signal-green" : "text-signal-magenta",
          )}
        >
          {delta.n >= 0 ? "+" : "−"}
          {Math.abs(delta.n)}
        </span>
      ) : null}
    </div>
  );
}
