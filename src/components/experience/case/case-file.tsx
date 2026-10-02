import { AlertTriangle, Lock, MapPin } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { LocalTime } from "@/components/dossier/local-time";
import { Markdown } from "@/components/dossier/markdown";
import { ExhibitFace } from "@/components/experience/board/exhibit";
import { faceOf } from "@/lib/experience/exhibit-face";
import { teamDressing } from "@/lib/experience/variation";
import { cn } from "@/lib/utils";

/**
 * The case file, as objects on a table. No cards: every exhibit keeps the
 * silhouette it has on the evidence board (paper, polaroid, terminal, cassette,
 * tag), so a thing you hold here is recognisably the thing you pin there.
 * These are plain server-rendered pieces; the lift on hover is CSS.
 */

export interface LockerItem {
  id: string;
  title: string;
  kind: string;
  summary: string;
  isNew: boolean;
  about: { characters: { id: string; name: string }[]; locations: { id: string; name: string }[] };
}

export function Locker({ items, sealed, fingerprint, nextRelease }: { items: LockerItem[]; sealed: number; fingerprint: string; nextRelease?: ReactNode }) {
  const dress = teamDressing(fingerprint);
  const shownSealed = Math.min(sealed, 8);
  return (
    <div>
      <ul className="locker" aria-label="Exhibits held">
        {items.map((e, i) => (
          <li key={e.id} className="locker-item" style={{ ["--tilt" as string]: `${((dress.noise(e.id) - 0.5) * 3.4).toFixed(2)}deg` }}>
            <Link href={`/play/case/evidence/${e.id}`} aria-label={`Exhibit ${i + 1}: ${e.title}${e.isNew ? " (new)" : ""}`}>
              <ExhibitFace face={faceOf({ kind: "evidence", evidenceKind: e.kind })} title={e.title} subtitle={`Exhibit ${String(i + 1).padStart(2, "0")} · ${e.kind}`} stage={null} tag={dress.exhibitTag(`ev:${e.id}`)} />
              {e.isNew ? <span className="locker-new">New</span> : null}
            </Link>
            {/* The catalogue entry heading: only the archive's list layout shows it (the object already carries the title). */}
            <p className="locker-entry" aria-hidden="true">
              {e.title} <span>{e.kind}</span>
            </p>
            {e.summary ? <p className="locker-cap">{e.summary}</p> : null}
            {e.about.characters.length + e.about.locations.length ? (
              <p className="locker-about">
                {[...e.about.locations.map((l) => l.name), ...e.about.characters.map((c) => c.name)].slice(0, 4).join(" · ")}
              </p>
            ) : null}
          </li>
        ))}
        {Array.from({ length: shownSealed }, (_, i) => (
          <li key={`sealed-${i}`} className="locker-item is-sealed" style={{ ["--tilt" as string]: `${((dress.noise(`seal:${i}`) - 0.5) * 3.4).toFixed(2)}deg` }} aria-hidden={i > 0 ? "true" : undefined}>
            <div className="sealed">
              <Lock className="size-4" aria-hidden="true" />
              <span>Sealed</span>
            </div>
          </li>
        ))}
      </ul>
      {sealed > 0 ? (
        <p className="locker-foot">
          <b className="num">{sealed}</b> exhibit{sealed === 1 ? "" : "s"} still sealed. They open as files are solved and theories hold.
          {nextRelease ? <> Next scheduled release: {nextRelease}.</> : null}
        </p>
      ) : (
        <p className="locker-foot">Every exhibit is in your hands.</p>
      )}
    </div>
  );
}

export interface PersonFile {
  id: string;
  name: string;
  role: string;
  bio: string;
  suspect: boolean;
  relationships: { to: string; kind: string }[];
}

export function People({ people, fingerprint }: { people: PersonFile[]; fingerprint: string }) {
  const dress = teamDressing(fingerprint);
  return (
    <ul className="people">
      {people.map((p, i) => (
        <li key={p.id} className={cn("person", p.suspect && "is-suspect")} id={`person-${p.id}`}>
          <div className="person-photo" style={{ ["--tilt" as string]: `${((dress.noise(p.id) - 0.5) * 4).toFixed(2)}deg` }}>
            <ExhibitFace face="person" title={p.name} subtitle={p.role || (p.suspect ? "person of interest" : "on file")} stage={null} tag={`EX-${String(i + 1).padStart(4, "0")}-P`} />
          </div>
          <div className="person-sheet">
            <p className="person-meta">
              <span className="num">P-{String(i + 1).padStart(2, "0")}</span>
              {p.suspect ? <em>person of interest</em> : <span>witness</span>}
            </p>
            {p.relationships.length ? (
              <ul className="person-ties">
                {p.relationships.map((r, k) => (
                  <li key={k}>
                    <span>{r.kind}</span> <b>{r.to}</b>
                  </li>
                ))}
              </ul>
            ) : null}
            {p.bio ? <Markdown className="text-sm">{p.bio}</Markdown> : <p className="text-sm text-mute">Nothing on file yet.</p>}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function Spine({ items, hidden }: { items: { at: string; title: string; body: string }[]; hidden: number }) {
  return (
    <ol className="spine" aria-label="Timeline, as far as you know it">
      {items.map((t, i) => (
        <li key={i}>
          <time className="num">{t.at}</time>
          <div>
            <p className="spine-title">{t.title}</p>
            {t.body ? <p className="spine-body">{t.body}</p> : null}
          </div>
        </li>
      ))}
      {Array.from({ length: Math.min(hidden, 6) }, (_, i) => (
        <li key={`gap-${i}`} className="is-gap" aria-hidden={i > 0 ? "true" : undefined}>
          <time className="num">▒▒:▒▒</time>
          <div>
            <p className="spine-title">{i === 0 ? `${hidden} moment${hidden === 1 ? "" : "s"} you cannot place yet` : "▒▒▒▒▒▒▒▒"}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function Places({ places, fingerprint }: { places: { id: string; name: string; description: string; visited: boolean }[]; fingerprint: string }) {
  const dress = teamDressing(fingerprint);
  return (
    <ul className="places">
      {places.map((l) => (
        <li key={l.id} style={{ ["--tilt" as string]: `${((dress.noise(l.id) - 0.5) * 3).toFixed(2)}deg` }}>
          <ExhibitFace face="place" title={l.name} subtitle={l.visited ? "visited" : "on file"} stage={null} tag={null} />
          {l.description ? <p className="locker-cap">{l.description}</p> : null}
        </li>
      ))}
      {!places.length ? (
        <li className="text-sm text-mute">
          <MapPin className="mr-1.5 inline size-4" aria-hidden="true" /> No places on file yet.
        </li>
      ) : null}
    </ul>
  );
}

export function Contradictions({ items }: { items: { id: string; label: string; suspect: string }[] }) {
  return (
    <ul className="contra">
      {items.map((c) => (
        <li key={c.id}>
          <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
          <span>
            {c.label} <em>— {c.suspect}</em>
          </span>
          <b>contradicted</b>
        </li>
      ))}
    </ul>
  );
}

/** Where an exhibit came from, in a sentence. */
export function sourceLine(source: string): string {
  if (source.startsWith("node:")) return "from a solved file";
  if (source.startsWith("interview:")) return `from an interview with ${source.slice("interview:".length)}`;
  // Released by the case itself (at the start, or when the story reached it) — not by anything the team solved.
  if (source === "gate") return "issued with the case";
  return source.replace(/[:_-]+/g, " ");
}

export function Obtained({ at }: { at: string }) {
  return <LocalTime iso={at} />;
}
