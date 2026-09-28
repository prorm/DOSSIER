"use client";

import { CalendarClock, Check, Lock } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";

import DecryptedText from "@/components/reactbits/DecryptedText";
import { challengeHref } from "@/lib/modes";
import { cn } from "@/lib/utils";
import type { ChallengeView } from "@/server/engine/play";
import { useFresh } from "./use-fresh";
import { LocalTime } from "./local-time";

interface Placed {
  c: ChallengeView;
  x: number; // 0..100
  y: number; // 0..100
}

/** Pack positions win; anything unpositioned is laid out by dependency depth. */
function layout(views: ChallengeView[]): Placed[] {
  const byId = new Map(views.map((v) => [v.id, v]));
  const depth = new Map<string, number>();
  const visit = (id: string, stack = new Set<string>()): number => {
    if (depth.has(id)) return depth.get(id)!;
    if (stack.has(id)) return 0;
    stack.add(id);
    const v = byId.get(id);
    const deps = v ? [...(v.requires?.all ?? []), ...(v.requires?.any ?? [])].filter((d) => byId.has(d)) : [];
    const d = deps.length ? Math.max(...deps.map((x) => visit(x, stack))) + 1 : 0;
    depth.set(id, d);
    return d;
  };
  views.forEach((v) => visit(v.id));
  const maxDepth = Math.max(0, ...depth.values());
  const perLevel = new Map<number, string[]>();
  views.forEach((v) => perLevel.set(depth.get(v.id)!, [...(perLevel.get(depth.get(v.id)!) ?? []), v.id]));
  return views.map((c) => {
    if (c.position) return { c, x: c.position.x, y: c.position.y };
    const d = depth.get(c.id)!;
    const level = perLevel.get(d)!;
    const i = level.indexOf(c.id);
    return { c, x: 8 + (maxDepth ? (d / maxDepth) * 84 : 42), y: ((i + 1) / (level.length + 1)) * 100 };
  });
}

function label(c: ChallengeView) {
  return "title" in c ? c.title : c.state === "scheduled" ? "Timed" : "Locked";
}

/**
 * The hunt progress map. Edges are drawn in SVG; nodes are real links/labels
 * layered in HTML (crisp text, native focus, screen-reader names). Solid edges
 * are "all of" dependencies, dashed are "any of". Lit edges lead from solved
 * nodes. On narrow screens the map scrolls horizontally and the path log below
 * carries the same information as a list.
 */
export function HuntMap({ eventId, views }: { eventId: string; views: ChallengeView[] }) {
  const placed = useMemo(() => layout(views), [views]);
  const pos = useMemo(() => new Map(placed.map((p) => [p.c.id, p])), [placed]);
  const openIds = useMemo(() => views.filter((v) => v.state === "open" || v.state === "solved").map((v) => v.id), [views]);
  const fresh = useFresh(`${eventId}.hunt`, openIds);

  const edges = placed.flatMap(({ c }) => {
    const all = (c.requires?.all ?? []).map((d) => ({ from: d, to: c.id, any: false }));
    const any = (c.requires?.any ?? []).map((d) => ({ from: d, to: c.id, any: true }));
    return [...all, ...any].filter((e) => pos.has(e.from));
  });
  const solvedIds = new Set(views.filter((v) => v.state === "solved").map((v) => v.id));

  return (
    <div className="panel overflow-hidden">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-b border-line px-4 py-2.5 font-mono text-[0.62rem] uppercase tracking-[0.12em] text-mute">
        <span className="inline-flex items-center gap-2">
          <span aria-hidden="true" className="h-px w-6 bg-[var(--accent)]" /> all of
        </span>
        <span className="inline-flex items-center gap-2">
          <span aria-hidden="true" className="h-px w-6 border-t border-dashed border-[var(--accent)]" /> any of
        </span>
        <span className="ml-auto md:hidden">Scroll →</span>
      </div>
      <div className="overflow-x-auto overscroll-x-contain">
        <div className="grid-bg relative aspect-[16/8] min-w-[720px]" role="group" aria-label="Hunt map">
          <svg className="absolute inset-0 size-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            {edges.map((e) => {
              const a = pos.get(e.from)!;
              const b = pos.get(e.to)!;
              const lit = solvedIds.has(e.from);
              const mx = (a.x + b.x) / 2;
              return (
                <path
                  key={`${e.from}-${e.to}`}
                  d={`M ${a.x} ${a.y} C ${mx} ${a.y}, ${mx} ${b.y}, ${b.x} ${b.y}`}
                  fill="none"
                  vectorEffect="non-scaling-stroke"
                  stroke={lit ? "var(--accent)" : "var(--color-line-strong)"}
                  strokeOpacity={lit ? 0.85 : 1}
                  strokeWidth={lit ? 1.6 : 1.2}
                  strokeDasharray={e.any ? "5 5" : undefined}
                />
              );
            })}
          </svg>
          {placed.map(({ c, x, y }) => (
            <MapNode key={c.id} c={c} x={x} y={y} fresh={fresh.has(c.id)} />
          ))}
        </div>
      </div>
    </div>
  );
}

