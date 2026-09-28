import { AuthFrame, TeamLoginForm } from "@/components/dossier/auth-forms";
import { getDb } from "@/server/db/client";
import { getActiveEvent } from "@/server/engine/event";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const event = await getActiveEvent(await getDb());
  return (
    <AuthFrame eyebrow={event?.name ?? "DOSSIER"} title="Team sign-in">
      <TeamLoginForm next={next} />
    </AuthFrame>
  );
}
