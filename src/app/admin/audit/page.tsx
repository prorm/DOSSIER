import Link from "next/link";

import { DataTable } from "@/components/dossier/admin-table";
import { LocalTime } from "@/components/dossier/local-time";
import { PageHeader } from "@/components/dossier/primitives";
import { Button } from "@/components/ui/button";
import { listAudit } from "@/server/engine/admin";
import { requireStaffPage } from "@/server/page-auth";

export const metadata = { title: "Audit log" };

export default async function AdminAudit({ searchParams }: { searchParams: Promise<{ before?: string }> }) {
  const { before } = await searchParams;
  const { db, event } = await requireStaffPage("admin");
  const rows = await listAudit(db, event?.id ?? null, Number(before) || undefined);
  return (
    <>
      <PageHeader eyebrow="Accountability" title="Audit log">
        Append-only (enforced by a database trigger). Every privileged action lands here.
      </PageHeader>
      <DataTable head={["When", "Actor", "Action", "Target", "Details", "IP"]} caption="Audit log" minWidth={900}>
        {rows.map((r) => (
          <tr key={r.id}>
            <td className="font-mono text-xs text-mute">
              <LocalTime iso={r.createdAt} format="full" />
            </td>
            <td className="font-mono text-xs">
              {r.actorLabel} <span className="text-faint">({r.actorType})</span>
            </td>
            <td className="font-mono text-xs text-signal-2">{r.action}</td>
            <td className="max-w-48 truncate font-mono text-xs">{r.target}</td>
            <td className="max-w-80 truncate font-mono text-[0.68rem] text-mute">{Object.keys(r.details).length ? JSON.stringify(r.details) : ""}</td>
            <td className="font-mono text-xs text-faint">{r.ip}</td>
          </tr>
        ))}
      </DataTable>
      {rows.length === 100 ? (
        <Button asChild variant="outline" size="sm" className="mt-4">
          <Link href={`/admin/audit?before=${rows.at(-1)!.id}`}>Older →</Link>
        </Button>
      ) : null}
    </>
  );
}
