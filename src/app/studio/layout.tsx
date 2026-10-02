import { Activity, Clapperboard, LayoutGrid } from "lucide-react";
import Link from "next/link";

import { EffectsBoot } from "@/components/dossier/effects";
import { requireStaffPage } from "@/server/page-auth";

import "./studio.css";

export const metadata = { title: { default: "Studio", template: "%s · DOSSIER Studio" } };

/** DOSSIER Studio: organiser authoring. Admin staff only. */
export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  const { session, csrf } = await requireStaffPage("admin");
  return (
    <>
      <meta name="csrf-token" content={csrf} />
      <EffectsBoot />
      <div className="flex min-h-dvh flex-col">
        <header className="sticky top-0 z-40 border-b border-line bg-[color-mix(in_srgb,var(--color-bg)_88%,transparent)] backdrop-blur-md">
          <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4">
            <Link href="/studio" className="flex items-center gap-2 font-mono text-sm font-semibold uppercase tracking-[0.12em] whitespace-nowrap">
              <Clapperboard className="size-4 text-signal" aria-hidden="true" /> DOSSIER Studio
            </Link>
            <nav className="ml-auto flex items-center gap-4 font-mono text-[0.7rem] uppercase tracking-[0.12em] whitespace-nowrap text-mute">
              <Link href="/studio" className="flex items-center gap-1.5 hover:text-ink">
                <LayoutGrid className="size-3.5" aria-hidden="true" /> <span className="hidden sm:inline">Events</span><span className="sr-only sm:hidden">Events</span>
              </Link>
              <Link href="/admin" className="flex items-center gap-1.5 hover:text-ink">
                <Activity className="size-3.5" aria-hidden="true" /> <span className="hidden sm:inline">Control room</span><span className="sr-only sm:hidden">Control room</span>
              </Link>
              <span className="hidden text-faint sm:inline">{session.staff.email}</span>
            </nav>
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 pt-6 pb-16">
          {children}
        </main>
      </div>
    </>
  );
}
