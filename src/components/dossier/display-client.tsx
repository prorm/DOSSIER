"use client";

import { Droplet, Megaphone, Snowflake } from "lucide-react";
import { LayoutGroup, motion, useReducedMotion } from "motion/react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";

import CountUp from "@/components/reactbits/CountUp";
import SplitFlapText from "@/components/reactbits/SplitFlapText";
import { cn } from "@/lib/utils";
import type { LeaderboardPayload } from "@/server/engine/leaderboard";
import { AmbientTerminal } from "./ambient";
import { useRealtime } from "./realtime";

const ElectricBorder = dynamic(() => import("@/components/reactbits/ElectricBorder"), { ssr: false });

interface Ann {
  id: string;
  title: string;
  body: string;
  level: string;
  at: string;
}

function clock(to: string | null, now: number) {
  if (!to) return "--:--:--";
  const s = Math.max(0, Math.floor((new Date(to).getTime() - now) / 1000));
  return `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Projector mode. Built to be read from the back of an auditorium: huge
 * tabular numbers, 12 rows max, strong contrast. A departure-board clock
 * (React Bits SplitFlapText) and a transient first-blood callout (React Bits
 * ElectricBorder) are the only moving pieces besides rank changes.
 */
export function DisplayBoard({
  eventName,
  tagline,
  initial,
  initialAnns,
  phase,
  endsAt,
  tint,
}: {
  eventName: string;
  tagline: string;
  initial: LeaderboardPayload;
  initialAnns: Ann[];
  phase: string;
  endsAt: string | null;
  tint: string;
}) {
  const [lb, setLb] = useState(initial);
  const [anns, setAnns] = useState(initialAnns);
  const [blood, setBlood] = useState<{ title: string; k: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const version = useRef(initial.version);
  const reduce = useReducedMotion();

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/leaderboard?v=${version.current}`, { cache: "no-store" });
      if (!r.ok) return;
      const d = (await r.json()) as LeaderboardPayload | { unchanged: true };
      if ("unchanged" in d) return;
      version.current = d.version;
      setLb(d);
    } catch {
      /* keep last */
    }
  }, []);

  useRealtime((m) => {
    if (m.type === "leaderboard" || m.type === "event-status" || m.type === "reconnected") void load();
    if (m.type === "announcement" && m.data) setAnns((a) => [m.data as unknown as Ann, ...a.filter((x) => x.id !== (m.data as { id?: string }).id)].slice(0, 4));
    if (m.type === "first-blood" && m.data) setBlood({ title: String(m.data.title ?? "a challenge"), k: Date.now() });
  });
  useEffect(() => {
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);
  useEffect(() => {
    if (!blood) return;
    const t = setTimeout(() => setBlood(null), 7000);
    return () => clearTimeout(t);
  }, [blood]);

  const rows = lb.standings.filter((s) => !s.disqualified).slice(0, 12);
  const status = phase === "live" ? clock(endsAt, now).slice(0, 5) : phase.toUpperCase();

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden bg-bg p-[2.2vw] text-ink">
      <AmbientTerminal tint={tint} brightness={0.35} className="opacity-60" />
      <header className="relative flex items-end justify-between gap-6 border-b border-line pb-[1.2vw]">
        <div className="min-w-0">
          <p className="font-mono text-[1vw] uppercase tracking-[0.3em] text-mute">DOSSIER // Live standings</p>
          <h1 className="truncate font-mono text-[3.2vw] leading-none font-bold uppercase tracking-[0.04em]">{eventName}</h1>
          {tagline ? <p className="mt-[0.5vw] truncate text-[1.1vw] text-ink-dim">{tagline}</p> : null}
        </div>
        <div className="shrink-0 text-right">
          <p className="mb-[0.4vw] font-mono text-[0.9vw] uppercase tracking-[0.25em] text-mute">{phase === "live" && endsAt ? "Time left" : "Status"}</p>
          <SplitFlapText text={status} charset="0123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZ " fontSize="3vw" tileColor="#111A24" textColor={tint} gap="0.25vw" tileRadius="0.3vw" loop={false} aria-label={phase === "live" && endsAt ? `Time left ${status}` : status} />
          {lb.frozen ? (
            <p className="mt-[0.4vw] inline-flex items-center gap-[0.4vw] font-mono text-[1vw] uppercase tracking-[0.2em] text-signal-cyan">
              <Snowflake className="size-[1.1vw]" aria-hidden="true" /> Board frozen
            </p>
          ) : null}
        </div>
      </header>

      <div className="relative grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_28vw] gap-[2vw] pt-[1.4vw]">
        <LayoutGroup>
          <ol className="flex min-h-0 flex-col gap-[0.45vw]" aria-label="Top teams">
            {rows.map((s) => (
              <motion.li
                key={s.teamId}
                layout={reduce ? false : "position"}
                transition={{ type: "spring", stiffness: 260, damping: 32 }}
                className={cn(
                  "grid grid-cols-[5vw_minmax(0,1fr)_12vw] items-center rounded-[0.3vw] border px-[1.2vw] py-[0.55vw]",
                  s.rank === 1 ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_9%,var(--color-surface))]" : "border-line bg-[color-mix(in_srgb,var(--color-surface)_88%,transparent)]",
                )}
              >
                <span className={cn("num text-[2.2vw] font-bold", s.rank <= 3 ? "text-signal" : "text-mute")}>{String(s.rank).padStart(2, "0")}</span>
                <span className="min-w-0">
                  <span className="block truncate font-mono text-[1.9vw] font-semibold">{s.name}</span>
                  {s.affiliation ? <span className="block truncate text-[0.95vw] text-mute">{s.affiliation}</span> : null}
                </span>
                <CountUp to={s.score} className="text-right text-[2.3vw] font-bold" />
              </motion.li>
            ))}
            {rows.length === 0 ? <li className="font-mono text-[1.5vw] text-mute">Waiting for the first team…</li> : null}
          </ol>
        </LayoutGroup>

        <aside className="flex min-h-0 flex-col gap-[1vw]" aria-label="Announcements">
          <p className="flex items-center gap-[0.5vw] font-mono text-[1vw] uppercase tracking-[0.25em] text-mute">
            <Megaphone className="size-[1.1vw]" aria-hidden="true" /> Comms
          </p>
          {anns.length === 0 ? <p className="font-mono text-[1vw] text-faint">No announcements.</p> : null}
          {anns.slice(0, 4).map((a, i) => (
            <div
              key={a.id}
              className={cn(
                "rounded-[0.3vw] border bg-[color-mix(in_srgb,var(--color-surface)_90%,transparent)] p-[1vw]",
                a.level === "critical" ? "border-signal-magenta" : a.level === "warning" ? "border-signal-amber" : "border-line-strong",
                i === 0 && "animate-reveal-up",
              )}
            >
              <p className="font-mono text-[1.25vw] font-semibold">{a.title}</p>
              {a.body ? <p className="mt-[0.3vw] line-clamp-3 text-[1vw] text-ink-dim">{a.body}</p> : null}
            </div>
          ))}
        </aside>
      </div>

      {blood ? (
        <div key={blood.k} role="status" className="pointer-events-none absolute inset-0 z-20 grid place-items-center bg-bg/70 backdrop-blur-sm">
          <ElectricBorder color="#FF2E88" speed={1} chaos={0.5} borderRadius={8}>
            <div className="animate-reveal-up px-[4vw] py-[2.5vw] text-center">
              <Droplet className="mx-auto size-[3vw] text-signal-magenta" aria-hidden="true" />
              <p className="mt-[0.8vw] font-mono text-[1.2vw] uppercase tracking-[0.3em] text-signal-magenta">First blood</p>
              <p className="mt-[0.4vw] font-mono text-[3vw] font-bold uppercase">{blood.title}</p>
            </div>
          </ElectricBorder>
        </div>
      ) : null}
    </div>
  );
}