function MapNode({ c, x, y, fresh }: { c: ChallengeView; x: number; y: number; fresh: boolean }) {
  const style = { left: `${x}%`, top: `${y}%` };
  const title = label(c);
  const ring =
    c.state === "solved"
      ? "border-signal-green bg-signal-green text-bg"
      : c.state === "open"
        ? "border-[var(--accent)] bg-bg text-signal"
        : c.state === "scheduled"
          ? "border-dashed border-signal-amber bg-bg text-signal-amber"
          : "border-dashed border-line-strong bg-bg text-faint";
  const inner = (
    <>
      <span className={cn("relative grid size-10 place-items-center rounded-full border-2 transition-transform", ring, fresh && "glow", c.state === "open" && "group-hover:scale-110")}>
        {c.state === "solved" ? (
          <Check className="size-5" aria-hidden="true" />
        ) : c.state === "open" ? (
          <span aria-hidden="true" className="size-2.5 animate-pulse-dot rounded-full bg-signal" />
        ) : c.state === "scheduled" ? (
          <CalendarClock className="size-4" aria-hidden="true" />
        ) : (
          <Lock className="size-4" aria-hidden="true" />
        )}
      </span>
      <span
        className={cn(
          "mt-1.5 max-w-36 truncate rounded-xs bg-[color-mix(in_srgb,var(--color-bg)_80%,transparent)] px-1.5 py-0.5 text-center font-mono text-[0.68rem] uppercase tracking-[0.06em]",
          c.state === "solved" ? "text-ink-dim" : c.state === "open" ? "text-ink" : "text-faint",
        )}
      >
        {fresh && "title" in c ? <DecryptedText text={title} animateOn="view" sequential speed={30} /> : title}
      </span>
      {"value" in c ? <span className="num text-[0.62rem] text-mute">{c.value}</span> : null}
    </>
  );
  const cls = "group absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center rounded-sm p-1 outline-offset-2";
  if (c.state === "open" || c.state === "solved") {
    return (
      <Link href={challengeHref(c.id)} className={cls} style={style} aria-label={`${title} — ${c.state === "solved" ? "solved" : "open"}`}>
        {inner}
      </Link>
    );
  }
  return (
    <div className={cls} style={style} role="img" aria-label={c.state === "scheduled" ? "Timed node, not open yet" : "Locked node"}>
      {inner}
    </div>
  );
}

/** Text companion to the map: the same progress as an ordered list. */
export function HuntLog({ views }: { views: ChallengeView[] }) {
  const order = { open: 0, scheduled: 1, solved: 2, locked: 3 } as const;
  const sorted = [...views].sort((a, b) => order[a.state] - order[b.state]);
  return (
    <ol className="panel divide-y divide-line">
      {sorted.map((c) => (
        <li key={c.id}>
          {c.state === "open" || c.state === "solved" ? (
            <Link href={challengeHref(c.id)} className="flex min-h-12 items-center gap-3 px-4 py-2.5 hover:bg-raised">
              <StateGlyph state={c.state} />
              <span className={cn("flex-1 truncate font-mono text-sm", c.state === "solved" ? "text-ink-dim" : "text-ink")}>{label(c)}</span>
              {"value" in c ? <span className={cn("num text-sm", c.state === "solved" ? "text-signal-green" : "text-signal")}>{c.value}</span> : null}
            </Link>
          ) : (
            <div className="flex min-h-12 items-center gap-3 px-4 py-2.5 text-faint">
              <StateGlyph state={c.state} />
              <span className="flex-1 font-mono text-sm uppercase tracking-[0.1em]">
                {c.state === "scheduled" && c.opensAt ? <>Opens <LocalTime iso={c.opensAt} format="day-time" /></> : "Locked"}
              </span>
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}

function StateGlyph({ state }: { state: ChallengeView["state"] }) {
  const map = {
    solved: <Check className="size-4 text-signal-green" aria-label="Solved" />,
    open: <span className="grid size-4 place-items-center" aria-label="Open"><span className="size-2 rounded-full bg-signal" /></span>,
    scheduled: <CalendarClock className="size-4 text-signal-amber" aria-label="Scheduled" />,
    locked: <Lock className="size-4" aria-label="Locked" />,
  } as const;
  return map[state];
}
