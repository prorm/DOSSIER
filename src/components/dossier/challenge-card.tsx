"use client";

import { CalendarClock, Check, Droplet, Lock } from "lucide-react";
import Link from "next/link";

import SpotlightCard from "@/components/reactbits/SpotlightCard";
import DecryptedText from "@/components/reactbits/DecryptedText";
import { Badge } from "@/components/ui/badge";
import { isOpenView } from "@/lib/challenge";
import { challengeHref } from "@/lib/modes";
import { cn } from "@/lib/utils";
import type { ChallengeView } from "@/server/engine/play";
import { LocalTime } from "./local-time";

const DIFF: Record<string, string> = { easy: "text-signal-green", medium: "text-signal-cyan", hard: "text-signal-amber", insane: "text-signal-magenta" };

function when(iso: string) {
  return <LocalTime iso={iso} format="day-time" />;
}

/**
 * Challenge card — the atomic unit of play. Open cards are tactile (spotlight on
 * fine pointers, 1px press) and link to the detail. Solved cards go quiet with a
 * green edge. Locked/scheduled cards are *structural only*: the server never sent
 * their title or body, so the card cannot leak them.
 */
export function ChallengeCard({ c, fresh, depTitles }: { c: ChallengeView; fresh?: boolean; depTitles?: Map<string, string> }) {
  if (!isOpenView(c)) {
    const deps = [...(c.requires?.all ?? []), ...(c.requires?.any ?? [])];
    const names = deps.map((d) => depTitles?.get(d)).filter(Boolean) as string[];
    return (
      <div
        className="panel relative flex min-h-36 flex-col gap-3 border-dashed p-4 text-mute"
        aria-label={c.state === "scheduled" ? "Scheduled challenge" : "Locked challenge"}
      >
        <div className="flex items-center justify-between">
          <span className="label-mono">{c.category ?? c.mode}</span>
          {c.state === "scheduled" ? <CalendarClock className="size-4 text-signal-amber" aria-hidden="true" /> : <Lock className="size-4" aria-hidden="true" />}
        </div>
        <p className="font-mono text-sm uppercase tracking-[0.2em] text-faint select-none" aria-hidden="true">
          ▓▓▓▓▓ ▓▓▓▓
        </p>
        <p className="mt-auto font-mono text-[0.7rem] uppercase tracking-[0.08em]">
          {c.state === "scheduled" && c.opensAt ? (
            <span className="text-signal-amber">Opens {when(c.opensAt)}</span>
          ) : names.length ? (
            <>
              Requires {c.requires?.any.length && !c.requires.all.length ? "any of" : ""} <span className="text-ink-dim">{names.join(", ")}</span>
            </>
          ) : (
            "Classified — solve linked challenges to open"
          )}
        </p>
      </div>
    );
  }

  const solved = c.state === "solved";
  return (
    <SpotlightCard
      className={cn(
        "panel pressable group flex min-h-36 flex-col focus-within:border-[var(--accent)] hover:border-line-strong",
        solved && "border-[color-mix(in_srgb,var(--color-signal-green)_35%,var(--color-line))] bg-[color-mix(in_srgb,var(--color-signal-green)_3%,var(--color-surface))]",
        fresh && "glow",
      )}
      spotlightColor={solved ? "color-mix(in srgb, var(--color-signal-green) 10%, transparent)" : undefined}
    >
      <Link href={challengeHref(c.id)} className="flex flex-1 flex-col gap-2.5 p-4 outline-none">
        <div className="flex items-center justify-between gap-2">
          <span className="label-mono truncate">{c.category ?? c.mode}</span>
          <div className="flex items-center gap-1.5">
            {fresh ? <Badge variant="accent">New</Badge> : null}
            {c.difficulty ? <span className={cn("font-mono text-[0.62rem] uppercase tracking-[0.1em]", DIFF[c.difficulty])}>{c.difficulty}</span> : null}
          </div>
        </div>
        <h3 className={cn("font-mono text-[0.95rem] font-semibold leading-snug", solved ? "text-ink-dim" : "text-ink")}>
          {fresh ? <DecryptedText text={c.title} animateOn="view" sequential speed={25} /> : c.title}
        </h3>
        <div className="mt-auto flex items-end justify-between gap-2 pt-2">
          <div className="flex items-center gap-3 font-mono text-[0.68rem] uppercase tracking-[0.08em] text-mute">
            <span>
              {c.solves} {c.solves === 1 ? "solve" : "solves"}
            </span>
            {c.firstBlood ? (
              <span className="inline-flex items-center gap-1 text-signal-magenta" title={`First blood: ${c.firstBlood}`}>
                <Droplet className="size-3" aria-hidden="true" />
                <span className="sr-only">First blood by </span>
                <span className="max-w-24 truncate normal-case tracking-normal">{c.firstBlood}</span>
              </span>
            ) : c.mode === "ctf" && c.firstBloodBonus > 0 && !solved ? (
              <span className="text-signal-magenta/80">+{c.firstBloodBonus} first blood</span>
            ) : null}
          </div>
          {solved ? (
            <span className="inline-flex items-center gap-1 font-mono text-sm font-semibold text-signal-green">
              <Check className="size-4" aria-hidden="true" />
              <span className="sr-only">Solved,</span>
              {c.value}
            </span>
          ) : (
            <span className="num text-lg font-semibold text-signal">
              {c.value}
              <span className="ml-0.5 text-[0.6rem] text-mute">pts</span>
            </span>
          )}
        </div>
      </Link>
    </SpotlightCard>
  );
}
