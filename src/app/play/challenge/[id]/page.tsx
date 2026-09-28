import { ArrowLeft, Check, Download, Droplet, FileText, TrendingDown } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AnswerForm } from "@/components/dossier/answer-form";
import { HintPanel } from "@/components/dossier/hint-panel";
import { Markdown } from "@/components/dossier/markdown";
import { LockedState } from "@/components/dossier/primitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { challengeHref, MODE_LABEL } from "@/lib/modes";
import { eventPhase } from "@/server/engine/event";
import { teamChallenges, type OpenChallengeView } from "@/server/engine/play";
import { requireTeamPage } from "@/server/page-auth";
import { LocalTime } from "@/components/dossier/local-time";

export async function generateMetadata() {
  return { title: "Challenge" };
}

const BACK: Record<string, { href: string; label: string }> = {
  hunt: { href: "/play/hunt", label: "Hunt map" },
  ctf: { href: "/play/ctf", label: "CTF board" },
  inquest: { href: "/play/inquest?tab=puzzles", label: "Case file" },
};

export default async function ChallengePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { session, event, db } = await requireTeamPage(`/play/challenge/${id}`);
  const { views } = await teamChallenges(db, event, session.team.id);
  const found = views.find((v) => v.id === id);
  if (!found) notFound();
  const back = BACK[found.mode]!;
  const titles = new Map(views.filter((v) => "title" in v).map((v) => [v.id, (v as { title: string }).title]));

  if (found.state === "locked" || found.state === "scheduled") {
    const c = found;
    const deps = [...(c.requires?.all ?? []), ...(c.requires?.any ?? [])];
    return (
      <div className="mx-auto max-w-2xl">
        <BackLink {...back} />
        <LockedState
          title={c.state === "scheduled" ? "Not yet declassified" : "Classified"}
          action={
            <Button asChild variant="outline">
              <Link href={back.href}>Return to {back.label.toLowerCase()}</Link>
            </Button>
          }
        >
          {c.state === "scheduled" && c.opensAt ? (
            <p>This file opens at <LocalTime iso={c.opensAt} format="full" />.</p>
          ) : (
            <p>
              Solve {c.requires?.any.length && !c.requires.all.length ? "any one of" : "all of"}{" "}
              {deps.map((d, i) => (
                <span key={d}>
                  {i > 0 ? ", " : ""}
                  {titles.has(d) ? (
                    <Link className="text-signal-2 underline underline-offset-2" href={challengeHref(d)}>
                      {titles.get(d)}
                    </Link>
                  ) : (
                    <span className="font-mono text-faint">[classified]</span>
                  )}
                </span>
              ))}{" "}
              to open this one.
            </p>
          )}
        </LockedState>
      </div>
    );
  }

  const c = found as OpenChallengeView;
  const phase = eventPhase(event);
  const disabledReason =
    session.team.status === "disqualified"
      ? "Your team is disqualified."
      : phase === "standby"
        ? "Submissions open when the event starts."
        : phase === "paused"
          ? "Event paused — submissions resume shortly."
          : phase === "ended"
            ? "The event has ended."
            : null;
  const solved = c.state === "solved";

  return (
    <article className="animate-reveal-up">
      <BackLink {...back} />
      <header className="mb-6 border-b border-line pb-5">
        <p className="label-mono mb-2 flex flex-wrap items-center gap-2">
          <span>{MODE_LABEL[c.mode]}</span>
          {c.category ? (
            <>
              <span className="text-faint">/</span>
              <span>{c.category}</span>
            </>
          ) : null}
          {c.difficulty ? (
            <>
              <span className="text-faint">/</span>
              <span>{c.difficulty}</span>
            </>
          ) : null}
        </p>
        <h1 className="text-2xl font-semibold leading-tight sm:text-3xl">{c.title}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge variant={solved ? "success" : "accent"}>
            {solved ? <Check /> : null}
            {c.value} pts
          </Badge>
          {c.dynamic ? (
            <Badge variant="info" title="Value decays as more teams solve it">
              <TrendingDown /> Dynamic
            </Badge>
          ) : null}
          <Badge variant="outline">
            {c.solves} {c.solves === 1 ? "solve" : "solves"}
          </Badge>
          {c.firstBlood ? (
            <Badge variant="danger">
              <Droplet /> First blood · {c.firstBlood}
            </Badge>
          ) : c.firstBloodBonus > 0 ? (
            <Badge variant="danger">
              <Droplet /> +{c.firstBloodBonus} first blood
            </Badge>
          ) : null}
          {c.tags.map((t) => (
            <Badge key={t} variant="secondary">
              {t}
            </Badge>
          ))}
        </div>
      </header>

      <div className="grid gap-6 [&>*]:min-w-0 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-6">
          {c.bodyMd ? <Markdown>{c.bodyMd}</Markdown> : <p className="text-mute">No briefing text for this one.</p>}
          {c.assets.length ? (
            <section aria-labelledby="files-h">
              <h2 id="files-h" className="label-mono mb-2">
                Attachments
              </h2>
              <ul className="grid gap-2 sm:grid-cols-2">
                {c.assets.map((a) => (
                  <li key={a.url}>
                    <a
                      href={`${a.url}&download=1`}
                      className="pressable panel flex items-center gap-3 px-3 py-2.5 font-mono text-sm hover:border-line-strong"
                      download
                    >
                      <FileText className="size-4 text-signal-2" aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate">{a.name}</span>
                      <Download className="size-4 text-mute" aria-hidden="true" />
                    </a>
                  </li>
                ))}
              </ul>
              <p className="mt-2 font-mono text-[0.65rem] text-faint">Links are signed for your team and expire after 10 minutes. Reload to refresh.</p>
            </section>
          ) : null}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-28 lg:self-start">
          {solved ? (
            <div className="panel border-[color-mix(in_srgb,var(--color-signal-green)_40%,var(--color-line))] p-5">
              <p className="label-mono !text-signal-green">{"// solved"}</p>
              <p className="mt-1 font-mono text-lg font-semibold text-signal-green">ACCESS GRANTED</p>
              <p className="mt-1 text-sm text-ink-dim">
                Your team cracked this {c.solvedAt ? <>at <LocalTime iso={c.solvedAt} /></> : null}.
              </p>
              <Button asChild variant="outline" className="mt-4 w-full">
                <Link href={back.href}>Back to {back.label.toLowerCase()}</Link>
              </Button>
            </div>
          ) : (
            <AnswerForm challengeId={c.id} answerType={c.answerType} disabledReason={disabledReason} modeLabel={`${c.value} pts`} />
          )}
          <HintPanel challengeId={c.id} hints={c.hints} disabled={Boolean(disabledReason) || solved} />
        </aside>
      </div>
    </article>
  );
}

function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="mb-4 inline-flex items-center gap-1.5 font-mono text-[0.7rem] uppercase tracking-[0.12em] text-mute hover:text-ink">
      <ArrowLeft className="size-3.5" aria-hidden="true" /> {label}
    </Link>
  );
}
