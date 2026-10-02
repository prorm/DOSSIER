"use client";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * The window every workstation lives in. The chrome tells you what kind of
 * place this is before you read a word: a terminal, a browser, a lightbox, a
 * dossier sheet. Theme tokens dress it (paper, glass, slab, console).
 */
export type WindowVariant = "term" | "browser" | "lens" | "sheet";

export function Window({
  variant = "term",
  title,
  subtitle,
  icon: Icon,
  address,
  actions,
  className,
  bodyClassName,
  children,
}: {
  variant?: WindowVariant;
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: LucideIcon;
  /** Browser variant: the (synthetic) address shown in the bar. */
  address?: string;
  actions?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("win panel", `win-${variant}`, className)}>
      <header className="win-bar">
        {variant === "browser" ? (
          <span className="win-nav" aria-hidden="true">
            <i>‹</i>
            <i>›</i>
            <i>↻</i>
          </span>
        ) : null}
        {Icon && variant !== "browser" ? <Icon className="size-3.5 text-signal-2" aria-hidden="true" /> : null}
        {variant === "browser" ? (
          <span className="win-address" title="A synthetic site generated for your team">
            <span aria-hidden="true">🔒</span>
            <b>{address ?? "intranet.local"}</b>
          </span>
        ) : (
          <span className="win-title">{title}</span>
        )}
        {subtitle ? <span className="win-sub">{subtitle}</span> : null}
        {actions ? <span className="win-actions">{actions}</span> : null}
      </header>
      <div className={cn("win-body", bodyClassName)}>{children}</div>
    </section>
  );
}

export function Tile({ ch, dim, hot }: { ch: string; dim?: boolean; hot?: boolean }) {
  return <span className={cn("tile", dim && "is-dim", hot && "is-hot", ch === " " && "is-gap")}>{ch === " " ? " " : ch}</span>;
}

/** Text as letter tiles – a ruler you can read a cipher against. */
export function TileRow({ text, max = 64, className }: { text: string; max?: number; className?: string }) {
  const chars = [...text].slice(0, max);
  return (
    <span className={cn("tile-row", className)} aria-label={text}>
      {chars.map((c, i) => (
        <Tile key={i} ch={c} />
      ))}
      {[...text].length > max ? <Tile ch="…" dim /> : null}
    </span>
  );
}

export function Chip({ children, tone = "mute", className }: { children: ReactNode; tone?: "mute" | "ok" | "warn" | "bad" | "info" | "accent"; className?: string }) {
  return <span className={cn("chip", `chip-${tone}`, className)}>{children}</span>;
}

/** The question in force, set apart as the mission of this room. */
export function Question({ q, format }: { q?: string; format?: string }) {
  if (!q) return null;
  return (
    <div className="question panel">
      <p className="label-mono mb-1">The question</p>
      <p className="font-display text-[1.05rem] leading-snug text-ink">{q}</p>
      {format ? <p className="mt-1.5 font-mono text-[0.7rem] text-mute">Answer format · {format}</p> : null}
    </div>
  );
}
