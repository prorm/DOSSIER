"use client";

import { ArrowDown, ArrowUp, Snowflake } from "lucide-react";
import { LayoutGroup, motion, useReducedMotion } from "motion/react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";

import CountUp from "@/components/reactbits/CountUp";
import { FAMILY_LABEL } from "@/lib/modes";
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

      <div className="lb">
        {showBreakdown ? (
          <ul className="lb-legend" aria-label="What the bars show">
            {/* Only what someone has actually scored in, named the way the rest of the game names it. */}
            {modes.map((m, i) =>
              ranked.some((s) => pointsOf(s, m) > 0) ? (
                <li key={m}>
                  <i style={{ background: segColor(i), opacity: segOpacity(i) }} aria-hidden="true" />
                  {modeLabel(m)}
                </li>
              ) : null,
            )}
          </ul>
        ) : null}
        <LayoutGroup>
          <ol aria-label="Leaderboard" className="lb-list">
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

/** Categorical colours for the contribution bar: the four signals, then the same four dimmer. Names are always in the legend and the title. */
const SIGNALS = ["var(--color-signal-green)", "var(--color-signal-cyan)", "var(--color-signal-magenta)", "var(--color-signal-amber)"];
const segColor = (i: number) => SIGNALS[i % 4]!;
const segOpacity = (i: number) => (i < 4 ? 1 : i < 8 ? 0.62 : 0.36);

function modeLabel(m: string): string {
  return m === "partial" ? "partial credit" : m === "checkpoints" ? "checkpoints" : (FAMILY_LABEL[m] ?? m);
}

function pointsOf(s: Standing, m: string): number {
  return (m === "checkpoints" ? s.breakdown.checkpoints : m === "partial" ? s.breakdown.partial : s.breakdown.families[m]) || 0;
}

function Row({ s, mine, move, modes, reduce }: { s: Standing; mine: boolean; move: number; modes: string[]; reduce: boolean }) {
  const parts = modes.map((m, i) => ({ m, i, v: pointsOf(s, m) })).filter((p) => p.v > 0);
  const total = parts.reduce((a, p) => a + p.v, 0);
  return (
    <motion.li
      layout={reduce ? false : "position"}
      transition={{ type: "spring", stiffness: 380, damping: 36 }}
      className={cn("lb-row", s.rank <= 3 && "is-top", s.rank === 1 && "is-first", mine && "is-mine", move > 0 && "animate-rank-up", move < 0 && "animate-rank-down")}
      aria-current={mine ? "true" : undefined}
    >
      <span className="lb-rank">
        <span className="num">{String(s.rank).padStart(2, "0")}</span>
        {move ? (
          <span className={cn("lb-move", move > 0 ? "is-up" : "is-down")}>
            {move > 0 ? <ArrowUp className="size-3" aria-hidden="true" /> : <ArrowDown className="size-3" aria-hidden="true" />}
            <span className="sr-only">{move > 0 ? "up" : "down"}</span>
            {Math.abs(move)}
          </span>
        ) : null}
      </span>
      <span className="lb-team">
        <span className="lb-name">
          {s.name}
          {mine ? <em>you</em> : null}
        </span>
        {s.affiliation ? <span className="lb-aff">{s.affiliation}</span> : null}
      </span>
      {modes.length ? (
        <span className="lb-bar" role="img" aria-label={parts.length ? parts.map((p) => `${p.m === "partial" ? "final" : p.m} ${p.v}`).join(", ") : "no points yet"}>
          {parts.length ? (
            parts.map((p) => <i key={p.m} title={`${modeLabel(p.m)}: ${p.v}`} style={{ flexGrow: p.v, flexBasis: 0, background: segColor(p.i), opacity: segOpacity(p.i) }} data-share={Math.round((p.v / total) * 100)} />)
          ) : (
            <b />
          )}
        </span>
      ) : null}
      <span className="lb-solves num">
        {s.solves}
        <small>solves</small>
      </span>
      <span className="lb-score">
        <CountUp to={s.score} className="num" />
      </span>
    </motion.li>
  );
}
