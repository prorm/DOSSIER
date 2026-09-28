import path from "node:path";

import { PackExportButton, PackImportButton } from "@/components/dossier/admin-misc";
import { EmptyState, PageHeader } from "@/components/dossier/primitives";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { hasRole } from "@/server/auth/session";
import { env } from "@/server/env";
import { formatIssue, listPacks, loadPack } from "@/server/packs/load";
import { requireStaffPage } from "@/server/page-auth";

export const metadata = { title: "Packs" };

export default async function AdminPacks() {
  const { session, event } = await requireStaffPage("admin");
  const dir = path.resolve(env().PACKS_DIR);
  const slugs = await listPacks(dir);
  const packs = await Promise.all(slugs.map(async (slug) => ({ slug, ...(await loadPack(dir, slug)) })));
  const owner = hasRole(session.staff.role, "owner");
  return (
    <>
      <PageHeader eyebrow="Content" title="Content packs" actions={event ? <PackExportButton /> : null}>
        Packs live in <code className="font-mono text-signal">./packs/&lt;slug&gt;</code> on the server and are validated here exactly as by{" "}
        <code className="font-mono text-signal">pnpm pack:validate</code>. Re-importing a running event hides removed challenges instead of deleting them.
      </PageHeader>
      {packs.length === 0 ? (
        <EmptyState title="No packs found">Add a pack folder under ./packs.</EmptyState>
      ) : (
        <ul className="space-y-4">
          {packs.map((p) => {
            const errors = p.issues.filter((i) => i.severity === "error");
            const active = event?.id === p.slug;
            return (
              <li key={p.slug} className={cn("panel space-y-3 p-4", active && "border-[color-mix(in_srgb,var(--accent)_45%,var(--color-line))]")}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="flex flex-wrap items-center gap-2 font-mono text-base font-semibold">
                      {p.pack?.event.name ?? p.slug}
                      {active ? <Badge variant="accent">active</Badge> : null}
                      {p.pack ? <Badge variant="success">valid</Badge> : <Badge variant="danger">{errors.length} errors</Badge>}
                    </h2>
                    <p className="font-mono text-xs text-mute">
                      {p.slug}
                      {p.pack ? ` · ${p.pack.challenges.length} challenges · ${p.pack.event.modes.join(", ")} · hash ${p.pack.hash}` : ""}
                      {active && event?.packHash && p.pack && event.packHash !== p.pack.hash ? <span className="text-signal-amber"> · changed on disk since import</span> : null}
                    </p>
                  </div>
                  {p.pack ? <PackImportButton slug={p.slug} canImport={owner} /> : null}
                </div>
                {p.issues.length ? (
                  <ul className="max-h-60 space-y-1 overflow-y-auto rounded-sm border border-line bg-bg p-3 font-mono text-xs">
                    {p.issues.map((i, k) => (
                      <li key={k} className={i.severity === "error" ? "text-signal-magenta" : "text-signal-amber"}>
                        {formatIssue(i)}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
