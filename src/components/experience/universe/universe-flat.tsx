"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { ThemeDef } from "@/lib/experience/themes";
import { flatten, type UNode, type UniverseModel } from "@/lib/experience/universe";
import type { TeamDressing } from "@/lib/experience/variation";

/**
 * The same universe, drawn flat. This is not a degraded mode: it is the
 * version that works everywhere (no WebGL, reduced motion, screen readers,
 * a projector with a dead GPU) and every node is a real, focusable control.
 */

function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: 1000, h: 600 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const r = e?.contentRect;
      if (r && r.width > 0 && r.height > 0) setSize({ w: Math.round(r.width), h: Math.round(r.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

function glyph(shape: UNode["shape"], r: number) {
  switch (shape) {
    case "box":
      return <rect x={-r * 0.85} y={-r * 0.85} width={r * 1.7} height={r * 1.7} rx={r * 0.12} />;
    case "octa":
      return <polygon points={`0,${-r * 1.15} ${r * 1.05},0 0,${r * 1.15} ${-r * 1.05},0`} />;
    case "prism":
      return <polygon points={[0, 1, 2, 3, 4, 5].map((k) => `${(Math.cos((k * Math.PI) / 3) * r).toFixed(2)},${(Math.sin((k * Math.PI) / 3) * r).toFixed(2)}`).join(" ")} />;
    case "ring":
      return <circle r={r * 0.8} fill="none" strokeWidth={r * 0.36} />;
    default:
      return <circle r={r} />;
  }
}

export function UniverseFlat({
  model,
  theme,
  selectedId,
  hoveredId,
  onSelect,
  onHover,
  dress,
  interactive = true,
  labels = true,
  posture = "focus",
  className,
}: {
  model: UniverseModel;
  theme: ThemeDef;
  selectedId: string | null;
  hoveredId: string | null;
  onSelect: (id: string | null) => void;
  onHover: (id: string | null) => void;
  dress: TeamDressing;
  interactive?: boolean;
  labels?: boolean;
  posture?: "focus" | "overview";
  className?: string;
}) {
  const [box, { w, h }] = useSize<HTMLDivElement>();
  const C = theme.universe.colors;
  // "Focus" fits the acts around the frontier; "overview" fits the whole case.
  const current = model.acts.filter((a) => a.started).at(-1)?.index ?? 0;
  const win = posture === "focus" && model.acts.length > 3 ? { from: current - 1, to: current + 1 } : undefined;
  const flat = useMemo(() => flatten(model, w, h, Math.min(72, Math.max(28, w * 0.06)), win), [model, w, h, win?.from, win?.to]); // eslint-disable-line react-hooks/exhaustive-deps
  const tone = (n: UNode) => (n.suspicious ? C.suspicious : n.state === "locked" ? C.locked : n.state === "discovered" ? C.discovered : n.state === "available" ? C.available : n.state === "completed" ? C.completed : C.failed);
  const scaleOf = (i: number) => {
    const n = model.nodes[i]!;
    return Math.min(1.5, Math.max(0.7, (flat.scale / 13) * n.radius));
  };

  return (
    <div ref={box} className={className} style={{ position: "absolute", inset: 0 }}>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role={interactive ? "group" : "img"} aria-label="Investigation map" className="u-flat">
        <defs>
          <filter id="u-glow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="3.2" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {/* threads */}
        <g fill="none">
          {model.edges.map((e, k) => {
            const a = flat.nodes[e.from]!;
            const b = flat.nodes[e.to]!;
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const sag = theme.universe.layout === "wall" ? Math.min(26, Math.hypot(dx, dy) * 0.12) : -Math.hypot(dx, dy) * 0.1;
            const mx = (a.x + b.x) / 2;
            const my = (a.y + b.y) / 2 + sag;
            const col = e.flow === "dormant" ? C.edge : C.edgeLive;
            return (
              <path
                key={k}
                d={`M ${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}`}
                stroke={col}
                strokeWidth={theme.universe.edgeStyle === "string" ? 2 : 1.4}
                strokeOpacity={e.flow === "dormant" ? 0.4 : e.flow === "done" ? 0.55 : 0.9}
                strokeDasharray={e.flow === "dormant" ? "3 6" : undefined}
                className={e.flow === "live" ? "u-flat-live" : undefined}
              />
            );
          })}
        </g>
        {/* files */}
        {model.nodes.map((n, i) => {
          const p = flat.nodes[i]!;
          const r = 13 * scaleOf(i);
          const col = tone(n);
          const active = n.id === selectedId;
          const hot = n.id === hoveredId;
          const locked = n.state === "locked";
          const fill = n.state === "available" ? col : n.state === "completed" ? col : n.state === "discovered" ? col : "transparent";
          return (
            <g
              key={n.id}
              transform={`translate(${p.x} ${p.y})`}
              role={interactive ? "button" : undefined}
              tabIndex={interactive ? 0 : undefined}
              aria-label={n.label}
              aria-pressed={interactive ? active : undefined}
              data-state={n.state}
              data-node={n.id}
              onPointerEnter={() => interactive && onHover(n.id)}
              onPointerLeave={() => interactive && onHover(null)}
              onFocus={() => interactive && onHover(n.id)}
              onBlur={() => interactive && onHover(null)}
              onClick={(e) => {
                e.stopPropagation();
                if (interactive) onSelect(active ? null : n.id);
              }}
              onKeyDown={(e) => {
                if (interactive && (e.key === "Enter" || e.key === " ")) {
                  e.preventDefault();
                  onSelect(active ? null : n.id);
                }
              }}
              style={{ cursor: interactive ? "pointer" : "default", outline: "none" }}
              className="u-flat-node"
            >
              <circle r={r * 2.6} fill="transparent" />
              {n.state === "available" ? <circle r={r * 1.7} fill="none" stroke={col} strokeOpacity={0.45} className="u-flat-pulse" /> : null}
              {n.isNew ? <circle r={r * 2.1} fill="none" stroke={col} strokeOpacity={0.6} strokeDasharray="2 5" className="u-flat-orbit" /> : null}
              {n.suspicious ? <circle r={r * 1.55} fill="none" stroke={C.suspicious} strokeWidth={1.4} strokeDasharray="4 3" className="u-flat-orbit" /> : null}
              {n.state === "completed" ? <circle r={r * 1.5} fill="none" stroke={col} strokeOpacity={0.5} /> : null}
              <g
                fill={fill}
                fillOpacity={locked ? 0 : n.state === "discovered" ? 0.28 + 0.3 * n.progress : n.state === "completed" ? 0.35 : n.state === "failed" ? 0.2 : 0.92}
                stroke={col}
                strokeWidth={locked ? 1 : 1.6}
                strokeOpacity={locked ? 0.55 : 1}
                strokeDasharray={locked ? "3 3" : n.state === "failed" ? "5 3" : undefined}
                filter={n.state === "available" || active ? "url(#u-glow)" : undefined}
                opacity={locked ? 0.7 : 1}
              >
                {glyph(n.shape, r)}
              </g>
              {n.state === "completed" ? <path d={`M ${-r * 0.4} 0 L ${-r * 0.1} ${r * 0.32} L ${r * 0.45} ${-r * 0.3}`} fill="none" stroke={C.backdrop} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /> : null}
              {n.state === "failed" ? <path d={`M ${-r * 0.4} ${-r * 0.4} L ${r * 0.4} ${r * 0.4} M ${r * 0.4} ${-r * 0.4} L ${-r * 0.4} ${r * 0.4}`} stroke={col} strokeWidth={2} strokeLinecap="round" /> : null}
              {active || hot ? <circle r={r * 1.9} fill="none" stroke={col} strokeWidth={1.4} strokeOpacity={0.9} /> : null}
              {labels && (n.state === "available" || active || hot) ? (
                <g className="u-flat-label" pointerEvents="none">
                  <text y={r * 2.35 + 12} textAnchor="middle" fontSize={11} fontFamily="var(--font-mono)" fill="var(--color-ink)" stroke="var(--color-bg)" strokeWidth={3} paintOrder="stroke" letterSpacing="0.02em">
                    {n.title ?? "Classified file"}
                  </text>
                  {active || hot ? (
                    <text y={r * 2.35 + 25} textAnchor="middle" fontSize={9.5} fontFamily="var(--font-mono)" fill="var(--color-mute)" stroke="var(--color-bg)" strokeWidth={3} paintOrder="stroke" letterSpacing="0.1em">
                      {dress.fileCode(n.id)}
                      {n.state !== "locked" ? ` · ${n.points} PTS` : ""}
                    </text>
                  ) : null}
                </g>
              ) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
