import Link from "next/link";

import { DataTable } from "@/components/dossier/admin-table";
import { LocalTime } from "@/components/dossier/local-time";
import { EmptyState, SectionTitle } from "@/components/dossier/primitives";
import { WarRoom } from "@/components/experience/ops/war-room";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { dashboardStats, listAudit } from "@/server/engine/admin";
import { controlRoom } from "@/server/game/control-room";
import { requireStaffPage } from "@/server/page-auth";
import { eventView } from "@/server/views";

export const metadata = { title: "Control room" };

const pct = (x: number) => `${Math.round(x * 100)}%`;

function Meter({ value, label }: { value: number; label: string }) {
  return (
    <span className="flex items-center gap-2" title={`${label}: ${pct(value)}`}>
      <span className="h-1.5 w-20 overflow-hidden rounded-full bg-line" aria-hidden="true">
        <span className="block h-full rounded-full bg-signal-cyan" style={{ width: pct(value) }} />
      </span>
      <span className="num text-xs text-ink-dim">{pct(value)}</span>
    </span>
  );
}

export default async function ControlRoomPage() {
  const { db, event } = await requireStaffPage("admin");
  if (!event) {
    return (
      <EmptyState title="No active event" action={<Link className="text-signal-2 underline" href="/studio">Open the Studio</Link>}>
        Build an event in the Studio (or import a pack) and activate it to start operating.
      </EmptyState>
    );
  }
  const [s, cr, audit] = await Promise.all([dashboardStats(db, event), controlRoom(db, event), listAudit(db, event.id, undefined, 6)]);
  if (!cr) {
    return (
      <EmptyState compact title="No blueprint">
        This event has no published blueprint yet — publish it from the Studio.
      </EmptyState>
    );
  }
  const ev = eventView(event);

  return (
    <WarRoom eventId={event.id} eventName={ev.name} accent={ev.theme.accent} phase={ev.phase} cr={cr} stats={{ submissionsPerMin: s.submissionsPerMin, correctPerMin: s.correctPerMin }}>
      <div className="grid gap-8 [&>*]:min-w-0 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-8">
          <section aria-labelledby="teams">
            <SectionTitle id="teams" meta={`${cr.teams.filter((t) => t.stuck).length} stuck`}>
              Teams
            </SectionTitle>
            <DataTable head={["#", "Team", "Score", "Completion", "Working on", "Hints", "Last activity"]} caption="Team progress">
              {cr.teams.map((t) => (
                <tr key={t.teamId} className="hover:bg-raised/50">
                  <td className="num text-xs text-mute">{t.rank || "—"}</td>
                  <td>
                    <Link href={`/admin/teams/${t.teamId}`} className="font-mono text-sm hover:text-signal">
                      {t.name}
                    </Link>
                    {t.stuck ? <Badge variant="warning" className="ml-2">stuck</Badge> : null}
                    {t.active ? <span className="ml-2 inline-block size-1.5 rounded-full bg-signal-green" title="active" /> : null}
                  </td>
                  <td className="num">{t.score}</td>
                  <td>
                    <Meter value={t.completion} label="completion" />
                  </td>
                  <td className="max-w-56 truncate text-xs text-ink-dim">{t.current ? `${t.current.title} · ${t.current.minutes}m` : t.completion >= 1 ? "finished" : "—"}</td>
                  <td className="num text-xs text-mute">{t.hints}</td>
                  <td className="font-mono text-[0.68rem] text-mute">{t.lastActivityAt ? <LocalTime iso={t.lastActivityAt} /> : "never"}</td>
                </tr>
              ))}
            </DataTable>
          </section>

          <section aria-labelledby="nodes">
            <SectionTitle id="nodes" meta={`${cr.nodes.length} challenges`}>
              Challenge telemetry
            </SectionTitle>
            <DataTable head={["Challenge", "Reached", "Solved", "Stuck", "Median / p90 vs est.", "Fail %", "Hint %", "Abandon %"]} caption="Per-challenge progress and solve times">
              {cr.nodes.map((n) => {
                const slow = n.medianMinutes !== null && n.medianMinutes > n.expectedMinutes * 2;
                return (
                  <tr key={n.id} className={cn("hover:bg-raised/50", cr.potentiallyBroken.some((b) => b.id === n.id) && "bg-[color-mix(in_srgb,var(--color-signal-magenta)_8%,transparent)]")}>
                    <td>
                      <span className="font-mono text-sm">{n.title}</span>
                      {n.critical ? <Badge variant="accent" className="ml-2">critical</Badge> : null}
                      {n.optional ? <Badge variant="outline" className="ml-2">side</Badge> : null}
                      <span className="block font-mono text-[0.62rem] text-faint">
                        {n.round} · {n.primitive}
                      </span>
                    </td>
                    <td className="num">{n.unlocked}</td>
                    <td className="num text-signal">{n.solved}</td>
                    <td className={cn("num", n.stuck ? "text-signal-amber" : "text-mute")}>{n.stuck}</td>
                    <td className={cn("num text-xs", slow ? "text-signal-amber" : "text-ink-dim")}>
                      {n.medianMinutes ?? "—"} / {n.p90Minutes ?? "—"} <span className="text-faint">vs {n.expectedMinutes}m</span>
                    </td>
                    <td className={cn("num", n.failureRate > 0.85 && n.attempts > 10 ? "text-signal-amber" : "text-mute")}>{n.attempts ? pct(n.failureRate) : "—"}</td>
                    <td className="num text-mute">{n.unlocked ? pct(n.hintRate) : "—"}</td>
                    <td className="num text-mute">{n.unlocked ? pct(n.abandonment) : "—"}</td>
                  </tr>
                );
              })}
            </DataTable>
          </section>
        </div>

        <div className="space-y-6">
          {cr.mostFailed.length ? (
            <section aria-labelledby="failed">
              <SectionTitle id="failed">Most failed</SectionTitle>
              <ul className="panel divide-y divide-line">
                {cr.mostFailed.map((n) => (
                  <li key={n.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <span className="min-w-0 flex-1 truncate font-mono">{n.title}</span>
                    <span className="num text-xs text-signal-amber">{n.wrong} wrong</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {cr.checkpointTraffic.length ? (
            <section aria-labelledby="cp">
              <SectionTitle id="cp" meta={<Link href="/admin/checkpoints">manage</Link>}>
                Checkpoint traffic
              </SectionTitle>
              <ul className="panel divide-y divide-line">
                {cr.checkpointTraffic.map((c) => (
                  <li key={c.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <span className="min-w-0 flex-1 truncate font-mono">{c.name}</span>
                    <span className="num text-xs text-ink-dim" title="scans in the last hour">{c.lastHour}/h</span>
                    <span className="num text-xs text-mute" title="all scans">{c.total}</span>
                    {c.pending ? <Badge variant="warning">{c.pending} pending</Badge> : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section aria-labelledby="recent">
            <SectionTitle id="recent" meta={<Link href="/admin/audit">all</Link>}>
              Privileged actions
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
    </WarRoom>
  );
}
