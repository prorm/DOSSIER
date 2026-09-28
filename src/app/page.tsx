import { ArrowRight, Binary, Crosshair, FolderSearch, MapPinned, Trophy } from "lucide-react";
import { cookies } from "next/headers";
import Link from "next/link";

import { AmbientTerminal } from "@/components/dossier/ambient";
import { BootSequence, BOOT_COOKIE } from "@/components/dossier/boot-sequence";
import { Countdown } from "@/components/dossier/countdown";
import { EffectsBoot } from "@/components/dossier/effects";
import { Markdown } from "@/components/dossier/markdown";
import { PhaseChip } from "@/components/dossier/phase";
import DecryptedText from "@/components/reactbits/DecryptedText";
import { Button } from "@/components/ui/button";
import { SIGNAL_HEX } from "@/lib/signals";
import { getDb } from "@/server/db/client";
import { getActiveEvent } from "@/server/engine/event";
import { pageTeamSession } from "@/server/page-auth";
import { eventView } from "@/server/views";

const MODE_INFO = {
  hunt: { icon: Crosshair, title: "Treasure hunt", text: "Follow a branching trail of clues. Every solve opens new paths." },
  ctf: { icon: Binary, title: "Capture the flag", text: "Crack ciphers, dig through files, find the flags. First blood pays." },
  inquest: { icon: FolderSearch, title: "Criminal inquest", text: "Unseal evidence, pin it to your board, name the culprit." },
  live: { icon: MapPinned, title: "Field checkpoints", text: "Physical stations across campus. Scan, prove, score." },
} as const;

export default async function Landing() {
  const db = await getDb();
  const event = await getActiveEvent(db);
  const team = await pageTeamSession();
  const booted = (await cookies()).get(BOOT_COOKIE)?.value === "1";

  if (!event) {
    return (
      <main id="main" className="relative grid min-h-dvh place-items-center px-6">
        <div className="max-w-lg text-center">
          <p className="label-mono">{"DOSSIER // no active event"}</p>
          <h1 className="mt-3 text-2xl font-semibold uppercase">Console idle</h1>
          <p className="mt-3 text-sm text-ink-dim">
            No content pack is active. Organisers: run <code className="text-signal">pnpm pack:import &lt;slug&gt;</code> or sign in to the admin console.
          </p>
          <Button asChild variant="outline" className="mt-6">
            <Link href="/staff/login">Staff sign-in</Link>
          </Button>
        </div>
      </main>
    );
  }

  const ev = eventView(event);
  const signedIn = team && team.team.eventId === event.id;

  return (
    <>
      <EffectsBoot />
      {!booted ? <BootSequence eventName={ev.name} codename={ev.theme.codename} lines={ev.theme.bootLines} /> : null}
      <main id="main" className="relative min-h-dvh overflow-hidden">
        <AmbientTerminal tint={SIGNAL_HEX[ev.theme.accent] ?? "#39FF88"} />
        <div className="relative mx-auto flex min-h-dvh max-w-5xl flex-col px-5 pt-6 pb-10">
          <header className="flex items-center justify-between gap-3">
            <span className="font-mono text-[0.7rem] uppercase tracking-[0.18em] text-mute">
              DOSSIER <span className="text-faint">{"//"}</span> {ev.theme.codename ?? ev.id}
            </span>
            <nav className="flex items-center gap-1" aria-label="Site">
              <Button asChild variant="ghost" size="sm">
                <Link href="/leaderboard">
                  <Trophy /> <span className="hidden sm:inline">Leaderboard</span>
                </Link>
              </Button>
              {!signedIn ? (
                <Button asChild variant="ghost" size="sm">
                  <Link href="/login">Sign in</Link>
                </Button>
              ) : null}
            </nav>
          </header>

          <section className="flex flex-1 flex-col justify-center py-16" aria-labelledby="hero">
            <div className="mb-5 flex flex-wrap items-center gap-3">
              <PhaseChip phase={ev.phase} frozen={ev.frozen} />
              {ev.organizer ? <span className="label-mono">{ev.organizer}</span> : null}
            </div>
            <h1 id="hero" className="max-w-3xl text-4xl leading-[1.05] font-bold uppercase tracking-[0.02em] sm:text-6xl">
              <DecryptedText text={ev.name} animateOn="view" sequential speed={35} encryptedClassName="text-signal/60" />
            </h1>
            {ev.tagline ? <p className="mt-5 max-w-xl text-base text-ink-dim sm:text-lg">{ev.tagline}</p> : null}

            {ev.phase === "standby" && ev.startsAt ? (
              <p className="mt-6 font-mono text-sm text-mute">
                Operations begin in <Countdown to={ev.startsAt} label="Operations begin in" className="text-lg font-semibold text-signal-2" />
              </p>
            ) : ev.phase === "live" && ev.endsAt ? (
              <p className="mt-6 font-mono text-sm text-mute">
                Time remaining <Countdown to={ev.endsAt} label="Time remaining" className="text-lg font-semibold text-signal" />
              </p>
            ) : null}

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              {signedIn ? (
                <Button asChild size="lg">
                  <Link href="/play">
                    Enter console <ArrowRight />
                  </Link>
                </Button>
              ) : (
                <>
                  {ev.registration.open && ev.phase !== "ended" ? (
                    <Button asChild size="lg">
                      <Link href="/register">
                        Register your team <ArrowRight />
                      </Link>
                    </Button>
                  ) : null}
                  <Button asChild size="lg" variant="outline">
                    <Link href="/login">Team sign-in</Link>
                  </Button>
                </>
              )}
            </div>
          </section>

          <section aria-labelledby="modes-h" className="pb-8">
            <h2 id="modes-h" className="label-mono mb-3">
              Operations in this event
            </h2>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {ev.modes.map((m) => {
                const info = MODE_INFO[m];
                return (
                  <li key={m} className="panel bg-[color-mix(in_srgb,var(--color-surface)_85%,transparent)] p-4 backdrop-blur-sm">
                    <info.icon className="size-5 text-signal" aria-hidden="true" />
                    <h3 className="mt-3 font-mono text-sm font-semibold uppercase tracking-[0.06em]">{m === "hunt" ? ev.hunt.title : info.title}</h3>
                    <p className="mt-1 text-sm text-ink-dim">{info.text}</p>
                  </li>
                );
              })}
            </ul>
          </section>

          {ev.rulesMd ? (
            <details className="panel group bg-[color-mix(in_srgb,var(--color-surface)_85%,transparent)] p-4">
              <summary className="label-mono cursor-pointer list-none text-ink-dim">
                <span className="mr-2 inline-block transition-transform group-open:rotate-90">›</span>Rules
              </summary>
              <Markdown className="mt-3">{ev.rulesMd}</Markdown>
            </details>
          ) : null}

          <footer className="mt-10 flex flex-wrap items-center justify-between gap-2 font-mono text-[0.65rem] uppercase tracking-[0.14em] text-faint">
            <span>Powered by DOSSIER — open-source fest engine</span>
            <Link href="/staff/login" className="hover:text-mute">
              Staff
            </Link>
          </footer>
        </div>
      </main>
    </>
  );
}
