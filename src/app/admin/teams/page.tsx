import { Search } from "lucide-react";
import Link from "next/link";

import { DataTable } from "@/components/dossier/admin-table";
import { LocalTime } from "@/components/dossier/local-time";
import { EmptyState, PageHeader } from "@/components/dossier/primitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { teamsWithScores } from "@/server/engine/admin";
import { requireStaffPage } from "@/server/page-auth";

export const metadata = { title: "Teams" };

export default async function AdminTeams({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const { db, event } = await requireStaffPage("admin");
  if (!event) return <EmptyState title="No active event" />;
  const rows = await teamsWithScores(db, event, q);
  return (
    <>
      <PageHeader eyebrow="People" title="Teams" actions={<span className="label-mono">{rows.length} shown</span>} />
      <form className="mb-4 flex gap-2" role="search">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-mute" aria-hidden="true" />
          <Input name="q" defaultValue={q} placeholder="Search team name" className="pl-9" aria-label="Search teams" />
        </div>
        <Button type="submit" variant="outline">
          Search
        </Button>
      </form>
      {rows.length === 0 ? (
        <EmptyState title="No teams">{q ? "No team matches that search." : "No team has registered yet."}</EmptyState>
      ) : (
        <DataTable head={["Team", "Rank", "Score", "Members", "Affiliation", "Last seen", "Status"]} caption="Teams" minWidth={760}>
          {rows.map((t) => (
            <tr key={t.id} className="hover:bg-raised/50">
              <td>
                <Link href={`/admin/teams/${t.id}`} className="font-mono text-sm hover:text-signal">
                  {t.name}
                </Link>
              </td>
              <td className="num text-mute">{t.rank ?? "—"}</td>
              <td className="num">{t.score}</td>
              <td className="num text-mute">{t.members}</td>
              <td className="text-xs text-mute">{t.affiliation ?? "—"}</td>
              <td className="font-mono text-xs text-mute">{t.lastSeenAt ? <LocalTime iso={t.lastSeenAt} format="day-time" /> : "—"}</td>
              <td>{t.status === "disqualified" ? <Badge variant="danger">DQ</Badge> : <Badge variant="success">active</Badge>}</td>
            </tr>
          ))}
        </DataTable>
      )}
    </>
  );
}
