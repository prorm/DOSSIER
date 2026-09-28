"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";

interface Series {
  teamId: string;
  name: string;
  points: { t: string; score: number }[];
}

const H = 260;
const PAD = { l: 44, r: 16, t: 12, b: 28 };

function niceMax(v: number) {
  if (v <= 0) return 10;
  const p = 10 ** Math.floor(Math.log10(v));
  return Math.ceil(v / p) * p;
}

/**
 * Score over time — focus + context. All teams render as thin neutral step
 * lines; your team is the accent line; hovering a line or a legend entry
 * lifts that team in cyan. Colour never carries identity alone: the legend,
 * the crosshair tooltip and the table view all name every team. One y-axis.
 */
export function ScoreChart({ series, highlight, until }: { series: Series[]; highlight?: string; until: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(640);
  const [hoverTeam, setHoverTeam] = useState<string | null>(null);
  const [cross, setCross] = useState<number | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e!.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { t0, t1, yMax } = useMemo(() => {
    const ts = series.flatMap((s) => s.points.map((p) => new Date(p.t).getTime()));
    const scores = series.flatMap((s) => s.points.map((p) => p.score));
    const end = new Date(until).getTime();
    const lo = ts.length ? Math.min(...ts) : end - 3600_000;
    const hi = Math.max(lo + 60_000, end);
    return { t0: lo - (hi - lo) * 0.02, t1: hi, yMax: niceMax(Math.max(10, ...scores)) };
  }, [series, until]);

  const x = (t: number) => PAD.l + ((t - t0) / (t1 - t0)) * (w - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - v / yMax) * (H - PAD.t - PAD.b);

  const path = (s: Series) => {
    let d = `M ${x(t0)} ${y(0)}`;
    let last = 0;
    for (const p of s.points) {
      const px = x(new Date(p.t).getTime());
      d += ` H ${px} V ${y(p.score)}`;
      last = p.score;
    }
    return `${d} H ${x(t1)} V ${y(last)}`;
  };

  const scoreAt = (s: Series, t: number) => {
    let v = 0;
    for (const p of s.points) if (new Date(p.t).getTime() <= t) v = p.score;
    return v;
  };

  const focus = hoverTeam ?? null;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(yMax * f));
  const timeTicks = [0, 0.33, 0.66, 1].map((f) => t0 + (t1 - t0) * f);
  const crossT = cross === null ? null : t0 + ((cross - PAD.l) / (w - PAD.l - PAD.r)) * (t1 - t0);
  const tip =
    crossT === null
      ? []
      : series
          .map((s) => ({ s, v: scoreAt(s, crossT) }))
          .sort((a, b) => b.v - a.v)
          .slice(0, 6);

  const order = [...series].sort((a, b) => (a.teamId === highlight ? 1 : 0) - (b.teamId === highlight ? 1 : 0) || (a.teamId === focus ? 1 : 0) - (b.teamId === focus ? 1 : 0));

  return (
    <div>
      <div ref={wrap} className="relative w-full" onPointerLeave={() => setCross(null)}>
        <svg
          width={w}
          height={H}
          role="img"
          aria-label={`Score over time for the top ${series.length} teams. A table view follows.`}
          className="block touch-pan-y"
          onPointerMove={(e) => {
            const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
            const px = e.clientX - r.left;
            setCross(px >= PAD.l && px <= w - PAD.r ? px : null);
          }}
        >
          {ticks.map((v) => (
            <g key={v}>
              <line x1={PAD.l} x2={w - PAD.r} y1={y(v)} y2={y(v)} stroke="var(--color-line)" strokeWidth={1} />
              <text x={PAD.l - 8} y={y(v)} textAnchor="end" dominantBaseline="middle" className="fill-faint font-mono text-[10px]">
                {v}
              </text>
            </g>
          ))}
          {timeTicks.map((t, i) => (
            <text key={i} x={x(t)} y={H - 8} textAnchor={i === 0 ? "start" : i === timeTicks.length - 1 ? "end" : "middle"} className="fill-faint font-mono text-[10px]">
              {new Date(t).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
            </text>
          ))}
          {order.map((s) => {
            const mine = s.teamId === highlight;
            const hot = s.teamId === focus;
            return (
              <path
                key={s.teamId}
                d={path(s)}
                fill="none"
                stroke={hot ? "var(--color-signal-cyan)" : mine ? "var(--accent)" : "var(--color-mute)"}
                strokeOpacity={hot || mine ? 1 : focus ? 0.18 : 0.45}
                strokeWidth={hot || mine ? 2 : 1.25}
                strokeLinejoin="round"
                onPointerEnter={() => setHoverTeam(s.teamId)}
                onPointerLeave={() => setHoverTeam(null)}
                style={{ transition: "stroke-opacity 150ms ease" }}
              />
            );
          })}
          {cross !== null ? <line x1={cross} x2={cross} y1={PAD.t} y2={H - PAD.b} stroke="var(--color-line-strong)" strokeDasharray="3 3" /> : null}
        </svg>
        {cross !== null && crossT !== null ? (
          <div
            className="pointer-events-none absolute top-2 z-10 min-w-44 rounded-sm border border-line-strong bg-raised px-3 py-2 font-mono text-[0.7rem] shadow-[0_12px_30px_-10px_rgba(0,0,0,0.9)]"
            style={cross > w / 2 ? { right: w - cross + 12 } : { left: cross + 12 }}
          >
            <p className="mb-1 text-faint">{new Date(crossT).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</p>
            {tip.map(({ s, v }) => (
              <p key={s.teamId} className={cn("flex justify-between gap-4", s.teamId === highlight ? "text-signal" : "text-ink-dim")}>
                <span className="truncate">{s.name}</span>
                <span className="num text-ink">{v}</span>
              </p>
            ))}
          </div>
        ) : null}
      </div>

      {/* Legend: always present; keyboard-focusable entries lift their line. */}
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5" aria-label="Legend">
        {series.map((s, i) => (
          <li key={s.teamId}>
            <button
              type="button"
              onMouseEnter={() => setHoverTeam(s.teamId)}
              onMouseLeave={() => setHoverTeam(null)}
              onFocus={() => setHoverTeam(s.teamId)}
              onBlur={() => setHoverTeam(null)}
              className="flex items-center gap-1.5 rounded-xs font-mono text-[0.68rem] text-ink-dim hover:text-ink"
            >
              <span aria-hidden="true" className={cn("h-0.5 w-4", s.teamId === highlight ? "bg-[var(--accent)]" : s.teamId === focus ? "bg-signal-cyan" : "bg-mute")} />
              <span className="text-faint">{i + 1}.</span> {s.name}
            </button>
          </li>
        ))}
      </ul>

      <details className="mt-3">
        <summary className="label-mono cursor-pointer">Table view</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full font-mono text-xs">
            <thead>
              <tr className="text-left text-faint">
                <th className="py-1 pr-4 font-normal">Team</th>
                <th className="py-1 pr-4 text-right font-normal">Score</th>
                <th className="py-1 text-right font-normal">Score changes</th>
              </tr>
            </thead>
            <tbody>
              {series.map((s) => (
                <tr key={s.teamId} className="border-t border-line">
                  <td className="py-1 pr-4">{s.name}</td>
                  <td className="num py-1 pr-4 text-right">{s.points.at(-1)?.score ?? 0}</td>
                  <td className="num py-1 text-right text-mute">{s.points.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
