import { ArrowLeft, Network } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";

import { EmptyState, PageHeader, RouteLoading, StandbyState } from "@/components/dossier/primitives";
import type { BoardItem } from "@/components/dossier/evidence-board";
import { eventPhase } from "@/server/engine/event";
import { caseFile, getBoard } from "@/server/engine/inquest";
import { requireTeamPage } from "@/server/page-auth";
import { eventView } from "@/server/views";

const EvidenceBoard = dynamic(() => import("@/components/dossier/evidence-board").then((m) => m.EvidenceBoard), {
  loading: () => <RouteLoading label="Unrolling the corkboard" variant="detail" />,
});

export const metadata = { title: "Evidence Board" };

export default async function BoardPage() {
  const { session, event, db } = await requireTeamPage("/play/inquest/board");
  if (!eventView(event).modes.includes("inquest")) return <EmptyState title="No inquest in this event" />;
  if (eventPhase(event) === "standby") return <StandbyState title="Board locked">The evidence board opens with the case file.</StandbyState>;
  const [file, board] = await Promise.all([caseFile(db, event, session.team.id), getBoard(db, event.id, session.team.id)]);
  if (!file) return <EmptyState title="No case loaded" />;
  const items: BoardItem[] = [
    ...file.evidence.map((e) => ({
      id: `ev:${e.id}`,
      kind: "evidence" as const,
      title: e.title,
      subtitle: e.kind,
      evidenceKind: e.kind,
      image: e.image,
      href: `/play/inquest/evidence/${e.id}`,
    })),
    ...file.suspects.map((s) => ({ id: `sus:${s.id}`, kind: "suspect" as const, title: s.name, subtitle: s.role || "suspect", image: s.image, href: "/play/inquest?tab=suspects" })),
  ];
  return (
    <>
      <Link href="/play/inquest" className="mb-4 inline-flex items-center gap-1.5 font-mono text-[0.7rem] uppercase tracking-[0.12em] text-mute hover:text-ink">
        <ArrowLeft className="size-3.5" aria-hidden="true" /> Case file
      </Link>
      <PageHeader
        eyebrow={
          <>
            <Network className="size-3.5" aria-hidden="true" /> {file.case.title}
          </>
        }
        title="Evidence board"
      >
        Shared with your team and private to it. Changes save automatically.
      </PageHeader>
      <EvidenceBoard items={items} initial={board} />
    </>
  );
}
