import { AuthFrame, TeamLoginForm } from "@/components/dossier/auth-forms";
import { getDb } from "@/server/db/client";
import { getActiveEvent } from "@/server/engine/event";
import { teaserUniverse } from "@/server/game/presentation";
import { eventView } from "@/server/views";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const event = await getActiveEvent(await getDb());
  const teaser = event ? teaserUniverse(event) : null;
  return (
    <AuthFrame eyebrow={event?.name ?? "DOSSIER"} title="Team sign-in" teaser={teaser && event ? { ...teaser, accent: eventView(event).theme.accent } : null}>
      <TeamLoginForm next={next} />
    </AuthFrame>
  );
}
