"use client";

import { SKIN, type Face } from "@/lib/experience/exhibit-face";
import { STAGE_LABEL, type ExhibitStage } from "@/lib/experience/relations";
import { cn } from "@/lib/utils";

/**
 * Exhibits are physical objects on the wall, not rectangles with titles.
 * Five skins carry the silhouette (paper, polaroid, terminal, cassette, tag);
 * a small drawing says what the thing *is*; the maturity stage — how much the
 * team has actually worked with it — changes how it looks.
 */
export { faceOf, SKIN, type Face, type Skin } from "@/lib/experience/exhibit-face";

const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "round", strokeLinejoin: "round" } as const;

/** A tiny drawing of the thing. */
export function Decor({ face }: { face: Face }) {
  switch (face) {
    case "photo":
      return (
        <svg viewBox="0 0 64 44" {...stroke} aria-hidden="true">
          <rect x="3" y="3" width="58" height="38" rx="2" />
          <path d="M3 32 L20 18 L32 28 L42 20 L61 34" />
          <circle cx="47" cy="12" r="4" />
        </svg>
      );
    case "person":
      return (
        <svg viewBox="0 0 64 56" {...stroke} aria-hidden="true">
          <circle cx="32" cy="20" r="11" />
          <path d="M10 54 C12 38 22 34 32 34 C42 34 52 38 54 54" />
          <path d="M22 20 h20" strokeDasharray="2 3" />
        </svg>
      );
    case "record":
      return (
        <svg viewBox="0 0 64 44" {...stroke} aria-hidden="true">
          <rect x="4" y="4" width="56" height="36" rx="2" />
          <path d="M4 14 H60 M22 4 V40 M40 4 V40 M4 24 H60 M4 32 H60" />
        </svg>
      );
    case "log":
      return (
        <svg viewBox="0 0 64 44" {...stroke} aria-hidden="true">
          <rect x="3" y="3" width="58" height="38" rx="2" />
          <path d="M9 13 l6 4 -6 4 M20 21 h14 M9 30 h30 M9 36 h20" />
        </svg>
      );
    case "audio":
      return (
        <svg viewBox="0 0 64 44" {...stroke} aria-hidden="true">
          <rect x="3" y="5" width="58" height="34" rx="4" />
          <circle cx="20" cy="22" r="7" />
          <circle cx="44" cy="22" r="7" />
          <path d="M14 34 h36" />
        </svg>
      );
    case "message":
      return (
        <svg viewBox="0 0 64 44" {...stroke} aria-hidden="true">
          <rect x="4" y="7" width="56" height="32" rx="2" />
          <path d="M4 9 L32 27 L60 9" />
        </svg>
      );
    case "capture":
      return (
        <svg viewBox="0 0 64 44" {...stroke} aria-hidden="true">
          <path d="M6 38 V26 M14 38 V14 M22 38 V30 M30 38 V8 M38 38 V22 M46 38 V32 M54 38 V18" strokeWidth="3.2" />
          <path d="M3 40 H61" />
        </svg>
      );
    case "repository":
      return (
        <svg viewBox="0 0 64 44" {...stroke} aria-hidden="true">
          <circle cx="14" cy="8" r="4" />
          <circle cx="14" cy="36" r="4" />
          <circle cx="46" cy="16" r="4" />
          <path d="M14 12 V32 M14 26 C14 20 46 26 46 20" />
        </svg>
      );
    case "database":
      return (
        <svg viewBox="0 0 64 44" {...stroke} aria-hidden="true">
          <ellipse cx="32" cy="8" rx="20" ry="5" />
          <path d="M12 8 V34 C12 37 21 40 32 40 C43 40 52 37 52 34 V8 M12 21 C12 24 21 27 32 27 C43 27 52 24 52 21" />
        </svg>
      );
    case "testimony":
      return (
        <svg viewBox="0 0 64 44" {...stroke} aria-hidden="true">
          <path d="M8 26 C8 16 14 10 22 10 M22 26 C22 16 28 10 36 10" />
          <path d="M8 26 h10 v10 h-10 z M22 26 h10 v10 h-10 z" />
          <path d="M44 14 h14 M44 22 h14 M44 30 h10" />
        </svg>
      );
    case "object":
      return (
        <svg viewBox="0 0 64 44" {...stroke} aria-hidden="true">
          <path d="M14 6 H50 L54 40 H10 Z" />
          <path d="M14 6 C14 12 50 12 50 6" />
          <path d="M24 24 h16" strokeDasharray="2 3" />
        </svg>
      );
    case "place":
      return (
        <svg viewBox="0 0 64 44" {...stroke} aria-hidden="true">
          <path d="M32 40 C22 28 18 22 18 16 A14 14 0 0 1 46 16 C46 22 42 28 32 40 Z" />
          <circle cx="32" cy="16" r="5" />
        </svg>
      );
    case "clock":
      return (
        <svg viewBox="0 0 64 44" {...stroke} aria-hidden="true">
          <circle cx="32" cy="22" r="17" />
          <path d="M32 10 V22 L41 27" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 64 44" {...stroke} aria-hidden="true">
          <path d="M14 4 H42 L54 16 V40 H14 Z M42 4 V16 H54" />
          <path d="M22 24 h24 M22 31 h24" />
        </svg>
      );
  }
}

export function ExhibitFace({
  face,
  title,
  subtitle,
  stage,
  tag,
  annotation,
  flagged,
}: {
  face: Face;
  title: string;
  subtitle: string;
  stage: ExhibitStage | null;
  tag: string | null;
  annotation?: string;
  flagged?: boolean;
}) {
  const skin = SKIN[face];
  return (
    <div className={cn("ex", `ex-${skin}`, `ex-face-${face}`, stage && `st-${stage}`, flagged && "is-flagged")}>
      <div className="ex-decor">
        <Decor face={face} />
        {face === "person" ? <i className="ex-idno">{tag?.replace("EX-", "P-") ?? "P-0000"}</i> : null}
      </div>
      <div className="ex-body">
        <span className="ex-kind">{subtitle}</span>
        <span className="ex-title">{title}</span>
        {annotation ? <span className="ex-note">✎ {annotation}</span> : null}
      </div>
      {stage ? (
        <div className="ex-foot">
          <span>{tag}</span>
          <span className="ex-stage">{STAGE_LABEL[stage]}</span>
        </div>
      ) : null}
    </div>
  );
}
