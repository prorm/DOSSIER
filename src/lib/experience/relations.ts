/**
 * The evidence board's relationship language.
 *
 * Each relation the case understands has a look (colour, stroke, arrowhead,
 * weight) so a wall of strings reads like an argument, not spaghetti.
 *
 * ANTI-GUESSING: whether a string is *true* is never known to the client – the
 * server deliberately never reveals per-link validity, because that would turn
 * the board into a guessing oracle. What the client can honestly tell you is
 * whether a pairing is *sensible* (a location cannot "send" a message to a
 * timeline entry). That check is purely structural and identical for every
 * case, so it leaks nothing about the truth.
 */

export const RELATION_KINDS = ["implicates", "alibi-for", "places-at", "contradicts", "supports", "owned-by", "sent-to", "motive-for", "precedes", "same-as"] as const;
export type RelationKind = (typeof RELATION_KINDS)[number];

export type BoardKind = "ev" | "sus" | "loc" | "tl" | "note";

export function boardKind(id: string): BoardKind {
  const p = id.split(":", 1)[0];
  return p === "ev" || p === "sus" || p === "loc" || p === "tl" || p === "note" ? p : "note";
}

export function isRelation(label: string): label is RelationKind {
  return (RELATION_KINDS as readonly string[]).includes(label.trim().toLowerCase());
}

export interface RelationStyle {
  kind: RelationKind;
  label: string;
  /** Which signal colour token carries it. */
  tone: "magenta" | "green" | "cyan" | "amber" | "ink";
  dash: string;
  width: number;
  arrow: boolean;
  /** Jagged line (a contradiction is a tear, not a line). */
  jagged?: boolean;
  double?: boolean;
  sentence: (a: string, b: string) => string;
}

export const RELATION_STYLE: Record<RelationKind, RelationStyle> = {
  implicates: { kind: "implicates", label: "implicates", tone: "magenta", dash: "", width: 2.6, arrow: true, sentence: (a, b) => `${a} implicates ${b}` },
  "alibi-for": { kind: "alibi-for", label: "alibi for", tone: "green", dash: "7 5", width: 2, arrow: true, sentence: (a, b) => `${a} gives ${b} an alibi` },
  "places-at": { kind: "places-at", label: "places at", tone: "cyan", dash: "", width: 1.8, arrow: true, sentence: (a, b) => `${a} places them at ${b}` },
  contradicts: { kind: "contradicts", label: "contradicts", tone: "amber", dash: "", width: 2.2, arrow: false, jagged: true, sentence: (a, b) => `${a} contradicts ${b}` },
  supports: { kind: "supports", label: "supports", tone: "green", dash: "", width: 2, arrow: false, sentence: (a, b) => `${a} supports ${b}` },
  "owned-by": { kind: "owned-by", label: "owned by", tone: "cyan", dash: "2 5", width: 2.2, arrow: true, sentence: (a, b) => `${a} is owned by ${b}` },
  "sent-to": { kind: "sent-to", label: "sent to", tone: "cyan", dash: "12 6", width: 2, arrow: true, sentence: (a, b) => `${a} was sent to ${b}` },
  "motive-for": { kind: "motive-for", label: "motive for", tone: "magenta", dash: "2 5", width: 2.4, arrow: true, sentence: (a, b) => `${a} is a motive for ${b}` },
  precedes: { kind: "precedes", label: "precedes", tone: "ink", dash: "", width: 1.8, arrow: true, sentence: (a, b) => `${a} comes before ${b}` },
  "same-as": { kind: "same-as", label: "same as", tone: "ink", dash: "", width: 2, arrow: false, double: true, sentence: (a, b) => `${a} is the same as ${b}` },
};

/** Neutral string: a label outside the vocabulary is the team's own note, not an assertion. */
export const NOTE_STYLE = { tone: "ink" as const, dash: "3 4", width: 1.6, arrow: false };

const ANY: BoardKind[] = ["ev", "sus", "loc", "tl", "note"];
const RULES: Record<RelationKind, { from: BoardKind[]; to: BoardKind[]; why: string }> = {
  implicates: { from: ["ev", "tl", "sus", "note"], to: ["sus", "note"], why: "Only a person can be implicated." },
  "alibi-for": { from: ["ev", "loc", "tl", "sus", "note"], to: ["sus", "note"], why: "An alibi belongs to a person." },
  "places-at": { from: ["sus", "ev", "note"], to: ["loc", "note"], why: "“places at” needs a location on the other end." },
  contradicts: { from: ANY, to: ANY, why: "" },
  supports: { from: ANY, to: ANY, why: "" },
  "owned-by": { from: ["ev", "note"], to: ["sus", "note"], why: "Exhibits are owned by people." },
  "sent-to": { from: ["ev", "note"], to: ["sus", "note"], why: "Messages are sent to people." },
  "motive-for": { from: ["ev", "sus", "note"], to: ["sus", "note"], why: "A motive points at a person." },
  precedes: { from: ["tl", "ev", "note"], to: ["tl", "ev", "note"], why: "“precedes” orders events and exhibits in time." },
  "same-as": { from: ANY, to: ANY, why: "" },
};

export function plausible(kind: RelationKind, from: BoardKind, to: BoardKind): { ok: true } | { ok: false; why: string } {
  const r = RULES[kind];
  if (r.from.includes(from) && r.to.includes(to)) {
    if (kind === "same-as" && from !== to && from !== "note" && to !== "note") return { ok: false, why: "“same as” joins two things of the same kind." };
    return { ok: true };
  }
  return { ok: false, why: r.why || "That pairing doesn't make sense." };
}

/** Relations that make sense for a pair, most useful first – drives the picker. */
export function suggestRelations(from: BoardKind, to: BoardKind): RelationKind[] {
  return RELATION_KINDS.filter((k) => plausible(k, from, to).ok);
}

/* ─────────────────────────── Evidence maturity ─────────────────────────── */

export type ExhibitStage = "raw" | "examined" | "cross-referenced" | "anchor";

/**
 * How far an exhibit has "matured" on this team's board – real state, shown as
 * physical change: unread evidence looks raw, opened evidence gets its tag,
 * connected evidence is catalogued, evidence that carries an argument is an anchor.
 */
export function exhibitStage(s: { isNew: boolean; strings: number; annotated: boolean }): ExhibitStage {
  if (s.isNew) return "raw";
  if (s.strings >= 3 || (s.strings >= 1 && s.annotated)) return "anchor";
  if (s.strings >= 1) return "cross-referenced";
  return "examined";
}

export const STAGE_LABEL: Record<ExhibitStage, string> = {
  raw: "unread",
  examined: "examined",
  "cross-referenced": "cross-referenced",
  anchor: "anchor",
};
