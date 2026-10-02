import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { HintPanel } from "@/components/dossier/hint-panel";
import { LocalTime } from "@/components/dossier/local-time";
import { LockedState } from "@/components/dossier/primitives";
import { ArchivedRoom } from "@/components/experience/stages/archived";
import { CaseNote, RoomHeader, WhatItTakes } from "@/components/experience/room/room";
import { Stage } from "@/components/experience/stages";
import { STAGE_TITLE, stageOf, type StageContext } from "@/components/experience/stages/types";
import { Button } from "@/components/ui/button";
import { isRelation } from "@/lib/experience/relations";
import { teamDressing } from "@/lib/experience/variation";
import { FAMILY_LABEL, TIER_LABEL } from "@/lib/modes";
import { cn } from "@/lib/utils";
import { eventPhase } from "@/server/engine/event";
import { checkpointUrl, getCheckpoint, teamCheckpointToken } from "@/server/engine/live";
import { env } from "@/server/env";
import { caseFileView, getBoard, nodeDetail } from "@/server/game/engine";
import { presentationFingerprint } from "@/server/game/presentation";
import { requireTeamPage } from "@/server/page-auth";

export const metadata = { title: "Investigation file" };

type V = Record<string, unknown> & { kind?: string };

export default async function NodePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { session, event, db } = await requireTeamPage(`/play/node/${id}`);
  const d = await nodeDetail(db, event, session.team.id, id);
  if (!d) notFound();
  const dress = teamDressing(presentationFingerprint(event.id, session.team.id));
  const back = (
    <Link href="/play/map" className="mb-4 inline-flex items-center gap-1.5 font-mono text-[0.7rem] uppercase tracking-[0.12em] text-mute hover:text-ink">
      <ArrowLeft className="size-3.5" aria-hidden="true" /> Case map
    </Link>
  );

  if (d.card.state === "locked" || d.card.state === "scheduled") {
    return (
      <div className="mx-auto max-w-2xl">
        {back}
        <LockedState
          title={d.card.state === "scheduled" ? "Not yet declassified" : "Classified"}
          action={
            <Button asChild variant="outline">
              <Link href="/play/map">Return to the case map</Link>
            </Button>
          }
        >
          <p className="mb-3 font-mono text-[0.68rem] tracking-[0.2em] text-faint">FILE {dress.fileCode(id)}</p>
          {d.card.state === "scheduled" && d.card.opensAt ? (
            <p>
              Opens at <LocalTime iso={d.card.opensAt} format="full" />.
            </p>
          ) : (
            <ul className="space-y-1 text-left">
              {d.card.requirements.map((r, i) => (
                <li key={i} className={cn("flex items-start gap-2", r.ok ? "text-signal-green" : "text-ink-dim")} style={{ paddingLeft: r.depth * 16 }}>
                  <span aria-hidden="true">{r.ok ? "✓" : "○"}</span> {r.text}
                </li>
              ))}
              {!d.card.requirements.length ? <li>Keep investigating; this file opens when the story reaches it.</li> : null}
            </ul>
          )}
        </LockedState>
      </div>
    );
  }

  const phase = eventPhase(event);
  const playtest = session.team.kind === "playtest";
  const disabledReason =
    session.team.status === "disqualified"
      ? "Your team is disqualified."
      : playtest
        ? null
        : phase === "standby"
          ? "Actions open when the event starts."
          : phase === "paused"
            ? "Event paused — actions resume shortly."
            : phase === "ended"
              ? "The event has ended."
              : null;
  const solved = d.card.state === "solved";
  const failed = d.card.state === "failed";
  const v = (d.view ?? {}) as V;
  const needsCase = v.kind === "interview" || v.kind === "final";
  const file = needsCase ? await caseFileView(db, event, session.team.id) : null;

  let playtestScanUrl: string | null = null;
  if (playtest && d.checkpoint && d.checkpoint.kind === "qr") {
    const cp = await getCheckpoint(db, event.id, d.checkpoint.id);
    if (cp) playtestScanUrl = cp.teamScoped ? `${env().APP_URL.replace(/\/$/, "")}/c/${teamCheckpointToken(cp, session.team.id)}` : checkpointUrl(cp);
  }
  const bp = event.blueprint as { checkpoints?: { id: string; geo?: { lat: number; lon: number } }[] } | null;
  const gpsTarget = playtest && d.checkpoint ? (bp?.checkpoints?.find((c) => c.id === d.checkpoint!.id)?.geo ?? null) : null;

  let board = { placed: 0, strings: 0 };
  if (v.kind === "board") {
    const b = await getBoard(db, event.id, session.team.id);
    board = { placed: Object.keys(b.layout.nodes).length, strings: b.layout.links.filter((l) => isRelation(l.label)).length };
  }

  const ctx: StageContext = {
    nodeId: d.card.id,
    primitive: d.card.primitive,
    view: v,
    artifacts: d.artifacts,
    site: d.site,
    discoveries: d.discoveries,
    tools: d.tools,
    skills: d.skills,
    checkpoint: d.checkpoint,
    disabledReason,
    fingerprint: presentationFingerprint(event.id, session.team.id),
    evidence: file ? file.evidence.map((e) => ({ id: e.id, title: e.title })) : [],
    characters: file ? file.characters.map((c) => ({ id: c.id, name: c.name, suspect: c.suspect, role: c.role })) : [],
    locations: file ? file.locations.map((l) => ({ id: l.id, name: l.name })) : [],
    playtestScanUrl,
    gpsTarget,
    board,
    title: d.card.title ?? "",
  };
  const stageTitle = STAGE_TITLE[stageOf(d.card.primitive)];

  return (
    <article className="room animate-reveal-up" data-stage={stageOf(d.card.primitive)}>
      {back}
      <RoomHeader
        crumbs={[d.act.title, ...(d.round.title.trim().toLowerCase() === d.act.title.trim().toLowerCase() ? [] : [d.round.title]), `${FAMILY_LABEL[d.round.family] ?? d.round.family} · ${TIER_LABEL[d.round.tier] ?? d.round.tier}`]}
        title={d.card.title ?? "Classified"}
        code={`FILE ${dress.fileCode(d.card.id)}`}
        points={d.card.points}
        minutes={d.card.estimatedMinutes}
        optional={d.card.optional}
        state={solved ? "solved" : failed ? "failed" : "open"}
        solvedAt={d.solvedAt ? <LocalTime iso={d.solvedAt} /> : null}
        stageTitle={stageTitle}
      />

      <div className="grid gap-6 [&>*]:min-w-0 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          <CaseNote>{d.briefing}</CaseNote>
          {solved || failed ? (
            <ArchivedRoom site={d.site} artifacts={d.artifacts} fingerprint={ctx.fingerprint} solved={solved} />
          ) : d.error ? (
            <p className="panel p-4 text-sm text-signal-magenta">This file failed to generate for your team. Organisers have been alerted.</p>
          ) : (
            <Stage ctx={ctx} />
          )}
        </div>
        <aside className="space-y-4 xl:sticky xl:top-28 xl:self-start">
          <WhatItTakes skills={d.skills} tools={stageOf(d.card.primitive) === "web" || stageOf(d.card.primitive) === "forensics" || stageOf(d.card.primitive) === "git" || stageOf(d.card.primitive) === "pcap" ? [] : d.tools} />
          <HintPanel
            challengeId={d.card.id}
            hints={d.hints.map((h) => ({ index: h.index, level: h.level, cost: h.cost, currency: h.currency, purchased: h.text !== null, purchasable: h.purchasable, text: h.text ?? undefined }))}
            disabled={Boolean(disabledReason) || solved}
          />
        </aside>
      </div>
    </article>
  );
}
