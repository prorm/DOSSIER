import { Fingerprint, Network, Timer, Zap } from "lucide-react";
import Link from "next/link";

import { EmptyState, PageHeader } from "@/components/dossier/primitives";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { suspiciousSignals } from "@/server/engine/admin";
import { requireStaffPage } from "@/server/page-auth";

export const metadata = { title: "Signals" };

const ICON = { "shared-wrong-answer": Fingerprint, "shared-ip": Network, "fast-solve": Timer, "submission-burst": Zap } as const;

export default async function AdminSignals() {
  const { db, event } = await requireStaffPage("admin");
  if (!event) return <EmptyState title="No active event" />;
  const signals = await suspiciousSignals(db, event);
  return (
    <>
      <PageHeader eyebrow="Integrity" title="Suspicious activity">
        Signals, not verdicts. Nothing here penalises a team automatically — shared campus Wi-Fi and common wrong guesses are normal. Corroborate before acting.
      </PageHeader>
      {signals.length === 0 ? (
        <EmptyState title="All quiet">No patterns worth reviewing right now.</EmptyState>
      ) : (
        <ul className="space-y-3">
          {signals.map((s, i) => {
            const Icon = ICON[s.kind];
            return (
              <li key={i} className={cn("panel flex gap-3 p-4", s.severity === "high" && "border-[color-mix(in_srgb,var(--color-signal-magenta)_45%,var(--color-line))]")}>
                <Icon className={cn("mt-0.5 size-5 shrink-0", s.severity === "high" ? "text-signal-magenta" : s.severity === "medium" ? "text-signal-amber" : "text-mute")} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-mono text-sm">
                    {s.summary}
                    <Badge variant={s.severity === "high" ? "danger" : s.severity === "medium" ? "warning" : "outline"}>{s.severity}</Badge>
                    <Badge variant="secondary">{s.kind}</Badge>
                  </p>
                  <p className="mt-1.5 flex flex-wrap gap-1.5">
                    {s.teams.map((t) => (
                      <Link key={t.id} href={`/admin/teams/${t.id}`} className="rounded-xs border border-line px-1.5 py-0.5 font-mono text-xs hover:border-line-strong hover:text-signal">
                        {t.name}
                      </Link>
                    ))}
                  </p>
                  {typeof s.details.preview === "string" ? <p className="mt-1.5 font-mono text-xs text-mute">answer: “{s.details.preview}”</p> : null}
                  {typeof s.details.note === "string" ? <p className="mt-1.5 text-xs text-faint">{s.details.note}</p> : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
