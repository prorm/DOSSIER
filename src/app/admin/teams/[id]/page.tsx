import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { DataTable } from "@/components/dossier/admin-table";
import { TeamActions } from "@/components/dossier/admin-team";
import { LocalTime } from "@/components/dossier/local-time";
import { EmptyState, PageHeader, SectionTitle, Stat } from "@/components/dossier/primitives";
import { Badge } from "@/components/ui/badge";
import { teamDetail } from "@/server/engine/admin";
import { getLeaderboard } from "@/server/engine/leaderboard";
import { requireStaffPage } from "@/server/page-auth";

export const metadata = { title: "Team" };

export default async function AdminTeam({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db, event } = await requireStaffPage("admin");
  if (!event) return <EmptyState title="No active event" />;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [d, lb] = await Promise.all([teamDetail(db, event, id), getLeaderboard(db, event.id, "live")]);
  if (!d) notFound();
  const st = lb.standings.find((s) => s.teamId === id);
  return (
    <div className="space-y-8">
      <Link href="/admin/teams" className="inline-flex items-center gap-1.5 font-mono text-[0.7rem] uppercase tracking-[0.12em] text-mute hover:text-ink">
        <ArrowLeft className="size-3.5" aria-hidden="true" /> Teams
      </Link>
      <PageHeader
        eyebrow={d.team.affiliation ?? "Team"}
        title={d.team.name}
        actions={d.team.status === "disqualified" ? <Badge variant="danger">Disqualified: {d.team.statusReason}</Badge> : <Badge variant="success">Active</Badge>}
      />
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Score (live)" value={st?.score ?? 0} tone="accent" />
        <Stat label="Rank" value={st?.rank || "—"} />
        <Stat label="Solves" value={st?.solves ?? 0} />
        <Stat label="Members" value={d.members.length} hint={d.members.map((m) => m.displayName).join(", ")} />
      </section>
      <TeamActions teamId={d.team.id} teamName={d.team.name} status={d.team.status} />
      <section>
        <SectionTitle meta={`${d.log.length} entries`}>Score ledger</SectionTitle>
        <DataTable head={["When", "Type", "Challenge", "Points", "Details"]} caption="Event log for team">
          {d.log.map((l) => (
            <tr key={l.id}>
              <td className="font-mono text-xs text-mute">
                <LocalTime iso={l.createdAt} format="day-time" />
              </td>
              <td className="font-mono text-xs uppercase">{l.type}</td>
              <td className="font-mono text-xs">{l.challengeId ?? "—"}</td>
              <td className="num">{l.points ?? "derived"}</td>
              <td className="max-w-80 truncate text-xs text-mute">{typeof l.payload.reason === "string" ? l.payload.reason : ""}</td>
            </tr>
          ))}
        </DataTable>
      </section>
      <section>
        <SectionTitle meta="last 100">Submissions</SectionTitle>
        <DataTable head={["When", "Challenge", "Result", "Submitted (wrong only)", "IP"]} caption="Submissions for team">
          {d.submissions.map((s) => (
            <tr key={s.id}>
              <td className="font-mono text-xs text-mute">
                <LocalTime iso={s.createdAt} format="day-time" />
              </td>
              <td className="font-mono text-xs">{s.challengeId}</td>
              <td>{s.correct ? <Badge variant="success">correct</Badge> : <Badge variant="danger">wrong</Badge>}</td>
              <td className="max-w-72 truncate font-mono text-xs">{s.correct ? <span className="text-faint">— not stored —</span> : s.preview}</td>
              <td className="font-mono text-xs text-mute">{s.ip}</td>
            </tr>
          ))}
        </DataTable>
      </section>
    </div>
  );
}
