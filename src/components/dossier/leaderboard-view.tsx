"use client";

import { ArrowDown, ArrowUp, Snowflake } from "lucide-react";
import { LayoutGroup, motion, useReducedMotion } from "motion/react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";

import CountUp from "@/components/reactbits/CountUp";
import { cn } from "@/lib/utils";
import type { LeaderboardPayload } from "@/server/engine/leaderboard";
import type { Standing } from "@/server/engine/scoring";
import { EmptyState } from "./primitives";
import { useRealtime } from "./realtime";
import { LocalTime } from "./local-time";

const ScoreChart = dynamic(() => import("./score-chart").then((m) => m.ScoreChart), {
  ssr: false,
  loading: () => <div className="skeleton h-64 w-full" aria-label="Loading chart" />,
});

type Movement = Record<string, number>; // teamId → +up / −down

/**
 * Live leaderboard. Rows glide to their new rank (motion layout), flash green
 * or magenta for a moment and show the rank delta as text — the arrow is a
 * signal, not the only carrier of the information.
 */
export function LeaderboardView({
  initial,
  myTeamId,
  showChart = true,
  modes = [],
  scope = "public",
}: {
  initial: LeaderboardPayload;
  myTeamId?: string;
  showChart?: boolean;
  modes?: string[];
  scope?: "public" | "live";
}) {
  const [lb, setLb] = useState(initial);
  const [moves, setMoves] = useState<Movement>({});
  const version = useRef(initial.version);
  const reduce = useReducedMotion();

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/leaderboard?v=${version.current}${scope === "live" ? "&scope=live" : ""}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as LeaderboardPayload | { unchanged: true };
      if ("unchanged" in data) return;
      setLb((prev) => {
        const before = new Map(prev.standings.map((s) => [s.teamId, s.rank]));
        const m: Movement = {};
        for (const s of data.standings) {
          const b = before.get(s.teamId);
          if (b && b !== s.rank && !s.disqualified) m[s.teamId] = b - s.rank;
        }
        setMoves(m);
        return data;
      });
      version.current = data.version;
    } catch {
      /* offline — keep showing last known standings */
    }
  }, [scope]);

  const pending = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useRealtime(() => {
    clearTimeout(pending.current);
    pending.current = setTimeout(load, 150 + Math.random() * 900);
  }, ["leaderboard", "event-status", "reconnected"]);

  // Belt and braces for spectators without a realtime link.
  useEffect(() => {
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (!Object.keys(moves).length) return;
    const t = setTimeout(() => setMoves({}), 2500);
    return () => clearTimeout(t);
  }, [moves]);

  const ranked = lb.standings.filter((s) => !s.disqualified);
  const dq = lb.standings.filter((s) => s.disqualified);
  const showBreakdown = modes.length > 1;

  if (!ranked.length) {
    return <EmptyState title="No teams on the board yet">Standings appear as soon as the first team registers.</EmptyState>;
  }

  return (
    <div className="space-y-6">
      {lb.frozen ? (
        <p className="flex items-center gap-2 rounded-sm border border-[color-mix(in_srgb,var(--color-signal-cyan)_40%,transparent)] bg-[color-mix(in_srgb,var(--color-signal-cyan)_6%,transparent)] px-3 py-2 font-mono text-xs text-signal-cyan">
          <Snowflake className="size-4" aria-hidden="true" />
          Frozen at {lb.frozenAt ? <LocalTime iso={lb.frozenAt} /> : "—"}. Final results are revealed when the event ends.
        </p>
      ) : null}

      <div className="panel overflow-hidden">
        <div
          className="hidden grid-cols-[3.5rem_minmax(0,1fr)_repeat(var(--cols),4.5rem)_4rem_6rem] items-center gap-2 border-b border-line px-4 py-2 font-mono text-[0.62rem] uppercase tracking-[0.12em] text-faint md:grid"
          style={{ ["--cols" as string]: showBreakdown ? modes.length : 0 }}
        >
          <span>Rank</span>
          <span>Team</span>
          {showBreakdown && modes.map((m) => <span key={m} className="text-right">{m === "inquest" ? "case" : m}</span>)}
          <span className="text-right">Solves</span>
          <span className="text-right">Score</span>
        </div>
        <LayoutGroup>
          <ol aria-label="Leaderboard" className="divide-y divide-line">
            {ranked.map((s) => (
              <Row key={s.teamId} s={s} mine={s.teamId === myTeamId} move={moves[s.teamId] ?? 0} modes={showBreakdown ? modes : []} reduce={Boolean(reduce)} />
            ))}
          </ol>
        </LayoutGroup>
      </div>

      {dq.length ? (
        <details className="panel p-4">
          <summary className="label-mono cursor-pointer">Disqualified ({dq.length})</summary>
          <ul className="mt-2 space-y-1 font-mono text-sm text-mute">
            {dq.map((s) => (
              <li key={s.teamId} className="line-through decoration-signal-magenta/60">
                {s.name}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {showChart && lb.series.length ? (
        <section aria-labelledby="chart-h" className="panel p-4 sm:p-5">
          <h2 id="chart-h" className="label-mono mb-3">
            Score over time · top {lb.series.length}
          </h2>
          <ScoreChart series={lb.series} highlight={myTeamId} until={lb.computedAt} />
        </section>
      ) : null}
    </div>
  );
}

function Row({ s, mine, move, modes, reduce }: { s: Standing; mine: boolean; move: number; modes: string[]; reduce: boolean }) {
  const key = (m: string) => (m === "inquest" ? "inquest" : m) as keyof Standing["breakdown"];
  return (
    <motion.li
      layout={reduce ? false : "position"}
      transition={{ type: "spring", stiffness: 380, damping: 36 }}
      className={cn(
        "grid grid-cols-[2.75rem_minmax(0,1fr)_auto] items-center gap-2 px-4 py-3 md:grid-cols-[3.5rem_minmax(0,1fr)_repeat(var(--cols),4.5rem)_4rem_6rem]",
        mine && "bg-[color-mix(in_srgb,var(--accent)_7%,transparent)] shadow-[inset_2px_0_0_var(--accent)]",
        move > 0 && "animate-rank-up",
        move < 0 && "animate-rank-down",
      )}
      style={{ ["--cols" as string]: modes.length }}
      aria-current={mine ? "true" : undefined}
    >
      <span className="flex items-center gap-1">
        <span className={cn("num text-sm font-semibold", s.rank <= 3 ? "text-signal" : "text-ink-dim")}>{String(s.rank).padStart(2, "0")}</span>
        {move ? (
          <span className={cn("inline-flex items-center font-mono text-[0.6rem]", move > 0 ? "text-signal-green" : "text-signal-magenta")}>
            {move > 0 ? <ArrowUp className="size-3" aria-hidden="true" /> : <ArrowDown className="size-3" aria-hidden="true" />}
            <span className="sr-only">{move > 0 ? "up" : "down"}</span>
            {Math.abs(move)}
          </span>
        ) : null}
      </span>
      <span className="min-w-0">
        <span className="block truncate font-mono text-sm font-medium">
          {s.name}
          {mine ? <span className="ml-2 text-[0.6rem] uppercase tracking-[0.12em] text-signal">you</span> : null}
        </span>
        {s.affiliation ? <span className="block truncate text-xs text-mute">{s.affiliation}</span> : null}
      </span>
      {modes.map((m) => (
        <span key={m} className="num hidden text-right text-xs text-mute md:block">
          {s.breakdown[key(m)] || "—"}
        </span>
      ))}
      <span className="num hidden text-right text-xs text-mute md:block">{s.solves}</span>
      <span className="text-right">
        <CountUp to={s.score} className="text-base font-semibold text-ink" />
      </span>
    </motion.li>
  );
}
