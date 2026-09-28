import Link from "next/link";

import { LiveRefresh } from "@/components/dossier/admin-client";
import { DataTable } from "@/components/dossier/admin-table";
import { LocalTime } from "@/components/dossier/local-time";
import { EmptyState, PageHeader, SectionTitle, Stat } from "@/components/dossier/primitives";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { dashboardStats, listAudit } from "@/server/engine/admin";
import { requireStaffPage } from "@/server/page-auth";

export const metadata = { title: "Dashboard" };

export default async function AdminDashboard() {
  const { db, event } = await requireStaffPage("admin");
  if (!event) {
    return (
      <EmptyState title="No active event" action={<Link className="text-signal-2 underline" href="/admin/packs">Import a pack</Link>}>
        Import a content pack to start operating an event.
      </EmptyState>
    );
  }
  const [s, audit] = await Promise.all([dashboardStats(db, event), listAudit(db, event.id, undefined, 8)]);
  const chs = [...s.challenges].sort((a, b) => b.attempts - a.attempts);

  return (
    <div className="space-y-8">
      <LiveRefresh types={["submission", "checkpoint", "leaderboard", "event-status"]} />
      <PageHeader eyebrow="Live operations" title="Dashboard">
        Refreshes live as submissions arrive.
      </PageHeader>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Key metrics">
        <Stat label="Teams" value={s.teams} hint="registered" />
        <Stat label="Online" value={s.online} hint="active in last 3 min" tone="info" />
        <Stat label="Submissions / min" value={s.submissionsPerMin} hint="5-minute average" tone="accent" />
        <Stat label="Correct / min" value={s.correctPerMin} hint={`${s.submissionsPerMin ? Math.round((s.correctPerMin / s.submissionsPerMin) * 100) : 0}% hit rate`} />
      </section>

      <div className="grid gap-6 [&>*]:min-w-0 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section aria-labelledby="ch-stats">
          <SectionTitle id="ch-stats" meta={`${chs.length} challenges`}>
            Challenge telemetry
          </SectionTitle>
          <DataTable head={["Challenge", "Mode", "Solves", "Attempts", "Wrong %", "Teams tried"]} caption="Per-challenge solve statistics">
            {chs.map((c) => {
              const wrongPct = c.attempts ? Math.round((c.wrong / c.attempts) * 100) : 0;
              return (
                <tr key={c.id} className="hover:bg-raised/50">
                  <td>
                    <Link href={`/admin/challenges/${c.id}`} className="font-mono text-sm hover:text-signal">
                      {c.title}
                    </Link>
                    {c.hidden ? <Badge variant="warning" className="ml-2">hidden</Badge> : null}
                  </td>
                  <td className="font-mono text-xs text-mute uppercase">{c.mode}</td>
                  <td className="num text-signal">{c.solves}</td>
                  <td className="num">{c.attempts}</td>
                  <td className={cn("num", wrongPct > 85 && c.attempts > 10 ? "text-signal-amber" : "text-mute")}>{wrongPct}%</td>
                  <td className="num text-mute">{c.teamsTried}</td>
                </tr>
              );
            })}
          </DataTable>
        </section>

        <div className="space-y-6">
          <section aria-labelledby="stuck">
            <SectionTitle id="stuck" meta={`no solve in ${s.stuckMinutes}m`}>
              Stuck teams
            </SectionTitle>
            {s.stuck.length === 0 ? (
              <EmptyState compact title="Nobody stuck">Every active team has solved something recently.</EmptyState>
            ) : (
              <ul className="panel divide-y divide-line">
                {s.stuck.map((t) => (
                  <li key={t.teamId}>
                    <Link href={`/admin/teams/${t.teamId}`} className="flex items-center gap-3 px-3 py-2 hover:bg-raised/50">
                      <span className="min-w-0 flex-1 truncate font-mono text-sm">{t.name}</span>
                      <span className="font-mono text-[0.68rem] text-signal-amber">{t.lastSolveAt ? <LocalTime iso={t.lastSolveAt} /> : "never"}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="top">
            <SectionTitle id="top">Live top 10</SectionTitle>
            <ol className="panel divide-y divide-line">
              {s.leaderboard.map((t) => (
                <li key={t.teamId} className="flex items-center gap-3 px-3 py-2">
                  <span className="num w-6 text-xs text-mute">{t.rank || "DQ"}</span>
                  <span className="min-w-0 flex-1 truncate font-mono text-sm">{t.name}</span>
                  <span className="num text-sm">{t.score}</span>
                </li>
              ))}
            </ol>
          </section>

          <section aria-labelledby="recent">
            <SectionTitle id="recent" meta={<Link href="/admin/audit">all</Link>}>
              Recent privileged actions
            </SectionTitle>
            <ul className="panel divide-y divide-line">
              {audit.map((a) => (
                <li key={a.id} className="px-3 py-2 font-mono text-xs">
                  <span className="text-signal-2">{a.action}</span> <span className="text-mute">by {a.actorLabel}</span>
                  <span className="float-right text-faint">
                    <LocalTime iso={a.createdAt.toISOString()} />
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
