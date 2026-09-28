import Link from "next/link";

import { AuthFrame } from "@/components/dossier/auth-forms";
import { EffectsBoot } from "@/components/dossier/effects";
import { EmptyState } from "@/components/dossier/primitives";
import { RealtimeProvider } from "@/components/dossier/realtime";
import { StationConsole, StationLogin } from "@/components/dossier/volunteer-client";
import { csrfTokenFor, hasRole } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { getActiveEvent } from "@/server/engine/event";
import { listCheckpoints } from "@/server/engine/live";
import { pageStaffSession } from "@/server/page-auth";

export const metadata = { title: "Station console" };

export default async function VolunteerPage() {
  const db = await getDb();
  const event = await getActiveEvent(db);
  if (!event) return <EmptyState title="No active event" className="m-6" />;
  const session = await pageStaffSession();
  const cps = await listCheckpoints(db, event.id);
  const authed = session && (session.kind === "station" ? session.eventId === event.id : hasRole(session.staff.role, "volunteer"));

  if (!authed) {
    return (
      <AuthFrame
        eyebrow={event.name}
        title="Station sign-in"
        aside={
          <p className="text-center font-mono text-xs text-mute">
            Have a staff account?{" "}
            <Link href="/staff/login" className="text-signal-2 underline underline-offset-4">
              Staff sign-in
            </Link>
          </p>
        }
      >
        {cps.length ? <StationLogin checkpoints={cps.filter((c) => c.pinHash).map((c) => ({ id: c.id, name: c.name }))} /> : <p className="text-sm text-mute">This event has no checkpoints.</p>}
      </AuthFrame>
    );
  }

  return (
    <RealtimeProvider streamUrl="/api/stream?scope=staff" pollUrl="/api/admin/pulse">
      <EffectsBoot />
      <meta name="csrf-token" content={csrfTokenFor(session!)} />
      <main id="main" className="mx-auto max-w-4xl px-4 py-6">
        <StationConsole fixedCheckpoint={session!.kind === "station"} isStaff={session!.kind === "staff"} />
      </main>
    </RealtimeProvider>
  );
}
