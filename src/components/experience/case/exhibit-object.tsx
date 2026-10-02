import type { ReactNode } from "react";

import { LocalTime } from "@/components/dossier/local-time";
import { Markdown } from "@/components/dossier/markdown";
import { Decor } from "@/components/experience/board/exhibit";
import { faceOf } from "@/lib/experience/exhibit-face";
import { cn } from "@/lib/utils";

/**
 * An exhibit as the thing itself, lying on the examination table.
 *
 * Every rendering is built from the exhibit's own record — its kind, title,
 * summary, body, when it was obtained and who or where it concerns — never
 * from invented detail. What changes with the kind is the *object*: a document
 * is a clipped sheet with a receipt stamp, machine output is a printout (or a
 * screen, depending on the theme), a photograph is a print with writing on its
 * back, a recording is a tape with its transcript.
 */

export interface ExhibitRecord {
  id: string;
  title: string;
  kind: string;
  summary: string;
  body: string;
  at: string;
  about: { characters: { id: string; name: string }[]; locations: { id: string; name: string }[] };
}

type Form = "sheet" | "printout" | "photo" | "tape";
const FORM: Record<string, Form> = {
  document: "sheet",
  record: "sheet",
  message: "sheet",
  testimony: "sheet",
  object: "sheet",
  log: "printout",
  capture: "printout",
  repository: "printout",
  database: "printout",
  photo: "photo",
  audio: "tape",
};

export function formOf(kind: string): Form {
  return FORM[kind] ?? "sheet";
}

const KIND_LINE: Record<string, string> = {
  document: "Document",
  record: "Record",
  message: "Message",
  testimony: "Statement",
  object: "Physical item",
  log: "System log",
  capture: "Network capture",
  repository: "Repository history",
  database: "Database extract",
  photo: "Photograph",
  audio: "Recording",
};

export function kindLine(kind: string): string {
  return KIND_LINE[kind] ?? kind;
}

function Body({ e, empty = "No transcript for this exhibit." }: { e: ExhibitRecord; empty?: string }) {
  return e.body ? <Markdown className="xo-md">{e.body}</Markdown> : <p className="xo-empty">{empty}</p>;
}

function Stamp({ at }: { at: string }) {
  return (
    <span className="xo-stamp" aria-label="Received">
      <span>Received</span>
      <b>
        <LocalTime iso={at} />
      </b>
    </span>
  );
}

export function ExhibitObject({ e, number, tag, custody }: { e: ExhibitRecord; number: string; tag: string; custody: string }) {
  const form = formOf(e.kind);
  const concerns = [...e.about.characters.map((c) => c.name), ...e.about.locations.map((l) => l.name)];
  if (form === "photo") {
    return (
      <div className="xo-photo-set">
        <figure className="xo xo-photo">
          <div className="xo-img" aria-hidden="true">
            <span className="xo-img-glyph">
              <Decor face="photo" />
            </span>
            <span className="xo-exif">
              {tag} · <LocalTime iso={e.at} />
            </span>
          </div>
          <figcaption className="xo-caption">{e.title}</figcaption>
        </figure>
        {/* The back of the print: what was written on it, and what the print shows. */}
        <div className="xo xo-back">
          <p className="xo-back-head">
            Exhibit {number} · reverse
          </p>
          {e.summary ? <p className="xo-back-lede">{e.summary}</p> : null}
          <Body e={e} empty="Nothing written on the back." />
          {concerns.length ? <p className="xo-back-foot">{concerns.join(" · ")}</p> : null}
        </div>
      </div>
    );
  }
  if (form === "tape") {
    return (
      <article className="xo xo-tape">
        <div className="xo-cassette" aria-hidden="true">
          <span className="xo-cassette-label">
            <b>{e.title}</b>
            <i>
              {tag} · <LocalTime iso={e.at} />
            </i>
          </span>
          <span className="xo-reels">
            <i />
            <i />
          </span>
        </div>
        <div className="xo-transcript">
          <p className="xo-head-line">
            <span>Transcript</span>
            <span>Exhibit {number}</span>
          </p>
          {e.summary ? <p className="xo-summary">{e.summary}</p> : null}
          <Body e={e} />
        </div>
      </article>
    );
  }
  if (form === "printout") {
    return (
      <article className="xo xo-print">
        <header className="xo-print-head">
          <span>{kindLine(e.kind)} export</span>
          <span>
            Exhibit {number} · <LocalTime iso={e.at} />
          </span>
        </header>
        <div className="xo-print-body">
          {e.summary ? <p className="xo-print-sum"># {e.summary}</p> : null}
          <Body e={e} />
        </div>
        <footer className="xo-foot">
          <span>{tag}</span>
          <span>{custody}</span>
        </footer>
      </article>
    );
  }
  return (
    <article className={cn("xo xo-sheet", `xo-k-${e.kind}`)}>
      <span className="xo-clip" aria-hidden="true" />
      <header className="xo-head">
        <span className="xo-no">Exhibit {number}</span>
        <span className="xo-kind">{kindLine(e.kind)}</span>
        <Stamp at={e.at} />
      </header>
      <h2 className="xo-title">{e.title}</h2>
      {e.kind === "testimony" || e.kind === "message" ? concerns.length ? <p className="xo-concerns">Concerning {concerns.join(", ")}</p> : null : null}
      {e.summary ? <p className="xo-summary">{e.summary}</p> : null}
      <div className={cn("xo-body", e.kind === "testimony" && "is-quote")}>
        <Body e={e} />
      </div>
      <footer className="xo-foot">
        <span>{tag}</span>
        <span>{custody}</span>
      </footer>
    </article>
  );
}

/** A small physical silhouette for the contact sheet. */
export function MiniExhibit({ kind, title, active, isNew }: { kind: string; title: string; active?: boolean; isNew?: boolean }): ReactNode {
  return (
    <span className={cn("xo-mini", `is-${formOf(kind)}`, active && "is-active")}>
      <span className="xo-mini-glyph" aria-hidden="true">
        <Decor face={faceOf({ kind: "evidence", evidenceKind: kind })} />
      </span>
      <span className="xo-mini-title">{title}</span>
      {isNew ? <span className="xo-mini-new">new</span> : null}
    </span>
  );
}
