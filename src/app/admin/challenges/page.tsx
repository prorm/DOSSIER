import Link from "next/link";

import { DataTable } from "@/components/dossier/admin-table";
import { EmptyState, PageHeader } from "@/components/dossier/primitives";
import { Badge } from "@/components/ui/badge";
import { loadChallenges } from "@/server/engine/context";
import { getLeaderboard } from "@/server/engine/leaderboard";
import { modeFor } from "@/server/engine/modes";
import { challengeConfig } from "@/server/engine/types";
import { requireStaffPage } from "@/server/page-auth";

export const metadata = { title: "Challenges" };

export default async function AdminChallenges() {
  const { db, event } = await requireStaffPage("admin");
  if (!event) return <EmptyState title="No active event" />;
  const [chs, lb] = await Promise.all([loadChallenges(db, event.id, true), getLeaderboard(db, event.id, "live")]);
  return (
    <>
      <PageHeader eyebrow="Content" title="Challenges">
        Edit titles, text, points, hints and answers live. Structural changes (dependencies, modes) belong in the pack.
      </PageHeader>
      <DataTable head={["Title", "Id", "Mode", "Category", "Value", "Hints", "Solves", "State"]} caption="All challenges" minWidth={760}>
        {chs.map((c) => {
          const cfg = challengeConfig(c);
          const solves = lb.solveCounts[c.id] ?? 0;
          return (
            <tr key={c.id} className="hover:bg-raised/50">
              <td>
                <Link href={`/admin/challenges/${c.id}`} className="font-mono text-sm hover:text-signal">
                  {c.title}
                </Link>
              </td>
              <td className="font-mono text-xs text-mute">{c.id}</td>
              <td className="font-mono text-xs uppercase">{c.mode}</td>
              <td className="font-mono text-xs text-mute">{c.category ?? "—"}</td>
              <td className="num">
                {modeFor(c).currentValue(c, solves)}
                {cfg.scoring.type === "dynamic" ? <span className="ml-1 text-[0.6rem] text-signal-cyan">dyn</span> : null}
              </td>
              <td className="num text-mute">{cfg.hints.length}</td>
              <td className="num text-signal">{solves}</td>
              <td>{c.hidden ? <Badge variant="warning">hidden</Badge> : <Badge variant="success">live</Badge>}</td>
            </tr>
          );
        })}
      </DataTable>
    </>
  );
}
