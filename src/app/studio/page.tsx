import { FilePlus2, Pencil } from "lucide-react";
import Link from "next/link";

import { LocalTime } from "@/components/dossier/local-time";
import { EmptyState, PageHeader } from "@/components/dossier/primitives";
import { MiniUniverse } from "@/components/experience/studio/presentation-tab";
import { ThemeScope } from "@/components/experience/theme-provider";
import { Badge } from "@/components/ui/badge";
import { getTheme } from "@/lib/experience/themes";
import { Button } from "@/components/ui/button";
import { listStudioEvents } from "@/server/game/studio";
import { requireStaffPage } from "@/server/page-auth";

export const metadata = { title: "Events" };

export default async function StudioHome() {
  const { db } = await requireStaffPage("admin");
  const list = await listStudioEvents(db);
  return (
    <>
      <PageHeader
        eyebrow="Authoring"
        title="Events"
        actions={
          <Button asChild>
            <Link href="/studio/new">
              <FilePlus2 /> Create new event
            </Link>
          </Button>
        }
      >
        Build an investigation from a story: import Markdown, pick rounds and a difficulty curve, generate a challenge graph, validate it, then play it as a team before anyone else does.
      </PageHeader>
      {list.length === 0 ? (
        <EmptyState title="No events yet" action={<Button asChild><Link href="/studio/new">Create your first event</Link></Button>}>
          Or import the flagship demo with <code className="text-signal">pnpm pack:import case-017</code>.
        </EmptyState>
      ) : (
        <ul className="shelf">
          {list.map((e) => (
            <li key={e.id}>
              <Link href={`/studio/${e.id}`} className="shelf-case">
                {/* Each case, shown in the world it will wear. */}
                <ThemeScope theme={getTheme(e.theme).id} className="shelf-look">
                  <span className="shelf-pic" aria-hidden="true">
                    <MiniUniverse theme={getTheme(e.theme)} />
                  </span>
                  <span className="shelf-world">{getTheme(e.theme).name}</span>
                  <span className="shelf-name" style={{ fontFamily: getTheme(e.theme).fonts.display }}>
                    {e.storyTitle || e.name}
                  </span>
                </ThemeScope>
                <span className="flex flex-wrap items-center gap-2 px-4 pt-3">
                  <Badge variant={e.kind === "studio" ? "info" : "secondary"}>{e.kind}</Badge>
                  <Badge variant={e.status === "live" ? "success" : e.status === "ended" ? "outline" : "warning"}>{e.status}</Badge>
                  {e.active ? <Badge variant="accent">active</Badge> : null}
                  {e.version ? <Badge variant="outline">v{e.version}</Badge> : <Badge variant="outline">unpublished</Badge>}
                </span>
                <span className="px-4 font-mono text-sm font-semibold text-ink-dim">{e.name}</span>
                <span className="px-4 font-mono text-xs text-mute">
                  {e.publishedNodes} published files{e.hasDraft ? ` · draft ${e.draftNodes}` : ""}
                </span>
                <ol className="sl mx-4" aria-label="Production line">
                  {e.line.map((s) => (
                    <li key={s.id} className={`is-${s.status}`} title={`${s.id}: ${s.status}`}>
                      <span className="sr-only">
                        {s.id} {s.status}
                      </span>
                    </li>
                  ))}
                </ol>
                <span className="mt-auto flex items-center justify-between px-4 pb-3 font-mono text-[0.65rem] text-faint">
                  <span>
                    updated <LocalTime iso={e.updatedAt} format="full" />
                  </span>
                  <Pencil className="size-3.5" aria-hidden="true" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
