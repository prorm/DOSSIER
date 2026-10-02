import type { FamilyId } from "../core/blueprint";
import type { ExtractedStory } from "./story";

/**
 * Story → mechanic mapping. A reusable ontology from narrative concepts to the
 * trusted primitives that can express them. The planner uses these weights to
 * choose which mechanics carry which parts of the story; Studio shows them so
 * organisers can see *why* a mechanic was proposed.
 */

export interface MechanicSuggestion {
  concept: string;
  primitive: string;
  family: FamilyId;
  mechanic: string;
  rationale: string;
  evidence: string[];
  weight: number;
}

const ONTOLOGY: Record<string, { primitive: string; family: FamilyId; mechanic: string; rationale: string }[]> = {
  satellite: [
    { primitive: "network-capture", family: "ctf", mechanic: "telemetry beacons in a packet capture", rationale: "Satellites and ground stations talk in telemetry: reassemble it from captured traffic." },
    { primitive: "git-forensics", family: "ctf", mechanic: "control-software repository history", rationale: "Ground-station code and keys live in a repository with history." },
  ],
  radio: [{ primitive: "audio-forensics", family: "forensics", mechanic: "Morse / DTMF / spectrogram recording", rationale: "A transmission becomes a real recording whose channels hide the message." }],
  server: [
    { primitive: "file-forensics", family: "forensics", mechanic: "system and UPS logs with clock skew", rationale: "A wiped machine still leaves logs; timestamps need normalising." },
    { primitive: "git-forensics", family: "ctf", mechanic: "deleted files in history", rationale: "Wiped or 'cleaned' configuration survives in version history." },
  ],
  website: [
    { primitive: "web-investigation", family: "browser", mechanic: "DevTools investigation of a live portal", rationale: "The portal looks ordinary; its headers, storage and source maps do not." },
    { primitive: "session-state", family: "browser", mechanic: "cookie/session clearance replay", rationale: "Restricted records behind synthetic session state." },
  ],
  access: [
    { primitive: "session-state", family: "browser", mechanic: "door-controller export behind clearance", rationale: "Badge swipes are records someone must obtain." },
    { primitive: "sql-investigation", family: "ctf", mechanic: "badge × Wi-Fi × device correlation", rationale: "A badge proves a card, not a person: correlate with devices." },
  ],
  photo: [{ primitive: "image-forensics", family: "forensics", mechanic: "EXIF timestamps / pixels / stego", rationale: "Photos carry time, device and location metadata as well as content." }],
  audio: [{ primitive: "audio-forensics", family: "forensics", mechanic: "channel-split recording", rationale: "Recorded calls and tapes can hide more than speech." }],
  email: [{ primitive: "file-forensics", family: "forensics", mechanic: "e-mail headers in an encrypted archive", rationale: "Headers show routing, references and forwarding the body hides." }],
  document: [{ primitive: "pdf-forensics", family: "forensics", mechanic: "redactions, metadata and attachments", rationale: "Notebooks and reports leak through bad redaction and embedded files." }],
  code: [{ primitive: "git-forensics", family: "ctf", mechanic: "branches, tags, reflog", rationale: "Developers leave traces in history." }],
  database: [{ primitive: "sql-investigation", family: "ctf", mechanic: "per-team generated records", rationale: "Structured records reward joins and time windows." }],
  network: [{ primitive: "network-capture", family: "ctf", mechanic: "DNS/HTTP trace", rationale: "Traffic ties machines to people and places." }],
  missing: [
    { primitive: "osint-trail", family: "osint", mechanic: "public trail across profiles and posts", rationale: "Missing people and their contacts leave public traces." },
    { primitive: "qr-checkpoint", family: "physical", mechanic: "find the place they pointed to", rationale: "Missing-person stories end at a place." },
  ],
  online: [{ primitive: "osint-trail", family: "osint", mechanic: "alias correlation", rationale: "Aliases connect people across sites." }],
  storm: [{ primitive: "timeline", family: "inquest", mechanic: "outage as a time anchor", rationale: "Outages make clocks disagree; the timeline must be rebuilt." }],
  money: [{ primitive: "interview", family: "inquest", mechanic: "motive exposed by evidence", rationale: "Money motives break under the right document." }],
  campus: [
    { primitive: "qr-checkpoint", family: "physical", mechanic: "physical station", rationale: "Campus locations become real checkpoints." },
    { primitive: "gps-checkpoint", family: "physical", mechanic: "geofenced check-in", rationale: "Outdoor locations become geofences on public ground." },
  ],
  cipher: [{ primitive: "cryptic", family: "cryptic", mechanic: "multi-stage cipher", rationale: "Codes and keys become staged puzzles whose answers differ per team." }],
  vehicle: [{ primitive: "sql-investigation", family: "ctf", mechanic: "gate/plate alibis", rationale: "Vehicles give alibis and contradictions." }],
};

export function mapConcepts(ex: ExtractedStory): MechanicSuggestion[] {
  const out: MechanicSuggestion[] = [];
  for (const c of ex.concepts) for (const m of ONTOLOGY[c.concept] ?? []) out.push({ concept: c.concept, ...m, evidence: c.snippets, weight: c.count });
  if (ex.times.length >= 2)
    out.push({ concept: `times (${ex.times.slice(0, 4).join(", ")})`, primitive: "timeline", family: "inquest", mechanic: "multi-clock timeline", rationale: "Explicit times in the story become a reconstruction with skewed clocks.", evidence: ex.times.slice(0, 4), weight: ex.times.length });
  const suspects = ex.story.characters.filter((c) => c.suspect).length;
  if (suspects)
    out.push({ concept: `${suspects} suspects`, primitive: "interview", family: "inquest", mechanic: "deterministic interviews with contradictions", rationale: "Each suspect gets truths, lies and knowledge boundaries.", evidence: ex.story.characters.filter((c) => c.suspect).map((c) => c.name), weight: suspects * 2 });
  if (ex.potentialRedHerrings.length)
    out.push({ concept: "rumours / disputes", primitive: "interview", family: "inquest", mechanic: "falsifiable red herring", rationale: "Plausible false leads, each with evidence that disproves it.", evidence: ex.potentialRedHerrings.slice(0, 3), weight: ex.potentialRedHerrings.length });
  return out.sort((a, b) => b.weight - a.weight);
}

/** Primitive weights per family, from the story's concepts (used by the planner to pick variants). */
export function familyAffinity(sugs: MechanicSuggestion[], family: FamilyId): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of sugs) if (s.family === family) m.set(s.primitive, (m.get(s.primitive) ?? 0) + s.weight);
  return m;
}
