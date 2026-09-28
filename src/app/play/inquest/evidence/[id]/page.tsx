import { ArrowLeft, MapPin } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { EvidenceBoardActions, EvidenceImage, SeenMarker } from "@/components/dossier/evidence-client";
import { Markdown } from "@/components/dossier/markdown";
import DecryptedText from "@/components/reactbits/DecryptedText";
import TextType from "@/components/reactbits/TextType";
import { Badge } from "@/components/ui/badge";
import { EVIDENCE_ICON } from "@/lib/evidence";
import { caseFile, getBoard } from "@/server/engine/inquest";
import { requireTeamPage } from "@/server/page-auth";
import { LocalTime } from "@/components/dossier/local-time";

export const metadata = { title: "Exhibit" };

export default async function EvidencePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { session, event, db } = await requireTeamPage(`/play/inquest/evidence/${id}`);
  const [file, board] = await Promise.all([caseFile(db, event, session.team.id), getBoard(db, event.id, session.team.id)]);
  // Sealed and unknown exhibits are indistinguishable: both 404.
  const idx = file?.evidence.findIndex((e) => e.id === id) ?? -1;
  if (!file || idx < 0) notFound();
  const e = file.evidence[idx]!;
  const Icon = EVIDENCE_ICON[e.kind];

  return (
    <article className="animate-reveal-up">
      <SeenMarker evidenceId={e.id} isNew={e.isNew} />
      <Link href="/play/inquest?tab=evidence" className="mb-4 inline-flex items-center gap-1.5 font-mono text-[0.7rem] uppercase tracking-[0.12em] text-mute hover:text-ink">
        <ArrowLeft className="size-3.5" aria-hidden="true" /> Evidence locker
      </Link>
      <header className="mb-6 border-b border-line pb-5">
        <p className="label-mono mb-2 flex items-center gap-2">
          {Icon ? <Icon className="size-3.5" aria-hidden="true" /> : null} Exhibit {String(idx + 1).padStart(2, "0")} · {e.kind}
          {e.isNew ? <Badge variant="info">Newly unsealed</Badge> : null}
        </p>
        <h1 className="text-2xl font-semibold sm:text-3xl">
          {e.isNew ? <DecryptedText text={e.title} animateOn="mount" sequential speed={22} encryptedClassName="text-signal-2/60" /> : e.title}
        </h1>
        <div className="mt-3 flex flex-wrap gap-2">
          {e.location ? (
            <Badge variant="outline">
              <MapPin /> {e.location.name}
            </Badge>
          ) : null}
          {e.suspects.map((s) => (
            <Badge key={s.id} variant="secondary">
              {s.name}
            </Badge>
          ))}
          <Badge variant="ghost">
            Unsealed <LocalTime iso={e.revealedAt} />
          </Badge>
        </div>
      </header>
      <div className="grid gap-6 [&>*]:min-w-0 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-5">
          {e.summary ? (
            e.isNew ? (
              <TextType text={e.summary} as="p" className="font-mono text-sm text-ink" />
            ) : (
              <p className="font-mono text-sm text-ink">{e.summary}</p>
            )
          ) : null}
          {e.image ? <EvidenceImage src={e.image} alt={`${e.title}: ${e.summary || "exhibit image"}`} /> : null}
          {e.bodyMd ? <Markdown>{e.bodyMd}</Markdown> : null}
        </div>
        <aside className="space-y-4 lg:sticky lg:top-28 lg:self-start">
          <EvidenceBoardActions evidenceId={e.id} onBoard={`ev:${e.id}` in board.layout.nodes} annotation={board.layout.annotations[`ev:${e.id}`] ?? ""} />
        </aside>
      </div>
    </article>
  );
}
