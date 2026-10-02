import Link from "next/link";

import { LiveRefresh } from "@/components/dossier/admin-client";
import { DataTable } from "@/components/dossier/admin-table";
import { LocalTime } from "@/components/dossier/local-time";
import { EmptyState, PageHeader } from "@/components/dossier/primitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { searchSubmissions, SubmissionQuery } from "@/server/engine/admin";
import { eq } from "drizzle-orm";
import { challenges } from "@/server/db/schema";
import { requireStaffPage } from "@/server/page-auth";

export const metadata = { title: "Submissions" };

const selectCls = "h-10 rounded-sm border border-line-strong bg-bg px-2 font-mono text-sm text-ink";

export default async function AdminSubmissions({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const { db, event } = await requireStaffPage("admin");
  if (!event) return <EmptyState title="No active event" />;
  const q = SubmissionQuery.parse({ limit: 50, ...sp });
  const [rows, chs] = await Promise.all([searchSubmissions(db, event, q), db.select().from(challenges).where(eq(challenges.eventId, event.id))]);
  const next = rows.length === q.limit ? rows.at(-1)!.id : null;
  const qs = (extra: Record<string, string | number>) => new URLSearchParams({ ...(sp as Record<string, string>), ...Object.fromEntries(Object.entries(extra).map(([k, v]) => [k, String(v)])) }).toString();

  return (
    <>
      {!q.before ? <LiveRefresh types={["submission"]} minMs={5000} /> : null}
      <PageHeader eyebrow="Forensics" title="Submission log">
        Wrong answers keep a short preview for review; correct answers are never stored in clear. The fingerprint groups identical normalised submissions.
      </PageHeader>
      <form className="mb-4 grid gap-2 sm:grid-cols-[1fr_200px_140px_auto]" role="search">
        <Input name="q" defaultValue={q.q} placeholder="Team or submitted text" aria-label="Search submissions" />
        <select name="challengeId" defaultValue={q.challengeId ?? ""} className={selectCls} aria-label="Challenge">
          <option value="">All challenges</option>
          {chs.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
        <select name="result" defaultValue={q.result} className={selectCls} aria-label="Result">
          <option value="all">All results</option>
          <option value="correct">Correct</option>
          <option value="wrong">Wrong</option>
        </select>
        <Button type="submit" variant="outline">
          Filter
        </Button>
      </form>
      {rows.length === 0 ? (
        <EmptyState title="No submissions match">Try a broader filter.</EmptyState>
      ) : (
        <DataTable head={["When", "Team", "Challenge", "Result", "Submitted", "Fingerprint", "IP"]} caption="Submissions" minWidth={900}>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="font-mono text-xs text-mute">
                <LocalTime iso={r.createdAt} format="day-time" />
              </td>
              <td>
                <Link href={`/admin/teams/${r.teamId}`} className="font-mono text-sm hover:text-signal">
                  {r.teamName}
                </Link>
              </td>
              <td className="font-mono text-xs">{r.challengeId}</td>
              <td>{r.correct ? <Badge variant="success">correct</Badge> : <Badge variant="danger">wrong</Badge>}</td>
              <td className="max-w-64 truncate font-mono text-xs">{r.correct ? <span className="text-faint">— hidden —</span> : r.preview}</td>
              <td className="font-mono text-[0.68rem] text-faint">{r.fingerprint}</td>
              <td className="font-mono text-xs text-mute">{r.ip}</td>
            </tr>
          ))}
        </DataTable>
      )}
      <div className="mt-4 flex gap-2">
        {q.before ? (
          <Button asChild variant="ghost" size="sm">
            <Link href={`/admin/submissions?${qs({ before: "" }).replace(/(^|&)before=(&|$)/, "$1")}`}>Newest</Link>
          </Button>
        ) : null}
        {next ? (
          <Button asChild variant="outline" size="sm">
            <Link href={`/admin/submissions?${qs({ before: next })}`}>Older →</Link>
          </Button>
        ) : null}
      </div>
    </>
  );
}
