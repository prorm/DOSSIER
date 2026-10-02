import Link from "next/link";
import { notFound } from "next/navigation";

import { EffectsBoot } from "@/components/dossier/effects";
import { RoomHeader } from "@/components/experience/room/room";
import { Stage } from "@/components/experience/stages";
import { mockStage, STAGE_KINDS } from "@/components/experience/stages/mock";
import { STAGE_TITLE } from "@/components/experience/stages/types";
import { isThemeId, THEME_LIST } from "@/lib/experience/themes";
import { env } from "@/server/env";
import { pageStaffSession } from "@/server/page-auth";

export const metadata = { title: "Room lab" };

/**
 * Every workstation with sample data, in the current theme (append ?theme=cold-case in development).
 * `?stage=web` shows one room; without it, an index.
 */
export default async function RoomLab({ searchParams }: { searchParams: Promise<{ stage?: string }> }) {
  const e = env();
  const staff = await pageStaffSession();
  if (e.NODE_ENV === "production" && !e.DEV_UI && !(staff && staff.kind === "staff")) notFound();
  const { stage } = await searchParams;
  const kind = STAGE_KINDS.find((k) => k === stage);
  return (
    <main id="main" className="mx-auto max-w-6xl px-4 py-8">
      <EffectsBoot />
      <p className="label-mono mb-2">DOSSIER // room lab</p>
      <nav className="mb-8 flex flex-wrap gap-2" aria-label="Rooms">
        {STAGE_KINDS.map((k) => (
          <Link key={k} href={`/dev/rooms?stage=${k}`} className={`chip-btn ${k === kind ? "is-primary" : ""}`}>
            {STAGE_TITLE[k]}
          </Link>
        ))}
      </nav>
      {kind ? (
        <article className="room">
          <RoomHeader crumbs={["Sample", STAGE_TITLE[kind]]} title={mockStage(kind).title} code="FILE F-0000" points={200} minutes={20} optional={false} state="open" stageTitle={STAGE_TITLE[kind]} />
          <Stage ctx={mockStage(kind)} />
        </article>
      ) : (
        <div>
          <p className="text-sm text-ink-dim">Pick a room. Themes: {THEME_LIST.filter((t) => isThemeId(t.id)).map((t) => t.id).join(", ")} (set the dev cookie <code>dossier_theme</code>).</p>
        </div>
      )}
    </main>
  );
}
