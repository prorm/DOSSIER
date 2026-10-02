import type { ChallengePrimitive } from "./types";
import { staticAnswer } from "./static-answer";
import { cryptic } from "./cryptic";
import { webInvestigation } from "./web-investigation";
import { sessionState } from "./session-state";
import { audioForensics, fileBundle, imageForensics, pdfForensics } from "./forensics";
import { gitForensics } from "./git-forensics";
import { sqlInvestigation } from "./sql-investigation";
import { networkCapture } from "./network-capture";
import { osintTrail } from "./osint-trail";
import { timeline } from "./timeline";
import { interview } from "./interview";
import { boardDeduction, finalReconstruction, gpsCheckpoint, qrCheckpoint } from "./inquest";

/**
 * The primitive registry. Primitives are trusted code compiled into DOSSIER;
 * a blueprint can only *reference* them by id and pass a config that the
 * primitive's schema validates. To add a plugin, implement ChallengePrimitive
 * and register it here (see README → "Writing custom primitive plugins").
 */
const REGISTRY = new Map<string, ChallengePrimitive>();

export function registerPrimitive(p: ChallengePrimitive) {
  if (!/^[a-z][a-z0-9-]{1,40}$/.test(p.id)) throw new Error(`invalid primitive id "${p.id}"`);
  if (REGISTRY.has(p.id) && REGISTRY.get(p.id) !== p) throw new Error(`primitive "${p.id}" registered twice`);
  REGISTRY.set(p.id, p);
}

for (const p of [
  staticAnswer,
  cryptic,
  webInvestigation,
  sessionState,
  imageForensics,
  audioForensics,
  pdfForensics,
  fileBundle,
  gitForensics,
  sqlInvestigation,
  networkCapture,
  osintTrail,
  timeline,
  interview,
  boardDeduction,
  qrCheckpoint,
  gpsCheckpoint,
  finalReconstruction,
]) registerPrimitive(p as ChallengePrimitive);

export function getPrimitive(id: string): ChallengePrimitive | undefined {
  return REGISTRY.get(id);
}

export function requirePrimitive(id: string): ChallengePrimitive {
  const p = REGISTRY.get(id);
  if (!p) throw new Error(`unknown primitive "${id}"`);
  return p;
}

export function listPrimitives(): ChallengePrimitive[] {
  return [...REGISTRY.values()];
}

/** Serialisable catalogue for Studio and the `challenge_types` table. */
export function primitiveCatalog() {
  return listPrimitives().map((p) => ({
    id: p.id,
    version: p.version,
    family: p.family,
    label: p.label,
    summary: p.summary,
    example: p.example(),
    hasArtifacts: typeof p.artifacts === "function",
    hasSite: typeof p.site === "function",
    hasSql: typeof p.sqlDataset === "function",
    canHarden: typeof p.harden === "function",
  }));
}
