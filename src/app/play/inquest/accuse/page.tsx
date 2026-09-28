import { ArrowLeft, Gavel, Lock, ShieldCheck } from "lucide-react";
import Link from "next/link";

import { AccusationForm } from "@/components/dossier/accusation-form";
import { Markdown } from "@/components/dossier/markdown";
import { EmptyState, PageHeader, Panel, StandbyState } from "@/components/dossier/primitives";
import { eventPhase } from "@/server/engine/event";
import { caseFile } from "@/server/engine/inquest";
import { requireTeamPage } from "@/server/page-auth";
import { LocalTime } from "@/components/dossier/local-time";

export const metadata = { title: "Accusation" };

export default async function AccusePage() {
  const { session, event, db } = await requireTeamPage("/play/inquest/accuse");
  const phase = eventPhase(event);
  if (phase === "standby") return <StandbyState title="Not yet">Accusations open with the case file.</StandbyState>;
  const file = await caseFile(db, event, session.team.id);
  if (!file) return <EmptyState title="No case loaded" />;
  const acc = file.accusation;
  const disabledReason =
    session.team.status === "disqualified" ? "Your team is disqualified." : phase === "paused" ? "Event paused — filing resumes shortly." : phase === "ended" ? "The event has ended." : null;

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/play/inquest" className="mb-4 inline-flex items-center gap-1.5 font-mono text-[0.7rem] uppercase tracking-[0.12em] text-mute hover:text-ink">
        <ArrowLeft className="size-3.5" aria-hidden="true" /> Case file
      </Link>
      <PageHeader
        eyebrow={
          <>
            <Gavel className="size-3.5" aria-hidden="true" /> {file.case.title}
          </>
        }
        title="File an accusation"
      >
        Partial credit is awarded per correct finding. A fully correct verdict locks in; so does running out of attempts.
      </PageHeader>

      {acc.history.length ? (
        <Panel className="mb-6">
          <p className="label-mono mb-2">Previous attempts</p>
          <ol className="space-y-1 font-mono text-xs">
            {acc.history.map((h) => (
              <li key={h.attemptNo} className="flex flex-wrap gap-x-4">
                <span className="text-faint">#{h.attemptNo}</span>
                <span className={h.correctCount === h.totalFields ? "text-signal-green" : "text-ink-dim"}>
                  {h.correctCount}/{h.totalFields} confirmed
                </span>
                <span className="text-mute">credit {h.credit}</span>
                {h.penalty ? <span className="text-signal-magenta">−{h.penalty}</span> : null}
                <span className="text-faint"><LocalTime iso={h.at} /></span>
              </li>
            ))}
          </ol>
        </Panel>
      ) : null}

      {acc.locked ? (
        <Panel className={acc.solved ? "border-[color-mix(in_srgb,var(--color-signal-green)_40%,var(--color-line))]" : ""}>
          {acc.solved ? <ShieldCheck className="size-6 text-signal-green" aria-hidden="true" /> : <Lock className="size-6 text-mute" aria-hidden="true" />}
          <p className="mt-2 font-mono text-lg font-semibold">{acc.solved ? "Case closed by your team" : "Verdict final"}</p>
          <p className="mt-1 text-sm text-ink-dim">
            {acc.solved ? "Every finding was confirmed." : "All attempts are used."} {file.solution ? "" : "The full solution is declassified when the event ends."}
          </p>
          {file.solution ? <Markdown className="mt-3">{file.solution.md}</Markdown> : null}
        </Panel>
      ) : (
        <AccusationForm state={acc} portraits={Object.fromEntries(file.suspects.map((s) => [s.id, s.image]))} disabledReason={disabledReason} />
      )}
    </div>
  );
}
