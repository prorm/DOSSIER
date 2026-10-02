import { Suspense } from "react";

import { RouteLoading } from "@/components/dossier/primitives";
import { StudioWorkspace, type StudioViewT } from "@/components/dossier/studio-workspace";
import { loadStudioEvent, otherActiveEvent, studioView } from "@/server/game/studio";
import { requireStaffPage } from "@/server/page-auth";

export const metadata = { title: "Workspace" };

export default async function StudioEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db } = await requireStaffPage("admin");
  const { event, draft } = await loadStudioEvent(db, id);
  const view = JSON.parse(JSON.stringify(studioView(event, draft, await otherActiveEvent(db, id)))) as StudioViewT;
  return (
    <Suspense fallback={<RouteLoading label="Opening the studio" variant="detail" />}>
      <StudioWorkspace initial={view} />
    </Suspense>
  );
}
