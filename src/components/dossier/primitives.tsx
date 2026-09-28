import { AlertTriangle, Inbox, Lock, RadioTower, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/* ─────────────────────────── Headings ─────────────────────────── */

export function PageHeader({
  eyebrow,
  title,
  children,
  actions,
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-col gap-3 pb-5 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        {eyebrow ? <p className="label-mono mb-1.5 flex items-center gap-2">{eyebrow}</p> : null}
        <h1 className="text-xl font-semibold uppercase tracking-[0.04em] sm:text-2xl">{title}</h1>
        {children ? <div className="mt-2 max-w-2xl text-sm text-ink-dim">{children}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function SectionTitle({ children, meta, className, id }: { children: ReactNode; meta?: ReactNode; className?: string; id?: string }) {
  return (
    <div className={cn("mb-3 flex items-center gap-3", className)}>
      <h2 id={id} className="label-mono text-ink-dim">
        {children}
      </h2>
      <span aria-hidden="true" className="h-px flex-1 bg-line" />
      {meta ? <span className="label-mono">{meta}</span> : null}
    </div>
  );
}

/* ─────────────────────────── Panels ─────────────────────────── */

export function Panel({ children, className, as: Tag = "section", ...rest }: { children: ReactNode; className?: string; as?: "section" | "div" | "article" | "aside" } & Record<string, unknown>) {
  return (
    <Tag className={cn("panel p-4 sm:p-5", className)} {...rest}>
      {children}
    </Tag>
  );
}

export function Stat({ label, value, hint, tone }: { label: ReactNode; value: ReactNode; hint?: ReactNode; tone?: "accent" | "warn" | "danger" | "info" }) {
  const toneClass =
    tone === "accent" ? "text-signal" : tone === "warn" ? "text-signal-amber" : tone === "danger" ? "text-signal-magenta" : tone === "info" ? "text-signal-cyan" : "text-ink";
  return (
    <div className="panel brackets flex flex-col gap-1 px-4 py-3">
      <span className="label-mono">{label}</span>
      <span className={cn("num text-2xl font-semibold leading-none", toneClass)}>{value}</span>
      {hint ? <span className="text-xs text-mute">{hint}</span> : null}
    </div>
  );
}

/* ─────────────────────────── States ─────────────────────────── */

interface StateProps {
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
}

function StateFrame({ icon: Icon, tone, title, children, action, className, compact, code }: StateProps & { icon: LucideIcon; tone: string; code: string }) {
  return (
    <div
      className={cn(
        "panel relative flex flex-col items-center justify-center gap-3 overflow-hidden text-center",
        compact ? "px-4 py-8" : "px-6 py-14",
        className,
      )}
    >
      <div aria-hidden="true" className="grid-bg absolute inset-0 opacity-40 [mask-image:radial-gradient(60%_60%_at_50%_40%,#000,transparent)]" />
      <div className={cn("relative grid size-11 place-items-center rounded-sm border", tone)}>
        <Icon className="size-5" aria-hidden="true" />
      </div>
      <p className="label-mono relative">{code}</p>
      <h2 className="relative font-mono text-base font-semibold uppercase tracking-[0.05em]">{title}</h2>
      {children ? <div className="relative max-w-md text-sm text-ink-dim">{children}</div> : null}
      {action ? <div className="relative mt-2">{action}</div> : null}
    </div>
  );
}

export function EmptyState(p: StateProps) {
  return <StateFrame icon={Inbox} tone="border-line-strong text-mute" code="// no records" {...p} />;
}

export function ErrorState(p: StateProps) {
  return <StateFrame icon={AlertTriangle} tone="border-[color-mix(in_srgb,var(--color-signal-magenta)_50%,transparent)] text-signal-magenta" code="// fault" {...p} />;
}

export function LockedState(p: StateProps) {
  return <StateFrame icon={Lock} tone="border-[color-mix(in_srgb,var(--color-signal-amber)_45%,transparent)] text-signal-amber" code="// classified" {...p} />;
}

export function StandbyState(p: StateProps) {
  return <StateFrame icon={RadioTower} tone="border-[color-mix(in_srgb,var(--accent-2)_45%,transparent)] text-signal-2" code="// standby" {...p} />;
}

/* ─────────────────────────── Skeletons ─────────────────────────── */

export function SkeletonCards({ count = 6, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("grid gap-3 sm:grid-cols-2 lg:grid-cols-3", className)} aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="panel flex h-36 flex-col gap-3 p-4">
          <div className="skeleton h-3 w-20" />
          <div className="skeleton h-5 w-3/4" />
          <div className="mt-auto flex justify-between">
            <div className="skeleton h-3 w-16" />
            <div className="skeleton h-3 w-10" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SkeletonRows({ count = 8 }: { count?: number }) {
  return (
    <div className="panel divide-y divide-line" aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3">
          <div className="skeleton h-4 w-6" />
          <div className="skeleton h-4 flex-1" />
          <div className="skeleton h-4 w-14" />
        </div>
      ))}
    </div>
  );
}

/** Loading screen for route segments: a console-voiced placeholder, never a bare spinner. */
export function RouteLoading({ label = "Loading", variant = "cards" }: { label?: string; variant?: "cards" | "rows" | "detail" }) {
  return (
    <div className="animate-reveal-up">
      <div className="mb-6 flex items-center gap-3">
        <span className="size-2 animate-pulse-dot rounded-full bg-signal" aria-hidden="true" />
        <span className="label-mono">{label}…</span>
      </div>
      {variant === "cards" ? <SkeletonCards /> : variant === "rows" ? <SkeletonRows /> : (
        <div className="panel flex flex-col gap-4 p-5" aria-busy="true">
          <div className="skeleton h-6 w-1/2" />
          <div className="skeleton h-3 w-full" />
          <div className="skeleton h-3 w-5/6" />
          <div className="skeleton h-3 w-2/3" />
          <div className="skeleton mt-4 h-10 w-full" />
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────── Misc ─────────────────────────── */

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-xs border border-line-strong bg-bg px-1 font-mono text-[0.65rem] text-mute">
      {children}
    </kbd>
  );
}

export function Dot({ tone = "accent", pulse }: { tone?: "accent" | "warn" | "danger" | "info" | "mute"; pulse?: boolean }) {
  const c = tone === "accent" ? "bg-signal" : tone === "warn" ? "bg-signal-amber" : tone === "danger" ? "bg-signal-magenta" : tone === "info" ? "bg-signal-cyan" : "bg-mute";
  return <span aria-hidden="true" className={cn("inline-block size-1.5 shrink-0 rounded-full", c, pulse && "animate-pulse-dot")} />;
}
