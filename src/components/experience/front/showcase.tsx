import { ArrowRight, Binary, Crosshair, FileSearch, FolderSearch, Globe, MapPinned, Radio, Scale, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { PhaseChip, type Phase } from "@/components/dossier/phase";
import { ThemeScope } from "@/components/experience/theme-provider";
import { MiniUniverse } from "@/components/experience/studio/presentation-tab";
import { THEME_LIST } from "@/lib/experience/themes";

const FAMILIES: { id: string; icon: LucideIcon; title: string; text: string }[] = [
  { id: "cryptic", icon: Crosshair, title: "Cryptic", text: "Multi-stage clues whose answers differ for every team." },
  { id: "browser", icon: Globe, title: "Live sites", text: "Synthetic websites with evidence in headers, storage, caches, source maps." },
  { id: "forensics", icon: Radio, title: "Forensics", text: "Real files generated per team: audio, images, logs, encrypted archives." },
  { id: "ctf", icon: Binary, title: "Technical", text: "Git history, packet captures, SQL over a per-team database." },
  { id: "osint", icon: FileSearch, title: "OSINT", text: "A fictional public trail no single search can find." },
  { id: "inquest", icon: FolderSearch, title: "Inquest", text: "Interviews, a timeline to rebuild, an evidence board the server checks." },
  { id: "physical", icon: MapPinned, title: "Field", text: "QR checkpoints across campus, volunteer-confirmed." },
  { id: "final", icon: Scale, title: "Reconstruction", text: "Culprit, motive, method, proof — a coherent case scores in full." },
];

const LINE: { id: string; title: string; text: string }[] = [
  { id: "story", title: "Story", text: "Paste a story in Markdown. People, places, timeline and the truth are read out of it." },
  { id: "world", title: "World", text: "Every team gets its own facts — codes, names, times, hosts — so answers can't be shared." },
  { id: "challenges", title: "Challenges", text: "Files are generated from typed primitives, not written by hand." },
  { id: "logic", title: "Logic", text: "Gates wire them into a graph; depth and the critical path are measured." },
  { id: "presentation", title: "Presentation", text: "Four themes re-dress everything a player sees, from the map to the board." },
  { id: "playtest", title: "Playtest", text: "Bots solve every team's instance before a single player does." },
  { id: "publish", title: "Publish", text: "Answers are sealed, the event opens, the Control Room goes live." },
];

/**
 * The front door when DOSSIER is being shown rather than run: it says what the engine is in one line,
 * proves it with the case running right now (its universe is the backdrop, its numbers are real), and
 * keeps the players' way in — register, sign in — one click away.
 */
export function Showcase({
  eventName,
  tagline,
  phase,
  frozen,
  counts,
  teams,
  signedIn,
  registrationOpen,
  countdown,
}: {
  eventName: string;
  tagline: string;
  phase: Phase;
  frozen: boolean;
  counts: { files: number; acts: number; exhibits: number } | null;
  teams: string;
  signedIn: boolean;
  registrationOpen: boolean;
  countdown: ReactNode;
}) {
  return (
    <div className="relative z-10 mx-auto flex min-h-dvh max-w-6xl flex-col px-5 pt-6 pb-10">
      <header className="flex items-center justify-between gap-3">
        <span className="sc-mark">
          <b>DOSSIER</b> <span>{"//"} investigation game engine</span>
        </span>
        <nav className="flex items-center gap-4 font-mono text-[0.68rem] uppercase tracking-[0.14em] text-mute" aria-label="Site">
          <Link href="/leaderboard" className="hover:text-ink">
            Leaderboard
          </Link>
          <Link href="/staff/login" className="hover:text-ink">
            Organisers
          </Link>
        </nav>
      </header>

      <section className="sc-hero" aria-labelledby="sc-h">
        <div className="sc-lede">
          <p className="sc-eyebrow">Open source · self-hosted · for tech fests</p>
          <h1 id="sc-h" className="sc-title">
            Write the story.
            <br />
            <em>DOSSIER builds the game.</em>
          </h1>
          <p className="sc-sub">A whole CTF, treasure hunt or criminal investigation — generated from a Markdown story into a world every team plays differently: per-team puzzles, real files, a 3D case map, an evidence board the server can check, and a control room to run it live.</p>
          <div className="sc-ctas">
            <Link href="/studio" className="sc-btn is-primary">
              Build an event <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
            <a href="#how" className="sc-btn">
              How it works
            </a>
          </div>
        </div>

        {/* The proof: a case built with it, running now. Players start here. */}
        <aside className="sc-case" aria-label="Running now">
          <p className="sc-case-head">
            <PhaseChip phase={phase} frozen={frozen} /> <span>Running now</span>
          </p>
          <p className="sc-case-name">{eventName}</p>
          {tagline ? <p className="sc-case-tag">{tagline}</p> : null}
          {counts ? (
            <dl className="sc-case-nums" aria-label="The case in numbers">
              <div>
                <dt>Files</dt>
                <dd className="num">{counts.files}</dd>
              </div>
              <div>
                <dt>Acts</dt>
                <dd className="num">{counts.acts}</dd>
              </div>
              <div>
                <dt>Exhibits</dt>
                <dd className="num">{counts.exhibits}</dd>
              </div>
            </dl>
          ) : null}
          {countdown}
          <p className="sc-case-who">{teams}</p>
          <div className="sc-case-ctas">
            {signedIn ? (
              <Link href="/play" className="sc-btn is-primary">
                Enter the console <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            ) : (
              <>
                {registrationOpen && phase !== "ended" ? (
                  <Link href="/register" className="sc-btn is-primary">
                    Register a team <ArrowRight className="size-4" aria-hidden="true" />
                  </Link>
                ) : null}
                <Link href="/login" className="sc-btn">
                  Team sign-in
                </Link>
              </>
            )}
          </div>
        </aside>
      </section>

      <section id="how" className="sc-sec" aria-labelledby="how-h">
        <h2 id="how-h" className="sc-h">
          From a story to a playable world, on one line
        </h2>
        <ol className="sc-line">
          {LINE.map((s, i) => (
            <li key={s.id}>
              <span className="sc-line-no num">{String(i + 1).padStart(2, "0")}</span>
              <span className="sc-line-dot" aria-hidden="true" />
              <b>{s.title}</b>
              <p>{s.text}</p>
            </li>
          ))}
        </ol>
        {counts ? (
          <p className="sc-proof">
            The case behind this page came off that line: <b className="num">{counts.files}</b> files in <b className="num">{counts.acts}</b> acts, <b className="num">{counts.exhibits}</b> exhibits, a different instance for every team.
          </p>
        ) : null}
      </section>

      <section className="sc-sec" aria-labelledby="worlds-h">
        <h2 id="worlds-h" className="sc-h">
          One engine, four worlds
        </h2>
        <p className="sc-p">The same event can be a tactical operations floor, a living archive, an evidence room or a broadcast intercept station. A theme changes the map, the navigation, the type, the board and the opening — never a rule, a score or an answer.</p>
        <ul className="sc-worlds">
          {THEME_LIST.map((t) => (
            <li key={t.id}>
              <ThemeScope theme={t.id} className="sc-world">
                <span className="sc-world-pic" aria-hidden="true">
                  <MiniUniverse theme={t} />
                </span>
                <span className="sc-world-name" style={{ fontFamily: t.fonts.display }}>
                  {t.name}
                </span>
                <span className="sc-world-tag">{t.tagline}</span>
              </ThemeScope>
            </li>
          ))}
        </ul>
      </section>

      <section className="sc-sec" aria-labelledby="kinds-h">
        <h2 id="kinds-h" className="sc-h">
          What a case can ask of a team
        </h2>
        <ol className="front-ops">
          {FAMILIES.map((f, i) => (
            <li key={f.id}>
              <span className="front-ops-no num" aria-hidden="true">
                {String(i + 1).padStart(2, "0")}
              </span>
              <f.icon className="front-ops-icon" aria-hidden="true" />
              <div>
                <h3>{f.title}</h3>
                <p>{f.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="sc-sec sc-ops" aria-labelledby="ops-h">
        <div>
          <h2 id="ops-h" className="sc-h">
            Then run it
          </h2>
          <p className="sc-p">The Control Room puts every team on the case map: who is working where, which files they are stuck on, what was just solved — live, on a projector, from the same journal that scores the event.</p>
        </div>
        <Link href="/staff/login" className="sc-btn">
          Open the Control Room <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </section>

      <footer className="mt-12 flex flex-wrap items-center justify-between gap-2 font-mono text-[0.65rem] uppercase tracking-[0.14em] text-faint">
        <span>DOSSIER — open-source investigation game engine</span>
        <Link href="/staff/login" className="hover:text-mute">
          Staff
        </Link>
      </footer>
    </div>
  );
}
