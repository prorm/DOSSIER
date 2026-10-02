import { ArrowRight, Binary, Crosshair, FileSearch, FolderSearch, Globe, MapPinned, Radio, Scale, Trophy, type LucideIcon } from "lucide-react";
import { cookies } from "next/headers";
import Link from "next/link";

import { AmbientTerminal } from "@/components/dossier/ambient";
import { BootSequence } from "@/components/dossier/boot-sequence";
import { BOOT_COOKIE } from "@/lib/boot";
import { Countdown } from "@/components/dossier/countdown";
import { EffectsBoot } from "@/components/dossier/effects";
import { Markdown } from "@/components/dossier/markdown";
import { PhaseChip } from "@/components/dossier/phase";
import { FrontBackdrop } from "@/components/experience/front/front-backdrop";
import { Showcase } from "@/components/experience/front/showcase";
import DecryptedText from "@/components/reactbits/DecryptedText";
import { Button } from "@/components/ui/button";
import { SIGNAL_HEX } from "@/lib/signals";
import { getDb } from "@/server/db/client";
import { getActiveEvent } from "@/server/engine/event";
import { env } from "@/server/env";
import { teaserUniverse } from "@/server/game/presentation";
import { pageTeamSession } from "@/server/page-auth";
import { eventView } from "@/server/views";

/** What each challenge family asks of a team, for the public landing page. */
const FAMILY_INFO: Record<string, { icon: LucideIcon; title: string; text: string }> = {
  cryptic: { icon: Crosshair, title: "Cryptic", text: "Multi-stage clues whose answers differ for every team." },
  hunt: { icon: Crosshair, title: "Treasure hunt", text: "Follow a branching trail of clues. Every solve opens new paths." },
  browser: { icon: Globe, title: "Browser investigation", text: "Live sites with evidence in headers, storage, caches and source maps. Bring DevTools." },
  forensics: { icon: Radio, title: "Forensics", text: "Real files: EXIF, spectrograms, PDFs, logs, encrypted archives." },
  ctf: { icon: Binary, title: "Technical", text: "Git history, packet captures, SQL over your own database." },
  osint: { icon: FileSearch, title: "OSINT", text: "Correlate a fictional public trail. No single search finds it." },
  inquest: { icon: FolderSearch, title: "Criminal inquest", text: "Interview suspects, rebuild the timeline, wire the evidence board." },
  physical: { icon: MapPinned, title: "Field", text: "Physical stations across campus. Scan, prove, unlock." },
  final: { icon: Scale, title: "Final reconstruction", text: "Culprit, motive, method, time and proof — only a coherent case scores in full." },
};

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
  const teaser = teaserUniverse(event);
  const teams = ev.registration.minMembers === ev.registration.maxMembers ? `teams of ${ev.registration.maxMembers}` : `teams of ${ev.registration.minMembers}–${ev.registration.maxMembers}`;

  // Where DOSSIER is being shown rather than run (a demo, a hackathon floor), the front door says what the
  // engine is and offers the live case as its proof. A real event's front door stays the event's own.
  if (env().DEV_UI || process.env.SHOWCASE === "1") {
    return (
      <>
        <EffectsBoot />
        <main id="main" className="relative min-h-dvh overflow-hidden">
          {teaser ? <FrontBackdrop input={teaser.input} fingerprint={teaser.fingerprint} layoutSeed={teaser.layoutSeed} accent={ev.theme.accent} shift={300} veil="showcase" /> : <AmbientTerminal tint={SIGNAL_HEX[ev.theme.accent] ?? "#39FF88"} />}
          <Showcase
            eventName={ev.name}
            tagline={ev.tagline}
            phase={ev.phase}
            frozen={ev.frozen}
            counts={teaser?.counts ?? null}
            teams={`Played by ${teams}`}
            signedIn={Boolean(signedIn)}
            registrationOpen={ev.registration.open}
            countdown={
              ev.phase === "live" && ev.endsAt ? (
                <p className="sc-case-clock">
                  <Countdown to={ev.endsAt} label="Time remaining" /> left
                </p>
              ) : ev.phase === "standby" && ev.startsAt ? (
                <p className="sc-case-clock">
                  opens in <Countdown to={ev.startsAt} label="Starts in" />
                </p>
              ) : null
            }
          />
        </main>
      </>
    );
  }

  return (
    <>
      <EffectsBoot />
      {!booted ? <BootSequence eventName={ev.name} codename={ev.theme.codename} lines={ev.theme.bootLines} /> : null}
      <main id="main" className="relative min-h-dvh overflow-hidden">
        {teaser ? <FrontBackdrop input={teaser.input} fingerprint={teaser.fingerprint} layoutSeed={teaser.layoutSeed} accent={ev.theme.accent} shift={260} /> : <AmbientTerminal tint={SIGNAL_HEX[ev.theme.accent] ?? "#39FF88"} />}
        <div className="relative z-10 mx-auto flex min-h-dvh max-w-6xl flex-col px-5 pt-6 pb-10">
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
            <h1 id="hero" className="front-title max-w-3xl text-4xl leading-[1.04] font-bold uppercase tracking-[0.02em] sm:text-6xl lg:text-7xl">
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

            {teaser ? (
              <dl className="front-facts" aria-label="The case in numbers">
                <div>
                  <dt>Files</dt>
                  <dd className="num">{teaser.counts.files}</dd>
                </div>
                <div>
                  <dt>Acts</dt>
                  <dd className="num">{teaser.counts.acts}</dd>
                </div>
                <div>
                  <dt>Exhibits</dt>
                  <dd className="num">{teaser.counts.exhibits}</dd>
                </div>
                <div>
                  <dt>Players</dt>
                  <dd>{teams}</dd>
                </div>
              </dl>
            ) : null}
          </section>

          <section aria-labelledby="modes-h" className="front-read pb-8">
            <h2 id="modes-h" className="label-mono mb-4">
              What the case will ask of you
            </h2>
            <ol className="front-ops">
              {ev.families.map((m, i) => {
                const info = FAMILY_INFO[m] ?? { icon: Crosshair, title: m, text: "" };
                return (
                  <li key={m}>
                    <span className="front-ops-no num" aria-hidden="true">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <info.icon className="front-ops-icon" aria-hidden="true" />
                    <div>
                      <h3>{info.title}</h3>
                      <p>{info.text}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
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
            <span>Powered by DOSSIER — open-source investigation game engine</span>
            <Link href="/staff/login" className="hover:text-mute">
              Staff
            </Link>
          </footer>
        </div>
      </main>
    </>
  );
}
