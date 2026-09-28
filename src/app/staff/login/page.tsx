import Link from "next/link";

import { AuthFrame, StaffLoginForm } from "@/components/dossier/auth-forms";

export const metadata = { title: "Staff sign-in" };

export default async function StaffLogin({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const { denied } = await searchParams;
  return (
    <AuthFrame
      eyebrow="Operations"
      title="Staff sign-in"
      aside={
        <p className="text-center font-mono text-xs text-mute">
          Station volunteer with a PIN?{" "}
          <Link href="/volunteer" className="text-signal-2 underline underline-offset-4">
            Open the station console
          </Link>
        </p>
      }
    >
      {denied ? <p className="mb-4 font-mono text-xs text-signal-amber">Your role cannot open that page.</p> : null}
      <StaffLoginForm />
    </AuthFrame>
  );
}
