import { DisplayBoard } from "@/components/dossier/display-client";
import { EffectsBoot } from "@/components/dossier/effects";
import { LockedState } from "@/components/dossier/primitives";
import { RealtimeProvider } from "@/components/dossier/realtime";
import { SIGNAL_HEX } from "@/lib/signals";
import { getDb } from "@/server/db/client";
import { listAnnouncements } from "@/server/engine/admin";
import { verifyDisplayToken } from "@/server/engine/display";
import { getActiveEvent } from "@/server/engine/event";
import { getLeaderboard, publicLeaderboardView } from "@/server/engine/leaderboard";
import { pageStaffSession } from "@/server/page-auth";
import { eventView } from "@/server/views";

export const metadata = { title: "Display" };

/** Projector view: /display?k=<signed link from Admin → Event control>, or any signed-in staff browser. */
export default async function DisplayPage({ searchParams }: { searchParams: Promise<{ k?: string }> }) {
  const { k = "" } = await searchParams;
  const db = await getDb();
  const event = await getActiveEvent(db);
  if (!event) return <LockedState title="No active event" className="m-6" />;
  const staff = await pageStaffSession();
  if (!verifyDisplayToken(event, k) && !staff) {
    return (
      <main id="main" className="mx-auto grid min-h-dvh max-w-lg place-items-center px-4">
        <LockedState title="Display link required">Open the projector link generated in Admin → Event control, or sign in as staff on this machine.</LockedState>
      </main>
    );
  }
  const ev = eventView(event);
  const [lb, anns] = await Promise.all([getLeaderboard(db, event.id, "public"), listAnnouncements(db, event.id, 4)]);
  const kq = k ? `&k=${encodeURIComponent(k)}` : "";
  return (
    <RealtimeProvider streamUrl={`/api/stream?scope=display${kq}`} pollUrl={`/api/display/pulse?${kq.slice(1)}`}>
      <EffectsBoot />
      <main id="main">
        <DisplayBoard
          eventName={ev.name}
          tagline={ev.tagline}
          initial={publicLeaderboardView(lb)}
          initialAnns={anns.map((a) => ({ id: a.id, title: a.title, body: a.body, level: a.level, at: a.createdAt.toISOString() }))}
          phase={ev.phase}
          endsAt={ev.endsAt}
          tint={SIGNAL_HEX[ev.theme.accent] ?? "#39FF88"}
        />
      </main>
    </RealtimeProvider>
  );
}
