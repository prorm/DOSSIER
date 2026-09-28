import { and, count, eq } from "drizzle-orm";
import { FileDown } from "lucide-react";

import { LiveRefresh } from "@/components/dossier/admin-client";
import { CheckpointAdminActions } from "@/components/dossier/admin-misc";
import { LocalTime } from "@/components/dossier/local-time";
import { EmptyState, PageHeader } from "@/components/dossier/primitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { checkpointScans } from "@/server/db/schema";
import { listCheckpoints, stationQueue } from "@/server/engine/live";
import { requireStaffPage } from "@/server/page-auth";

export const metadata = { title: "Checkpoints" };

export default async function AdminCheckpoints() {
  const { db, event } = await requireStaffPage("admin");
  if (!event) return <EmptyState title="No active event" />;
  const cps = await listCheckpoints(db, event.id);
  if (!cps.length) return <EmptyState title="No checkpoints">This pack defines no live checkpoints.</EmptyState>;
  const stats = await Promise.all(
    cps.map(async (c) => {
      const rows = await db
        .select({ status: checkpointScans.status, n: count() })
        .from(checkpointScans)
        .where(and(eq(checkpointScans.eventId, event.id), eq(checkpointScans.checkpointId, c.id)))
        .groupBy(checkpointScans.status);
      const recent = (await stationQueue(db, event.id, c.id)).slice(0, 5);
      return { by: Object.fromEntries(rows.map((r) => [r.status, r.n])) as Record<string, number>, recent };
    }),
  );
  return (
    <>
      <LiveRefresh types={["checkpoint"]} />
      <PageHeader
        eyebrow="Live"
        title="Checkpoints"
        actions={
          <Button asChild variant="outline">
            { }
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- file download from an API route, not a page */}
            <a href="/api/admin/checkpoints/qr">
              <FileDown /> All QR sheets (PDF)
            </a>
          </Button>
        }
      >
        Station PINs are stored hashed. Rotating a QR voids every printed copy of that checkpoint&apos;s code.
      </PageHeader>
      <ul className="grid gap-4 xl:grid-cols-2">
        {cps.map((c, i) => {
          const s = stats[i]!;
          return (
            <li key={c.id} className="panel space-y-3 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="font-mono text-base font-semibold">{c.name}</h2>
                  <p className="text-sm text-mute">{c.location}</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="accent">{c.points} pts</Badge>
                  <Badge variant={c.requiresApproval ? "info" : "secondary"}>{c.requiresApproval ? "approval" : "auto"}</Badge>
                  <Badge variant={c.pinHash ? "success" : "warning"}>{c.pinHash ? "PIN set" : "no PIN"}</Badge>
                  <Badge variant="outline">QR v{c.tokenVersion}</Badge>
                </div>
              </div>
              <p className="font-mono text-xs text-mute">
                <span className="text-signal-green">{s.by.confirmed ?? 0}</span> confirmed · <span className="text-signal-amber">{s.by.pending ?? 0}</span> pending ·{" "}
                <span className="text-signal-magenta">{s.by.rejected ?? 0}</span> rejected
              </p>
              {s.recent.length ? (
                <ul className="space-y-1 border-t border-line pt-2 font-mono text-xs">
                  {s.recent.map((r) => (
                    <li key={r.id} className="flex gap-2">
                      <span className="text-faint">
                        <LocalTime iso={r.createdAt} />
                      </span>
                      <span className="flex-1 truncate">{r.teamName}</span>
                      <span className={r.status === "confirmed" ? "text-signal-green" : r.status === "rejected" ? "text-signal-magenta" : "text-signal-amber"}>{r.status}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              <CheckpointAdminActions id={c.id} />
            </li>
          );
        })}
      </ul>
    </>
  );
}
