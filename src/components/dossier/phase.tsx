import { Pause, Snowflake, Square, Radio, Hourglass, Ban } from "lucide-react";

import { cn } from "@/lib/utils";
import { LocalTime } from "./local-time";

export type Phase = "standby" | "live" | "paused" | "ended";

const PHASE: Record<Phase, { label: string; cls: string }> = {
  standby: { label: "Standby", cls: "text-signal-2 border-[color-mix(in_srgb,var(--accent-2)_40%,transparent)]" },
  live: { label: "Live", cls: "text-signal border-[color-mix(in_srgb,var(--accent)_45%,transparent)]" },
  paused: { label: "Paused", cls: "text-signal-amber border-[color-mix(in_srgb,var(--color-signal-amber)_45%,transparent)]" },
  ended: { label: "Ended", cls: "text-mute border-line-strong" },
};

/** Always-visible event phase. The dot pulses only while live. */
export function PhaseChip({ phase, frozen, className }: { phase: Phase; frozen?: boolean; className?: string }) {
  const p = PHASE[phase];
  return (
    <span className={cn("inline-flex h-6 items-center gap-1.5 rounded-xs border px-2 font-mono text-[0.65rem] uppercase tracking-[0.12em]", p.cls, className)}>
      <span aria-hidden="true" className={cn("size-1.5 rounded-full bg-current", phase === "live" && "animate-pulse-dot")} />
      {p.label}
      {frozen ? (
        <span className="ml-1 inline-flex items-center gap-1 border-l border-current/30 pl-1.5 text-signal-cyan">
          <Snowflake className="size-3" aria-hidden="true" /> Frozen
        </span>
      ) : null}
    </span>
  );
}

/** Full-width status banner shown under the top bar whenever play is restricted. */
export function PhaseBanner({ phase, frozen, disqualified, startsAt }: { phase: Phase; frozen: boolean; disqualified?: string | null; startsAt?: string | null }) {
  let icon = null;
  let text: React.ReactNode = null;
  let tone = "";
  if (disqualified !== undefined && disqualified !== null) {
    icon = <Ban className="size-4" aria-hidden="true" />;
    text = `Your team has been disqualified${disqualified ? `: ${disqualified}` : ""}. Contact an organiser.`;
    tone = "border-[color-mix(in_srgb,var(--color-signal-magenta)_45%,transparent)] bg-[color-mix(in_srgb,var(--color-signal-magenta)_8%,var(--color-bg))] text-signal-magenta";
  } else if (phase === "standby") {
    icon = <Hourglass className="size-4" aria-hidden="true" />;
    text = startsAt ? (
      <>
        Standing by. Operations begin <LocalTime iso={startsAt} format="full" />.
      </>
    ) : (
      "Standing by. Operations begin when the organisers start the event."
    );
    tone = "border-[color-mix(in_srgb,var(--accent-2)_40%,transparent)] bg-[color-mix(in_srgb,var(--accent-2)_6%,var(--color-bg))] text-signal-2";
  } else if (phase === "paused") {
    icon = <Pause className="size-4" aria-hidden="true" />;
    text = "Event paused. You can read everything; submissions resume shortly.";
    tone = "border-[color-mix(in_srgb,var(--color-signal-amber)_45%,transparent)] bg-[color-mix(in_srgb,var(--color-signal-amber)_7%,var(--color-bg))] text-signal-amber";
  } else if (phase === "ended") {
    icon = <Square className="size-4" aria-hidden="true" />;
    text = "Event over. Final standings are on the leaderboard.";
    tone = "border-line-strong bg-surface text-ink-dim";
  } else if (frozen) {
    icon = <Radio className="size-4" aria-hidden="true" />;
    text = "Scoreboard frozen for the final stretch. Keep solving — your points still count.";
    tone = "border-[color-mix(in_srgb,var(--color-signal-cyan)_40%,transparent)] bg-[color-mix(in_srgb,var(--color-signal-cyan)_6%,var(--color-bg))] text-signal-cyan";
  }
  if (!text) return null;
  return (
    <div role="status" className={cn("border-b px-4 py-2", tone)}>
      <p className="mx-auto flex max-w-6xl items-center gap-2 font-mono text-[0.72rem] uppercase tracking-[0.06em]">
        {icon}
        <span>{text}</span>
      </p>
    </div>
  );
}
