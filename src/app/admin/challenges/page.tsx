import { eq } from "drizzle-orm";
import Link from "next/link";

import { DataTable } from "@/components/dossier/admin-table";
import { EmptyState, PageHeader } from "@/components/dossier/primitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { challenges } from "@/server/db/schema";
import { getLeaderboard } from "@/server/engine/leaderboard";
import { currentValue, nodeScoring } from "@/server/engine/scoring";
import { requireStaffPage } from "@/server/page-auth";

export const metadata = { title: "Challenges" };

export default async function AdminChallenges() {
  const { db, event } = await requireStaffPage("admin");
  if (!event) return <EmptyState title="No active event" />;
  const [chs, lb] = await Promise.all([db.select().from(challenges).where(eq(challenges.eventId, event.id)).orderBy(challenges.sortOrder), getLeaderboard(db, event.id, "live")]);
  return (
    <>
      <PageHeader
        eyebrow="Content"
        title="Challenges"
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href={`/studio/${event.id}`}>Edit in Studio</Link>
          </Button>
        }
      >
        The published challenge graph. Edit content, gates and primitives in Studio, then republish — running events keep their ledger.
      </PageHeader>
      <DataTable head={["Title", "Id", "Family", "Primitive", "Depth", "Value", "Solves", "State"]} caption="All challenges" minWidth={820}>
        {chs.map((c) => {
          const s = nodeScoring(c);
          const solves = lb.solveCounts[c.id] ?? 0;
          const d = c.difficulty as { depth?: number };
          return (
            <tr key={c.id} className="hover:bg-raised/50">
              <td>
                <Link href={`/studio/${event.id}?node=${c.id}`} className="font-mono text-sm hover:text-signal">
                  {c.title}
                </Link>
              </td>
              <td className="font-mono text-xs text-mute">{c.id}</td>
              <td className="font-mono text-xs uppercase">{c.mode}</td>
              <td className="font-mono text-xs text-mute">{c.primitive}</td>
              <td className="num">{d.depth ?? "—"}</td>
              <td className="num">
                {currentValue(s, solves)}
                {s.dynamic ? <span className="ml-1 text-[0.6rem] text-signal-cyan">dyn</span> : null}
              </td>
              <td className="num text-signal">{solves}</td>
              <td>{c.hidden ? <Badge variant="warning">hidden</Badge> : <Badge variant="success">live</Badge>}</td>
            </tr>
          );
        })}
      </DataTable>
    </>
  );
}
