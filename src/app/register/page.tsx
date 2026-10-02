import Link from "next/link";

import { AuthFrame, RegisterForm } from "@/components/dossier/auth-forms";
import { LockedState } from "@/components/dossier/primitives";
import { Button } from "@/components/ui/button";
import { getDb } from "@/server/db/client";
import { getActiveEvent } from "@/server/engine/event";
import { teaserUniverse } from "@/server/game/presentation";
import { eventView } from "@/server/views";

export const metadata = { title: "Register" };

export default async function RegisterPage() {
  const event = await getActiveEvent(await getDb());
  if (!event) {
    return (
      <AuthFrame eyebrow="DOSSIER" title="Register">
        <p className="text-sm text-ink-dim">No event is active yet.</p>
      </AuthFrame>
    );
  }
  const ev = eventView(event);
  if (!ev.registration.open || ev.phase === "ended") {
    return (
      <main id="main" className="mx-auto grid min-h-dvh max-w-lg place-items-center px-4">
        <LockedState
          title="Registration closed"
          action={
            <Button asChild variant="outline">
              <Link href="/login">Team sign-in</Link>
            </Button>
          }
        >
          {ev.phase === "ended" ? "This event has ended." : "The organisers have closed registration. Ask them at the help desk."}
        </LockedState>
      </main>
    );
  }
  return (
    <AuthFrame eyebrow={ev.name} title="Register your team" teaser={(() => { const t = teaserUniverse(event); return t ? { ...t, accent: ev.theme.accent } : null; })()}>
      <RegisterForm minMembers={ev.registration.minMembers} maxMembers={ev.registration.maxMembers} requiresCode={ev.registration.requiresCode} />
    </AuthFrame>
  );
}
