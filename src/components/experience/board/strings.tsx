"use client";

import { useEffect, useState } from "react";

import { NOTE_STYLE, RELATION_STYLE, isRelation, type RelationKind } from "@/lib/experience/relations";
import { cn } from "@/lib/utils";

export interface Pt {
  x: number;
  y: number;
}

const TONE: Record<string, string> = {
  magenta: "var(--color-signal-magenta)",
  green: "var(--color-signal-green)",
  cyan: "var(--color-signal-cyan)",
  amber: "var(--color-signal-amber)",
  ink: "var(--color-ink-dim)",
};

/** A string hangs: a quadratic curve that sags under its own weight (more slack = more sag). */
export function hang(a: Pt, b: Pt, slack = 1) {
  const dist = Math.hypot(b.x - a.x, b.y - a.y);
  const sag = Math.min(150, dist * 0.16 * slack + 6);
  const c: Pt = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 + sag };
  const at = (t: number): Pt => ({
    x: (1 - t) * (1 - t) * a.x + 2 * (1 - t) * t * c.x + t * t * b.x,
    y: (1 - t) * (1 - t) * a.y + 2 * (1 - t) * t * c.y + t * t * b.y,
  });
  return { c, at, mid: at(0.5), dist };
}

function pathOf(a: Pt, c: Pt, b: Pt) {
  return `M ${a.x} ${a.y} Q ${c.x} ${c.y} ${b.x} ${b.y}`;
}

/** A contradiction is a tear, not a line. */
function jagged(at: (t: number) => Pt) {
  const pts: string[] = [];
  const N = 22;
  for (let i = 0; i <= N; i++) {
    const p = at(i / N);
    const q = at(Math.min(1, (i + 0.5) / N));
    const d = { x: q.x - p.x, y: q.y - p.y };
    const l = Math.hypot(d.x, d.y) || 1;
    const off = i === 0 || i === N ? 0 : i % 2 ? 5 : -5;
    pts.push(`${(p.x - (d.y / l) * off).toFixed(1)},${(p.y + (d.x / l) * off).toFixed(1)}`);
  }
  return `M ${pts.join(" L ")}`;
}

/** Everything about how one string looks, shared by the cord and its label so they always agree. */
function styleOf(label: string, sensible: boolean) {
  const kind: RelationKind | null = isRelation(label) ? (label.trim().toLowerCase() as RelationKind) : null;
  const st = kind ? RELATION_STYLE[kind] : null;
  return {
    st,
    width: st?.width ?? NOTE_STYLE.width,
    color: sensible ? TONE[st?.tone ?? NOTE_STYLE.tone]! : "var(--color-signal-magenta)",
    text: kind ? st!.label : label.trim().slice(0, 28),
    // A pairing that makes no sense hangs slack: the string itself says "that doesn't fit".
    slack: sensible ? 1 : 2.4,
  };
}

/** The text a string's chip shows (the relation's name, or the team's own note). */
export function chipText(label: string): string {
  return styleOf(label, true).text;
}

/**
 * A freshly tied string is pulled taut and then settles: its slack overshoots and rings
 * down like real thread (a damped spring, ~0.9 s). Strings already on the wall are still.
 */
function useSettle(active: boolean): number {
  const [k, setK] = useState(1);
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = () => {
      const t = (performance.now() - t0) / 1000;
      if (t > 0.95) return setK(1);
      setK(1 - 0.85 * Math.exp(-t * 5.2) * Math.cos(t * 15));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active]);
  return active ? k : 1;
}

