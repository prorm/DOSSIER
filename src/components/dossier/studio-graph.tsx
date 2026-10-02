"use client";

import { Maximize2, Minus, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface GraphNode {
  id: string;
  title: string;
  primitive: string;
  round: string;
  roundTitle: string;
  family: string;
  tier: string;
  depth: number;
  optional: boolean;
  redHerring: boolean;
  critical: boolean;
  perTeam: boolean;
  textOnly: number;
  minutes: number;
  configError: string | null;
}

export interface GraphEdge {
  from: string;
  to: string;
  kind: "gate" | "evidence" | "fact" | "checkpoint";
  hidden: boolean;
}

const W = 190;
const H = 58;
const GX = 80;
const GY = 18;

const EDGE_STYLE: Record<GraphEdge["kind"], { color: string; label: string }> = {
  gate: { color: "var(--color-line-strong)", label: "prerequisite" },
  evidence: { color: "var(--color-signal-cyan)", label: "needs evidence" },
  fact: { color: "var(--color-signal-amber)", label: "fact flows (multi-hop)" },
  checkpoint: { color: "var(--color-signal-green)", label: "physical checkpoint" },
};

/** Layered DAG: x = dependency depth, y = story order within the column. */
export function StudioGraph({ nodes, edges, selected, onSelect, roundOrder }: { nodes: GraphNode[]; edges: GraphEdge[]; selected: string | null; onSelect: (id: string) => void; roundOrder: string[] }) {
  const layout = useMemo(() => {
    const cols = new Map<number, GraphNode[]>();
    for (const n of nodes) cols.set(n.depth, [...(cols.get(n.depth) ?? []), n]);
    const pos = new Map<string, { x: number; y: number }>();
    let maxRows = 0;
    for (const [d, list] of [...cols.entries()].sort((a, b) => a[0] - b[0])) {
      list.sort((a, b) => roundOrder.indexOf(a.round) - roundOrder.indexOf(b.round));
      list.forEach((n, i) => pos.set(n.id, { x: 20 + (d - 1) * (W + GX), y: 20 + i * (H + GY) }));
      maxRows = Math.max(maxRows, list.length);
    }
    const maxDepth = Math.max(1, ...nodes.map((n) => n.depth));
    return { pos, width: 40 + maxDepth * (W + GX), height: 40 + maxRows * (H + GY) };
  }, [nodes, roundOrder]);

  const [view, setView] = useState({ x: 0, y: 0, s: 1 });
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  // Fit the graph to the viewport without enlarging past 1:1 or shrinking below
  // legibility: very wide graphs keep a readable scale and pan horizontally.
  const fit = useCallback(() => {
    const el = box.current;
    if (!el) return;
    const s = Math.max(0.3, Math.min(1, el.clientHeight / layout.height, Math.max(0.6, el.clientWidth / layout.width)));
    setView({ x: Math.max(0, (el.clientWidth - layout.width * s) / 2), y: 0, s });
  }, [layout.width, layout.height]);
  useEffect(fit, [fit]);
  const [hover, setHover] = useState<string | null>(null);
  const focus = hover ?? selected;
  const linked = useMemo(() => {
    if (!focus) return null;
    const s = new Set([focus]);
    for (const e of edges) if (e.from === focus || e.to === focus) s.add(e.from).add(e.to);
    return s;
  }, [focus, edges]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <ul className="flex flex-wrap gap-3 font-mono text-[0.68rem] text-ink-dim" aria-label="Edge legend">
          {Object.entries(EDGE_STYLE).map(([k, v]) => (
            <li key={k} className="flex items-center gap-1.5">
              <svg width="26" height="8" aria-hidden="true">
                <line x1="1" y1="4" x2="25" y2="4" stroke={v.color} strokeWidth="2" />
              </svg>
              {v.label}
            </li>
          ))}
          <li className="flex items-center gap-1.5">
            <svg width="26" height="8" aria-hidden="true">
              <line x1="1" y1="4" x2="25" y2="4" stroke="var(--color-mute)" strokeWidth="2" strokeDasharray="4 3" />
            </svg>
            hidden dependency
          </li>
          <li className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-5 rounded-xs border-2 border-[var(--accent)]" aria-hidden="true" /> critical path
          </li>
          <li className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-5 rounded-xs border-2 border-dashed border-signal-magenta" aria-hidden="true" /> red herring
          </li>
        </ul>
        <div className="ml-auto flex gap-1">
          <Button size="icon-sm" variant="outline" aria-label="Zoom out" onClick={() => setView((v) => ({ ...v, s: Math.max(0.3, v.s / 1.2) }))}>
            <Minus />
          </Button>
          <Button size="icon-sm" variant="outline" aria-label="Zoom in" onClick={() => setView((v) => ({ ...v, s: Math.min(2.2, v.s * 1.2) }))}>
            <Plus />
          </Button>
          <Button size="icon-sm" variant="outline" aria-label="Fit to view" onClick={fit}>
            <Maximize2 />
          </Button>
        </div>
      </div>
      <div
        ref={box}
        className="panel relative h-[62dvh] touch-none overflow-hidden bg-bg"
        onPointerDown={(e) => {
          if ((e.target as Element).closest("[data-node]")) return;
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
        }}
        onPointerMove={(e) => {
          if (drag.current) setView((v) => ({ ...v, x: drag.current!.vx + e.clientX - drag.current!.x, y: drag.current!.vy + e.clientY - drag.current!.y }));
        }}
        onPointerUp={() => (drag.current = null)}
        onWheel={(e) => setView((v) => ({ ...v, s: Math.min(2.2, Math.max(0.3, v.s * (e.deltaY < 0 ? 1.1 : 0.9))) }))}
        role="application"
        aria-label="Challenge graph. Drag to pan, scroll to zoom, click a node for details."
      >
        <svg width={layout.width} height={layout.height} style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.s})`, transformOrigin: "0 0" }}>
          <defs>
            {Object.entries(EDGE_STYLE).map(([k, v]) => (
              <marker key={k} id={`arrow-${k}`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
                <path d="M0,0 L8,4 L0,8 z" fill={v.color} />
              </marker>
            ))}
          </defs>
          {edges.map((e, i) => {
            const a = layout.pos.get(e.from);
            const b = layout.pos.get(e.to);
            if (!a || !b) return null;
            const x1 = a.x + W;
            const y1 = a.y + H / 2;
            const x2 = b.x;
            const y2 = b.y + H / 2;
            const back = x2 <= x1;
            const d = back ? `M${x1},${y1} C${x1 + 60},${y1 - 80} ${x2 - 60},${y2 - 80} ${x2},${y2}` : `M${x1},${y1} C${(x1 + x2) / 2},${y1} ${(x1 + x2) / 2},${y2} ${x2},${y2}`;
            const dim = linked && !(linked.has(e.from) && linked.has(e.to));
            return (
              <path
                key={i}
                d={d}
                fill="none"
                stroke={EDGE_STYLE[e.kind].color}
                strokeWidth={2}
                strokeDasharray={e.hidden ? "5 4" : undefined}
                markerEnd={`url(#arrow-${e.kind})`}
                opacity={dim ? 0.12 : 0.85}
              />
            );
          })}
          {nodes.map((n) => {
            const p = layout.pos.get(n.id)!;
            const dim = linked && !linked.has(n.id);
            return (
              <g
                key={n.id}
                data-node
                transform={`translate(${p.x},${p.y})`}
                onClick={() => onSelect(n.id)}
                onMouseEnter={() => setHover(n.id)}
                onMouseLeave={() => setHover(null)}
                style={{ cursor: "pointer" }}
                opacity={dim ? 0.3 : 1}
                role="button"
                aria-label={`${n.title}, ${n.primitive}, depth ${n.depth}`}
              >
                <title>{`${n.title}\n${n.primitive} · ${n.roundTitle} · ${n.tier}\ndepth ${n.depth} · ~${n.minutes} min · text-only ~${Math.round(n.textOnly * 100)}%${n.perTeam ? " · per-team" : ""}${n.configError ? `\n⚠ ${n.configError}` : ""}`}</title>
                <rect
                  width={W}
                  height={H}
                  rx={4}
                  fill="var(--color-surface)"
                  stroke={n.configError ? "var(--color-signal-magenta)" : n.redHerring ? "var(--color-signal-magenta)" : n.critical ? "var(--accent)" : selected === n.id ? "var(--color-ink)" : "var(--color-line-strong)"}
                  strokeWidth={selected === n.id || n.critical ? 2 : 1}
                  strokeDasharray={n.redHerring || n.optional ? "5 3" : undefined}
                />
                <text x={10} y={20} fill="var(--color-ink)" fontSize={12} fontFamily="var(--font-mono)">
                  {n.title.length > 24 ? `${n.title.slice(0, 23)}…` : n.title}
                </text>
                <text x={10} y={38} fill="var(--color-mute)" fontSize={10} fontFamily="var(--font-mono)">
                  {n.primitive}
                </text>
                <text x={10} y={51} fill="var(--color-faint)" fontSize={9} fontFamily="var(--font-mono)">
                  {n.family} · d{n.depth} · {n.minutes}m{n.perTeam ? " · unique" : ""}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

const AXES: { key: string; label: string }[] = [
  { key: "knowledgeDifficulty", label: "Knowledge" },
  { key: "reasoningDifficulty", label: "Reasoning" },
  { key: "toolRequirement", label: "Tooling" },
  { key: "interactionDepth", label: "Interaction" },
  { key: "statefulness", label: "Statefulness" },
  { key: "dependencyDepth", label: "Dependency depth" },
  { key: "crossModalComplexity", label: "Cross-modal" },
  { key: "redHerringDensity", label: "Red herrings" },
  { key: "instanceUniqueness", label: "Per-team uniqueness" },
  { key: "physicalDependency", label: "Physical" },
];

/** The multidimensional difficulty profile: one bar per axis (0–10), single hue, values in text. */
export function DifficultyBars({ profile, compact }: { profile: Record<string, number>; compact?: boolean }) {
  return (
    <ul className={cn("space-y-1", compact && "space-y-0.5")} aria-label="Difficulty profile">
      {AXES.map((a) => {
        const v = profile[a.key] ?? 0;
        return (
          <li key={a.key} className="grid grid-cols-[7.5rem_1fr_2rem] items-center gap-2" title={`${a.label}: ${v.toFixed(1)} / 10`}>
            <span className={cn("truncate font-mono text-ink-dim", compact ? "text-[0.6rem]" : "text-[0.7rem]")}>{a.label}</span>
            <span className="h-2 overflow-hidden rounded-full bg-raised" aria-hidden="true">
              <span className="block h-full rounded-full bg-signal-cyan" style={{ width: `${(v / 10) * 100}%` }} />
            </span>
            <span className="num text-right text-[0.7rem] text-ink-dim">{v.toFixed(1)}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** Difficulty across the event (story order), with round bands. Single series; hover shows the node. */
export function CurveChart({ nodes, rounds }: { nodes: { id: string; title: string; round: string; score: number }[]; rounds: { id: string; title: string; tier: string }[] }) {
  const ordered = rounds.flatMap((r) => nodes.filter((n) => n.round === r.id));
  const [hover, setHover] = useState<number | null>(null);
  const w = 760;
  const h = 200;
  const pad = { l: 36, r: 10, t: 12, b: 34 };
  const x = (i: number) => pad.l + (ordered.length <= 1 ? 0 : (i / (ordered.length - 1)) * (w - pad.l - pad.r));
  const y = (s: number) => pad.t + (1 - s / 100) * (h - pad.t - pad.b);
  const path = ordered.map((n, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(n.score).toFixed(1)}`).join(" ");
  // Index of each round's first node in story order (for the alternating bands).
  const starts = rounds.map((r) => ordered.findIndex((n) => n.round === r.id));
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full min-w-[520px]" role="img" aria-label="Difficulty score per challenge in story order">
        {rounds.map((r, ri) => {
          const count = ordered.filter((n) => n.round === r.id).length;
          const start = Math.max(0, starts[ri]!);
          const x0 = x(start) - 6;
          const x1 = x(start + Math.max(0, count - 1)) + 6;
          return (
            <g key={r.id}>
              <rect x={x0} y={pad.t} width={Math.max(8, x1 - x0)} height={h - pad.t - pad.b} fill={ri % 2 ? "var(--color-raised)" : "transparent"} opacity={0.6} />
              <text x={(x0 + x1) / 2} y={h - 18} textAnchor="middle" fontSize={9} fill="var(--color-mute)" fontFamily="var(--font-mono)">
                {r.title.slice(0, 14)}
              </text>
              <text x={(x0 + x1) / 2} y={h - 7} textAnchor="middle" fontSize={8} fill="var(--color-faint)" fontFamily="var(--font-mono)">
                {r.tier}
              </text>
            </g>
          );
        })}
        {[0, 50, 100].map((g) => (
          <g key={g}>
            <line x1={pad.l} x2={w - pad.r} y1={y(g)} y2={y(g)} stroke="var(--color-line)" strokeWidth={1} />
            <text x={pad.l - 6} y={y(g) + 3} textAnchor="end" fontSize={9} fill="var(--color-mute)" fontFamily="var(--font-mono)">
              {g}
            </text>
          </g>
        ))}
        <path d={path} fill="none" stroke="var(--color-signal-cyan)" strokeWidth={2} />
        {ordered.map((n, i) => (
          <g key={n.id} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <circle cx={x(i)} cy={y(n.score)} r={9} fill="transparent" />
            <circle cx={x(i)} cy={y(n.score)} r={hover === i ? 5 : 4} fill="var(--color-signal-cyan)" stroke="var(--color-bg)" strokeWidth={2} />
          </g>
        ))}
        {hover !== null && ordered[hover] ? (
          <g transform={`translate(${Math.min(w - 170, x(hover) + 8)},${Math.max(pad.t, y(ordered[hover]!.score) - 34)})`}>
            <rect width={160} height={28} rx={3} fill="var(--color-overlay)" stroke="var(--color-line-strong)" />
            <text x={8} y={12} fontSize={9} fill="var(--color-ink)" fontFamily="var(--font-mono)">
              {ordered[hover]!.title.slice(0, 26)}
            </text>
            <text x={8} y={23} fontSize={9} fill="var(--color-ink-dim)" fontFamily="var(--font-mono)">
              difficulty {ordered[hover]!.score}
            </text>
          </g>
        ) : null}
      </svg>
    </div>
  );
}
