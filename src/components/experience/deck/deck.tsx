"use client";

import { ArrowRight, Sparkles } from "lucide-react";
import Link from "next/link";
import { useState, useSyncExternalStore } from "react";

import { useUniverse } from "@/components/experience/universe/universe-stage";
import { FAMILY_LABEL, nodeHref } from "@/lib/modes";
import type { UNode } from "@/lib/experience/universe";
import { cn } from "@/lib/utils";

function subscribeWide(cb: () => void) {
  const mq = window.matchMedia("(min-width: 1024px)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

/** Family glyph: the same silhouette the file wears in the universe. */
export function Glyph({ shape, className }: { shape: UNode["shape"]; className?: string }) {
  return (
    <svg viewBox="-12 -12 24 24" className={cn("size-5 shrink-0", className)} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
      {shape === "box" ? <rect x="-7" y="-7" width="14" height="14" rx="1.5" /> : null}
      {shape === "octa" ? <polygon points="0,-9 8,0 0,9 -8,0" /> : null}
      {/* Hard-coded: trig output can differ in the last digit between the server and the browser, which is a hydration mismatch. */}
      {shape === "prism" ? <polygon points="8,0 4,6.93 -4,6.93 -8,0 -4,-6.93 4,-6.93" /> : null}
      {shape === "ring" ? <circle r="6.5" strokeWidth="3.4" /> : null}
      {shape === "ico" ? <circle r="7.5" /> : null}
    </svg>
  );
}

/**
 * The files you can open right now. Hovering a row lights the same file in the
 * universe (and the other way round): one object, two views.
 */
export function OpenFiles({ className }: { className?: string }) {
  const u = useUniverse();
  const open = u.model.nodes.filter((n) => n.state === "available");
  if (!open.length) return null;
  return (
    <ul className={cn("space-y-1.5", className)} aria-label="Open files">
      {open.map((n) => {
        const active = u.hoveredId === n.id || u.selectedId === n.id;
        return (
          <li key={n.id}>
            <Link
              href={nodeHref(n.id)}
              onPointerEnter={() => u.hover(n.id)}
              onPointerLeave={() => u.hover(null)}
              onFocus={() => u.hover(n.id)}
              onBlur={() => u.hover(null)}
              className={cn("group pressable panel hud-glass flex items-center gap-3 px-3 py-2.5 transition-[border-color,transform]", active ? "!border-[var(--accent)] translate-x-1" : "hover:border-line-strong")}
            >
              <Glyph shape={n.shape} className={cn(n.suspicious ? "text-signal-amber" : "text-signal")} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate font-display text-[0.86rem] font-semibold">{n.title}</span>
                  {n.isNew ? <span className="unread-dot" title="Untouched"><span className="sr-only">untouched</span></span> : null}
                </span>
                <span className="block truncate font-mono text-[0.62rem] uppercase tracking-[0.1em] text-faint">
                  {FAMILY_LABEL[n.family] ?? n.family} · {u.dress.fileCode(n.id)}
                </span>
              </span>
              <span className="text-right font-mono text-[0.66rem] leading-tight text-mute">
                <span className="num block text-ink">{n.points}</span>~{n.minutes}m
              </span>
              <ArrowRight className="size-3.5 shrink-0 text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-signal" aria-hidden="true" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

const STATE_DOT: Record<UNode["state"], string> = {
  locked: "bg-line-strong",
  discovered: "bg-signal-cyan/60",
  available: "bg-[var(--accent)] shadow-[0_0_8px_var(--accent)]",
  completed: "bg-signal-green",
  failed: "bg-signal-magenta",
};

/** The whole graph as an index: acts → files. The list twin of the map (keyboard, screen readers, small screens). */
export function MapIndex({ eyebrow }: { eyebrow: string }) {
  const u = useUniverse();
  const wide = useSyncExternalStore(subscribeWide, () => window.matchMedia("(min-width: 1024px)").matches, () => true);
  const [chosen, setChosen] = useState<boolean | null>(null);
  const open = chosen ?? wide;
  const setOpen = (v: boolean) => setChosen(v);
  return (
    <div className="pointer-events-none flex justify-end">
      <aside className="panel hud-glass pointer-events-auto w-full max-w-[320px] !p-0" aria-label="File index">
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
          <span>
            <span className="label-mono block">{eyebrow}</span>
            <h1 className="font-display text-base font-semibold uppercase tracking-[0.05em]">Case map</h1>
          </span>
          {/* Collapsed (phones start here), it says what it holds: the list is the way to every file on a small screen. */}
          <span className={cn("font-mono text-[0.62rem] uppercase tracking-[0.14em]", open ? "text-mute" : "rounded-[var(--r-chip)] border border-[var(--accent)] px-2 py-1 text-signal")}>{open ? "Hide index" : `All ${u.model.nodes.length} files`}</span>
        </button>
        {open ? (
          <div className="max-h-[52dvh] overflow-y-auto border-t border-line px-3 py-3">
            {u.model.acts.map((a) => {
              const ns = u.model.nodes.filter((n) => n.actIndex === a.index);
              return (
                <section key={a.id} className="mb-3 last:mb-0">
                  <p className="label-mono mb-1.5 flex justify-between">
                    <span>
                      Act {a.index + 1} · {a.started ? a.title : "Classified"}
                    </span>
                    <span className="text-faint">
                      {a.done}/{a.count}
                    </span>
                  </p>
                  <ul className="space-y-0.5">
                    {ns.map((n) => {
                      const openable = n.availability === "open" || n.availability === "solved" || n.availability === "failed";
                      const body = (
                        <>
                          <span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-full", STATE_DOT[n.state])} />
                          <span className={cn("min-w-0 flex-1 truncate text-[0.8rem]", n.state === "locked" ? "font-mono text-faint" : "text-ink")}>{n.title ?? `Classified · ${u.dress.fileCode(n.id)}`}</span>
                          <span className="font-mono text-[0.58rem] uppercase tracking-[0.1em] text-faint">{n.state === "available" ? (n.isNew ? "new" : "open") : n.state === "completed" ? "done" : n.scheduled ? "timed" : ""}</span>
                        </>
                      );
                      const cls = cn("flex items-center gap-2.5 rounded-xs px-2 py-1.5 transition-colors", u.selectedId === n.id || u.hoveredId === n.id ? "bg-[color-mix(in_srgb,var(--accent)_12%,transparent)]" : "hover:bg-raised/60");
                      return (
                        <li key={n.id}>
                          {openable ? (
                            <Link href={nodeHref(n.id)} className={cls} onPointerEnter={() => u.hover(n.id)} onPointerLeave={() => u.hover(null)} onFocus={() => u.hover(n.id)} onBlur={() => u.hover(null)}>
                              {body}
                            </Link>
                          ) : (
                            <button type="button" className={cn(cls, "w-full text-left")} onClick={() => u.select(u.selectedId === n.id ? null : n.id)} onPointerEnter={() => u.hover(n.id)} onPointerLeave={() => u.hover(null)}>
                              {body}
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>
        ) : null}
      </aside>
    </div>
  );
}

/** A quiet count of what has surfaced — used in the deck header. */
export function DeckCounts({ solved, total, evidence, evidenceTotal }: { solved: number; total: number; evidence: number; evidenceTotal: number }) {
  const u = useUniverse();
  return (
    <dl className="flex flex-wrap gap-x-5 gap-y-1 font-mono text-[0.66rem] uppercase tracking-[0.12em] text-mute">
      <div className="flex items-baseline gap-1.5">
        <dt className="sr-only">Files archived</dt>
        <dd>
          <span className="num text-base text-ink">{solved}</span>
          <span className="text-faint">/{total}</span> archived
        </dd>
      </div>
      <div className="flex items-baseline gap-1.5">
        <dt className="sr-only">Exhibits held</dt>
        <dd>
          <span className="num text-base text-ink">{evidence}</span>
          <span className="text-faint">/{evidenceTotal}</span> exhibits
        </dd>
      </div>
      {u.model.counts.suspicious ? (
        <div className="flex items-baseline gap-1.5 text-signal-amber">
          <dt className="sr-only">Anomalies</dt>
          <dd className="flex items-center gap-1.5">
            <Sparkles className="size-3" aria-hidden="true" />
            <span className="num text-base">{u.model.counts.suspicious}</span> anomal{u.model.counts.suspicious === 1 ? "y" : "ies"}
          </dd>
        </div>
      ) : null}
    </dl>
  );
}
