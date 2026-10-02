"use client";

import { X } from "lucide-react";
import { useState } from "react";

import { RELATION_STYLE, plausible, suggestRelations, type BoardKind, type RelationKind } from "@/lib/experience/relations";
import { cn } from "@/lib/utils";

const TONE: Record<string, string> = {
  magenta: "var(--color-signal-magenta)",
  green: "var(--color-signal-green)",
  cyan: "var(--color-signal-cyan)",
  amber: "var(--color-signal-amber)",
  ink: "var(--color-ink-dim)",
};

export function Swatch({ kind }: { kind: RelationKind }) {
  const s = RELATION_STYLE[kind];
  return (
    <svg width="34" height="10" viewBox="0 0 34 10" aria-hidden="true" style={{ color: TONE[s.tone] }}>
      <path d="M1 5 H33" stroke="currentColor" strokeWidth={s.width} strokeDasharray={s.dash || undefined} fill="none" strokeLinecap="round" />
      {s.arrow ? <path d="M26 1.5 L33 5 L26 8.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /> : null}
    </svg>
  );
}

/**
 * Choose what a string *means*. Suggestions are relations that make sense for
 * the two kinds of thing being tied (structural, identical for every case);
 * the picker never hints which relation is true.
 */
export function RelationPicker({
  x,
  y,
  from,
  to,
  fromKind,
  toKind,
  current,
  onPick,
  onCancel,
}: {
  x: number;
  y: number;
  from: string;
  to: string;
  fromKind: BoardKind;
  toKind: BoardKind;
  current?: string;
  onPick: (label: string) => void;
  onCancel: () => void;
}) {
  const [note, setNote] = useState("");
  const [hover, setHover] = useState<RelationKind | null>(current && (Object.keys(RELATION_STYLE) as string[]).includes(current) ? (current as RelationKind) : null);
  const good = suggestRelations(fromKind, toKind);
  const preview = hover ?? good[0] ?? null;
  const rest = (Object.keys(RELATION_STYLE) as RelationKind[]).filter((k) => !good.includes(k));
  return (
    <div className="picker panel" style={{ left: x, top: y }} role="dialog" aria-label="Choose the relationship" onPointerDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === "Escape" && onCancel()}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[0.8rem] leading-snug">
          <span className="text-mute">Tie</span> <b className="font-semibold">{from}</b> <span className="text-mute">to</span> <b className="font-semibold">{to}</b>
        </p>
        <button type="button" onClick={onCancel} aria-label="Cancel" className="icon-btn">
          <X className="size-3.5" />
        </button>
      </div>
      <p className="label-mono mt-3 mb-1.5">What does it say?</p>
      {preview ? (
        <p className="pick-sentence" aria-live="polite">
          “{RELATION_STYLE[preview].sentence(from, to)}”
        </p>
      ) : null}
      <ul className="grid grid-cols-2 gap-1.5">
        {good.map((k) => (
          <li key={k}>
            <button type="button" className={cn("pick", current === k && "is-current")} onClick={() => onPick(k)} onPointerEnter={() => setHover(k)} onFocus={() => setHover(k)}>
              <Swatch kind={k} />
              {RELATION_STYLE[k].label}
            </button>
          </li>
        ))}
      </ul>
      {rest.length ? (
        <details className="mt-2">
          <summary className="cursor-pointer font-mono text-[0.62rem] uppercase tracking-[0.12em] text-faint">Other relationships (don&apos;t fit these two)</summary>
          <ul className="mt-1.5 grid grid-cols-2 gap-1.5">
            {rest.map((k) => (
              <li key={k}>
                <button type="button" className="pick is-odd" title={plausible(k, fromKind, toKind).ok ? "" : (plausible(k, fromKind, toKind) as { why: string }).why} onClick={() => onPick(k)}>
                  <Swatch kind={k} />
                  {RELATION_STYLE[k].label}
                </button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      <form
        className="mt-3 flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          onPick(note.trim().slice(0, 60));
        }}
      >
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={60} placeholder="…or a private note" aria-label="Private note on this string" className="picker-input" />
        <button type="submit" className="chip-btn">
          Tie
        </button>
      </form>
      <p className="mt-2 font-mono text-[0.58rem] leading-snug text-faint">Only these relationships are assertions the case can check. A private note is never scored.</p>
    </div>
  );
}