/** The cord itself (SVG). Its label is a separate HTML chip — see {@link StringLabel}. */
export function StringEdge({ id, a, b, label, sensible, fresh, selected, settle = true }: { id: string; a: Pt; b: Pt; label: string; sensible: boolean; fresh: boolean; selected: boolean; settle?: boolean }) {
  const { st, width, color, slack } = styleOf(label, sensible);
  const spring = useSettle(fresh && settle);
  const g = hang(a, b, slack * spring);
  const d = st?.jagged && sensible ? jagged(g.at) : pathOf(a, g.c, b);
  const p1 = g.at(0.965);
  const p2 = g.at(1);
  const ang = Math.atan2(p2.y - p1.y, p2.x - p1.x);
  const arrow = st?.arrow && sensible ? `${p2.x},${p2.y} ${p2.x - 13 * Math.cos(ang - 0.42)},${p2.y - 13 * Math.sin(ang - 0.42)} ${p2.x - 13 * Math.cos(ang + 0.42)},${p2.y - 13 * Math.sin(ang + 0.42)}` : null;
  const dash = !sensible ? "2 6" : (st?.dash ?? NOTE_STYLE.dash);
  return (
    <g className={cn("string", fresh && "is-new", !sensible && "is-slack", selected && "is-selected")} data-link={id} style={{ color }}>
      <path d={d} fill="none" stroke="#000" strokeOpacity={0.4} strokeWidth={width + 2} transform="translate(1.5 3.5)" strokeLinecap="round" />
      {st?.double && sensible ? (
        <>
          <path d={d} fill="none" stroke="currentColor" strokeWidth={1.6} transform="translate(0 -2.6)" strokeLinecap="round" className="string-main" />
          <path d={d} fill="none" stroke="currentColor" strokeWidth={1.6} transform="translate(0 2.6)" strokeLinecap="round" className="string-main" />
        </>
      ) : (
        <path d={d} fill="none" stroke="currentColor" strokeWidth={width} strokeDasharray={dash || undefined} strokeLinecap="round" strokeLinejoin="round" className="string-main" opacity={sensible ? 1 : 0.7} />
      )}
      {fresh ? <path d={pathOf(a, g.c, b)} fill="none" stroke="currentColor" strokeWidth={width + 0.6} pathLength={1} className="string-draw" strokeLinecap="round" /> : null}
      {arrow ? <polygon points={arrow} fill="currentColor" className="string-arrow" /> : null}
      {/* pin head where the string is fastened */}
      <circle cx={a.x} cy={a.y} r={3.2} fill="currentColor" className="string-pin" />
    </g>
  );
}

/**
 * The string's label, as a real button in the wall's plane. (Not SVG text: browsers
 * re-measure SVG glyphs at odd moments inside a scaled 3D layer and the label drifts
 * out of its chip. HTML text is also what a screen reader and a thumb expect.)
 */
export function StringLabel({
  at,
  label,
  fromKind,
  toKind,
  sensible,
  reason,
  fresh,
  onLabel,
}: {
  /** Where on the string the chip sits (chosen by the wall so it covers no exhibit). */
  at: Pt;
  label: string;
  fromKind: string;
  toKind: string;
  sensible: boolean;
  reason?: string;
  fresh: boolean;
  /** Called with the chip's centre in screen coordinates, so the picker opens right beside it. */
  onLabel: (at: Pt) => void;
}) {
  const { color, text } = styleOf(label, sensible);
  if (!text && sensible) return null;
  return (
    <button
      type="button"
      className={cn("string-chip", fresh && "is-new", !sensible && "is-slack")}
      style={{ left: at.x, top: at.y, color }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        const r = e.currentTarget.getBoundingClientRect();
        onLabel({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
      }}
      title={sensible ? "Change this relationship" : (reason ?? "That pairing doesn't make sense.")}
      aria-label={`${text || "string"} between ${fromKind} and ${toKind}. Change relationship.`}
    >
      {!sensible ? <span aria-hidden="true">⚠</span> : null}
      <span className="t">{text || "?"}</span>
    </button>
  );
}

/** The string in your hand while you drag it from a pin. */
export function TieDraft({ a, b }: { a: Pt; b: Pt }) {
  const g = hang(a, b, 0.7);
  return (
    <g style={{ color: "var(--pin, var(--color-signal-magenta))" }} pointerEvents="none">
      <path d={pathOf(a, g.c, b)} fill="none" stroke="currentColor" strokeWidth={2.2} strokeDasharray="4 6" strokeLinecap="round" className="string-draft" />
      <circle cx={b.x} cy={b.y} r={6} fill="none" stroke="currentColor" strokeWidth={1.6} />
      <circle cx={b.x} cy={b.y} r={2} fill="currentColor" />
    </g>
  );
}
