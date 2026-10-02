import { Network } from "lucide-react";
import dynamic from "next/dynamic";

import { PageHeader, RouteLoading } from "@/components/dossier/primitives";
import { boardItems, getBoard, theoryDesks } from "@/server/game/engine";
import { presentationFingerprint } from "@/server/game/presentation";
import { requireTeamPage } from "@/server/page-auth";

const EvidenceBoard = dynamic(() => import("@/components/experience/board/evidence-board").then((m) => m.EvidenceBoard), {
  loading: () => <RouteLoading label="Unrolling the wall" variant="detail" />,
});

export const metadata = { title: "Evidence board" };

export default async function BoardPage() {
  const { session, event, db } = await requireTeamPage("/play/board");
  const [items, board, desks] = await Promise.all([boardItems(db, event, session.team.id), getBoard(db, event.id, session.team.id), theoryDesks(db, event, session.team.id)]);
  const onWall = Object.keys(board.layout.nodes).length;
  return (
    <>
      <PageHeader
        className="!pb-3"
        eyebrow={
          <>
            <Network className="size-3.5" aria-hidden="true" /> Theory of the case · {onWall} on the wall · {board.layout.links.length} strings
          </>
        }
        title="Evidence board"
      >
        Pin what you hold, drag from one pin to another to tie a string, and say what it means. A theory that holds opens files.
      </PageHeader>
      <EvidenceBoard items={items} initial={board} fingerprint={presentationFingerprint(event.id, session.team.id)} desks={desks} />
    </>
  );
}
