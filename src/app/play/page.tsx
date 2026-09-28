import { and, count, eq } from "drizzle-orm";
import { ArrowRight, Binary, Crosshair, FolderSearch, MapPinned, Megaphone, Trophy } from "lucide-react";
import Link from "next/link";

import { Countdown } from "@/components/dossier/countdown";
import { Markdown } from "@/components/dossier/markdown";
import { EmptyState, PageHeader, Panel, SectionTitle } from "@/components/dossier/primitives";
import SpotlightCard from "@/components/reactbits/SpotlightCard";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { checkpointScans, checkpoints } from "@/server/db/schema";
import { listAnnouncements } from "@/server/engine/admin";
import { eventPhase } from "@/server/engine/event";
import { caseFile } from "@/server/engine/inquest";
import { getLeaderboard } from "@/server/engine/leaderboard";
import { teamChallenges } from "@/server/engine/play";
import { requireTeamPage } from "@/server/page-auth";
import { eventView } from "@/server/views";
import { LocalTime } from "@/components/dossier/local-time";

export const metadata = { title: "Console" };

export default async function ConsoleHome() {
  const { session, event, db } = await requireTeamPage("/play");
  const ev = eventView(event);
  const teamId = session.team.id;
  const [{ views }, lb, anns, file, [cpTotal], [cpDone]] = await Promise.all([
    teamChallenges(db, event, teamId),
    getLeaderboard(db, event.id, "public"),
    listAnnouncements(db, event.id, 6),
    ev.modes.includes("inquest") ? caseFile(db, event, teamId) : Promise.resolve(null),
    db.select({ n: count() }).from(checkpoints).where(eq(checkpoints.eventId, event.id)),
    db.select({ n: count() }).from(checkpointScans).where(and(eq(checkpointScans.teamId, teamId), eq(checkpointScans.status, "confirmed"))),
  ]);
  const phase = eventPhase(event);
  const stat = (mode: "hunt" | "ctf" | "inquest") => {
    const list = views.filter((v) => v.mode === mode);
    return { solved: list.filter((v) => v.state === "solved").length, total: list.length, open: list.filter((v) => v.state === "open").length };
  };
  const top = lb.standings.filter((s) => !s.disqualified).slice(0, 5);
  const me = lb.standings.find((s) => s.teamId === teamId);

  const tiles = [
    ev.modes.includes("hunt") && {
      href: "/play/hunt",
      icon: Crosshair,
      title: ev.hunt.title,
      kicker: "Treasure hunt",
      ...stat("hunt"),
      line: `${stat("hunt").open} open node${stat("hunt").open === 1 ? "" : "s"}`,
    },
    ev.modes.includes("ctf") && { href: "/play/ctf", icon: Binary, title: "Flag board", kicker: "Capture the flag", ...stat("ctf"), line: `${stat("ctf").open} flags waiting` },
    ev.modes.includes("inquest") &&
      file && {
        href: "/play/inquest",
        icon: FolderSearch,
        title: file.case.title,
        kicker: "Criminal inquest",
        solved: file.evidence.length,
        total: file.evidence.length + file.sealedCount,
        open: 0,
        line: file.accusation.solved ? "Verdict locked in" : file.accusation.locked ? "No attempts left" : `${file.accusation.maxAttempts - file.accusation.attemptsUsed} accusation attempts left`,
        unit: "evidence",
      },
    ev.modes.includes("live") && {
      href: "/play/live",
      icon: MapPinned,
      title: "Field checkpoints",
      kicker: "Live",
      solved: cpDone?.n ?? 0,
      total: cpTotal?.n ?? 0,
      open: 0,
      line: "Scan station codes around campus",
      unit: "confirmed",
    },
  ].filter(Boolean) as { href: string; icon: typeof Crosshair; title: string; kicker: string; solved: number; total: number; open: number; line: string; unit?: string }[];

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={<>Operative console · {session.team.name}</>}
        title={ev.name}
        actions={
          phase === "live" && ev.endsAt ? (
            <div className="panel px-3 py-2 text-right">
              <p className="label-mono">Time remaining</p>
              <Countdown to={ev.endsAt} label="Time remaining" className="text-lg font-semibold text-ink" />
            </div>
          ) : phase === "standby" && ev.startsAt ? (
            <div className="panel px-3 py-2 text-right">
              <p className="label-mono">Starts in</p>
              <Countdown to={ev.startsAt} label="Starts in" className="text-lg font-semibold text-signal-2" />
            </div>
          ) : null
        }
      >
        {ev.tagline}
      </PageHeader>

      <section aria-labelledby="ops">
        <SectionTitle id="ops">Operations</SectionTitle>
        <ul className="grid gap-3 sm:grid-cols-2">
          {tiles.map((t) => {
            const pct = t.total ? t.solved / t.total : 0;
            return (
              <li key={t.href}>
                <SpotlightCard className="panel pressable h-full hover:border-line-strong">
                  <Link href={t.href} className="flex h-full flex-col gap-3 p-4 sm:p-5">
                    <div className="flex items-center justify-between">
                      <span className="label-mono flex items-center gap-2">
                        <t.icon className="size-3.5" aria-hidden="true" /> {t.kicker}
                      </span>
                      <ArrowRight className="size-4 text-mute" aria-hidden="true" />
                    </div>
                    <h3 className="font-mono text-lg font-semibold">{t.title}</h3>
                    <div className="mt-auto">
                      <div className="mb-1.5 flex items-baseline justify-between font-mono text-xs">
                        <span className="text-mute">{t.line}</span>
                        <span className="num">
                          <span className="text-signal">{t.solved}</span>
                          <span className="text-faint">/{t.total}</span> <span className="text-faint">{t.unit ?? "solved"}</span>
                        </span>
                      </div>
                      <div className="h-1 bg-raised" aria-hidden="true">
                        <div className="h-full bg-signal" style={{ width: `${pct * 100}%` }} />
                      </div>
                    </div>
                  </Link>
                </SpotlightCard>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="grid gap-6 [&>*]:min-w-0 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section aria-labelledby="comms">
          <SectionTitle id="comms" meta={anns.length ? `${anns.length} latest` : undefined}>
            Comms
          </SectionTitle>
          {anns.length === 0 ? (
            <EmptyState compact title="Channel quiet">
              Announcements from the organisers appear here and pop up live.
            </EmptyState>
          ) : (
            <ol className="panel divide-y divide-line">
              {anns.map((a) => (
                <li key={a.id} className="flex gap-3 px-4 py-3">
                  <Megaphone
                    className={cn("mt-0.5 size-4 shrink-0", a.level === "critical" ? "text-signal-magenta" : a.level === "warning" ? "text-signal-amber" : "text-signal-cyan")}
                    aria-hidden="true"
                  />
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-mono text-sm font-semibold">
                      {a.title}
                      {a.level !== "info" ? <Badge variant={a.level === "critical" ? "danger" : "warning"}>{a.level}</Badge> : null}
                    </p>
                    {a.body ? <p className="mt-0.5 text-sm text-ink-dim">{a.body}</p> : null}
                    <p className="mt-1 font-mono text-[0.65rem] text-faint"><LocalTime iso={a.createdAt.toISOString()} /></p>
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
          <Panel className="!p-0">
            <ol className="divide-y divide-line">
              {top.map((s) => (
                <li key={s.teamId} className={cn("flex items-center gap-3 px-4 py-2.5", s.teamId === teamId && "bg-[color-mix(in_srgb,var(--accent)_7%,transparent)]")}>
                  <span className="num w-6 text-xs text-mute">{s.rank}</span>
                  <span className="flex-1 truncate font-mono text-sm">{s.name}</span>
                  <span className="num text-sm text-ink">{s.score}</span>
                </li>
              ))}
              {me && !top.some((t) => t.teamId === teamId) && !me.disqualified ? (
                <li className="flex items-center gap-3 bg-[color-mix(in_srgb,var(--accent)_7%,transparent)] px-4 py-2.5">
                  <span className="num w-6 text-xs text-mute">{me.rank}</span>
                  <span className="flex-1 truncate font-mono text-sm">{me.name}</span>
                  <span className="num text-sm">{me.score}</span>
                </li>
              ) : null}
            </ol>
            <Link href="/play/leaderboard" className="flex items-center justify-center gap-2 border-t border-line py-2.5 font-mono text-[0.7rem] uppercase tracking-[0.12em] text-mute hover:text-ink">
              <Trophy className="size-3.5" aria-hidden="true" /> Full leaderboard
            </Link>
          </Panel>
        </section>
      </div>

      {ev.rulesMd ? (
        <details className="panel group p-4 sm:p-5">
          <summary className="label-mono cursor-pointer list-none text-ink-dim marker:hidden">
            <span className="mr-2 inline-block transition-transform group-open:rotate-90">›</span>Rules of engagement
          </summary>
          <Markdown className="mt-3">{ev.rulesMd}</Markdown>
        </details>
      ) : null}
    </div>
  );
}
