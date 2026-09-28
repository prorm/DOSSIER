import { ClaimFlow } from "@/components/dossier/live-client";
import { RealtimeProvider } from "@/components/dossier/realtime";
import { requireTeamPage } from "@/server/page-auth";

export const metadata = { title: "Checkpoint scan" };

/** Landing page encoded in printed checkpoint QR codes. Requires a team session (login returns here). */
export default async function ClaimPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { csrf, session } = await requireTeamPage(`/c/${token}`);
  return (
    <RealtimeProvider streamUrl="/api/stream?scope=team" pollUrl="/api/play/state">
      <meta name="csrf-token" content={csrf} />
      <main id="main" className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
        <p className="label-mono mb-3 text-center">Checkpoint scan · {session.team.name}</p>
        <ClaimFlow token={decodeURIComponent(token)} />
      </main>
    </RealtimeProvider>
  );
}
