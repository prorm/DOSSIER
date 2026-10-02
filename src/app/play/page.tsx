import { FolderSearch, Megaphone, Radio, Trophy } from "lucide-react";
import Link from "next/link";

import { Countdown } from "@/components/dossier/countdown";
import { LocalTime } from "@/components/dossier/local-time";
import { Markdown } from "@/components/dossier/markdown";
import { EmptyState, SectionTitle } from "@/components/dossier/primitives";
import { DeckCounts, OpenFiles } from "@/components/experience/deck/deck";
import { Badge } from "@/components/ui/badge";
import { nodeHref } from "@/lib/modes";
import { cn } from "@/lib/utils";
import { listAnnouncements } from "@/server/engine/admin";
import { eventPhase } from "@/server/engine/event";
import { getLeaderboard } from "@/server/engine/leaderboard";
import { teamOverview } from "@/server/game/engine";
import { requireTeamPage } from "@/server/page-auth";
import { eventView } from "@/server/views";

export const metadata = { title: "Console" };

/**
 * The deck. The investigation itself is the page: the case universe fills the
 * screen behind, and these panels are the instruments floating over it — where
 * am I, what is my objective, what can I open, what just changed.
 */
export default async function ConsoleHome() {
  const { session, event, db } = await requireTeamPage("/play");
  const ev = eventView(event);
  const teamId = session.team.id;
  const [o, lb, anns] = await Promise.all([teamOverview(db, event, teamId), getLeaderboard(db, event.id, "public"), listAnnouncements(db, event.id, 5)]);
  const phase = eventPhase(event);
  const top = lb.standings.filter((s) => !s.disqualified).slice(0, 5);
  const me = lb.standings.find((s) => s.teamId === teamId);
  const standby = phase === "standby" && session.team.kind !== "playtest";

  return (
    <div className="mx-auto w-full max-w-[1500px]">
      {/* On phones the universe owns the first screen; the instruments slide up over it. */}
      <div className="pointer-events-none h-[44dvh] md:hidden" aria-hidden="true" />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 md:grid-cols-[minmax(0,370px)_minmax(0,1fr)_minmax(0,310px)]">
        {/* ── left: the case, the objective, what's open ── */}
        <section className="pointer-events-auto space-y-5 md:max-h-[calc(100dvh-8rem)] md:overflow-y-auto md:pr-1 md:[scrollbar-width:none]" aria-label="Case">
          <header className="space-y-3">
            <p className="label-mono flex flex-wrap items-center gap-2">
              {o.story.codename ? `${o.story.codename} · ` : ""}Operative console · {session.team.name}
              {session.team.kind === "playtest" ? <Badge variant="warning">playtest</Badge> : null}
            </p>
            <h1 className="text-balance font-display text-3xl leading-[1.02] font-semibold sm:text-[2.6rem]">{o.story.title || ev.name}</h1>
            <p className="max-w-md text-sm text-ink-dim">{o.story.premise || ev.tagline}</p>
            <DeckCounts solved={o.counts.solved} total={o.counts.total} evidence={o.counts.evidence} evidenceTotal={o.counts.evidenceTotal} />
          </header>

          <section aria-labelledby="obj" className="panel hud-glass brackets p-4 sm:p-5">
            <p id="obj" className="label-mono">
              Current objective
            </p>
            <h2 className="mt-2 font-display text-lg font-semibold uppercase tracking-[0.04em]">{o.objective.title}</h2>
            <p className="mt-1 text-sm text-ink-dim">{o.objective.detail}</p>
          </section>

          <section aria-labelledby="open">
            <SectionTitle id="open" meta={`${o.counts.open} open`}>
              Open files
            </SectionTitle>
            {o.counts.open === 0 ? (
              <EmptyState compact title={standby ? "Standing by" : "Nothing open"}>
                {standby ? "Files open when the event starts." : "Tap a hidden file on the map to see what it needs."}
              </EmptyState>
            ) : (
              <OpenFiles />
            )}
          </section>

          {o.story.briefing ? (
            <details className="panel hud-glass group p-4" open={o.counts.solved === 0}>
              <summary className="label-mono flex cursor-pointer list-none items-center gap-2 text-ink-dim marker:hidden">
                <FolderSearch className="size-3.5" aria-hidden="true" /> Case briefing
              </summary>
              <Markdown className="mt-3">{o.story.briefing}</Markdown>
            </details>
          ) : null}
        </section>

        <div className="hidden md:block" aria-hidden="true" />

        {/* ── right: clock, what changed, standings, comms ── */}
        <aside className="pointer-events-auto space-y-5 md:max-h-[calc(100dvh-8rem)] md:overflow-y-auto md:pl-1 md:[scrollbar-width:none]" aria-label="Situation">
          {phase === "live" && ev.endsAt ? (
            <div className="panel hud-glass flex items-baseline justify-between px-4 py-3">
              <p className="label-mono">Time remaining</p>
              <Countdown to={ev.endsAt} label="Time remaining" className="font-display text-2xl font-semibold text-ink" />
            </div>
          ) : phase === "standby" && ev.startsAt ? (
            <div className="panel hud-glass flex items-baseline justify-between px-4 py-3">
              <p className="label-mono">Starts in</p>
              <Countdown to={ev.startsAt} label="Starts in" className="font-display text-2xl font-semibold text-signal-2" />
            </div>
          ) : null}

          <section aria-labelledby="feed">
            <SectionTitle id="feed">What changed</SectionTitle>
            {o.feed.length === 0 ? (
              <EmptyState compact title="Quiet so far">
                Unlocks, evidence and discoveries appear here as they happen.
              </EmptyState>
            ) : (
              <ol className="panel hud-glass max-h-72 divide-y divide-line overflow-y-auto">
                {o.feed.slice(0, 20).map((f) => (
                  <li key={f.seq} className="flex gap-3 px-3 py-2.5">
                    <span
                      aria-hidden="true"
                      className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", f.type === "node.solved" ? "bg-signal-green" : f.type === "evidence.gained" ? "bg-signal-cyan" : f.type === "node.unlocked" ? "bg-[var(--accent)]" : "bg-mute")}
                    />
                    <div className="min-w-0">
                      <p className="text-[0.82rem] leading-snug text-ink">
                        {f.node && f.type.startsWith("node.") ? (
                          <Link href={nodeHref(f.node)} className="hover:underline">
                            {f.text}
                          </Link>
                        ) : (
                          f.text
                        )}
                      </p>
                      <p className="font-mono text-[0.6rem] text-faint">
                        <LocalTime iso={f.at} />
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section aria-labelledby="standing">
            <SectionTitle id="standing" meta={lb.frozen ? "frozen" : undefined}>
              Standings
            </SectionTitle>
            <div className="panel hud-glass !p-0">
              <ol className="divide-y divide-line">
                {top.map((s) => (
                  <li key={s.teamId} className={cn("flex items-center gap-3 px-4 py-2", s.teamId === teamId && "bg-[color-mix(in_srgb,var(--accent)_9%,transparent)]")}>
                    <span className="num w-5 text-xs text-mute">{s.rank}</span>
                    <span className="flex-1 truncate font-display text-[0.85rem]">{s.name}</span>
                    <span className="num text-sm text-ink">{s.score}</span>
                  </li>
                ))}
                {!top.length ? (
                  <li className="px-4 py-3 text-xs text-mute">
                    <Radio className="mr-1 inline size-3" aria-hidden="true" />
                    No scores yet.
                  </li>
                ) : null}
              </ol>
              <Link href="/play/leaderboard" className="flex items-center justify-center gap-2 border-t border-line py-2.5 font-mono text-[0.66rem] uppercase tracking-[0.12em] text-mute hover:text-ink">
                <Trophy className="size-3.5" aria-hidden="true" /> {me?.rank ? `You are #${me.rank}` : "Full leaderboard"}
              </Link>
            </div>
          </section>

          {anns.length ? (
            <section aria-labelledby="comms">
              <SectionTitle id="comms">Comms</SectionTitle>
              <ol className="panel hud-glass divide-y divide-line">
                {anns.map((a) => (
                  <li key={a.id} className="flex gap-3 px-3 py-2.5">
                    <Megaphone className={cn("mt-0.5 size-4 shrink-0", a.level === "critical" ? "text-signal-magenta" : a.level === "warning" ? "text-signal-amber" : "text-signal-cyan")} aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="font-display text-sm font-semibold">{a.title}</p>
                      {a.body ? <p className="text-[0.82rem] text-ink-dim">{a.body}</p> : null}
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}

          {ev.rulesMd ? (
            <details className="panel hud-glass group p-4">
              <summary className="label-mono cursor-pointer list-none text-ink-dim marker:hidden">
                <span className="mr-2 inline-block transition-transform group-open:rotate-90">›</span>Rules of engagement
              </summary>
              <Markdown className="mt-3">{ev.rulesMd}</Markdown>
            </details>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
