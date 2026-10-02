import type { ActionResult } from "@/components/dossier/answer-form";

export interface ArtifactLink {
  name: string;
  mime: string;
  description: string;
  url: string;
  /** When the team first retrieved it (null = not yet). */
  obtained?: string | null;
}

export interface StageContext {
  nodeId: string;
  primitive: string;
  /** The primitive's public view (never contains a secret). */
  view: Record<string, unknown> & { kind?: string };
  artifacts: ArtifactLink[];
  site: { url: string; title: string } | null;
  discoveries: string[];
  tools: string[];
  skills: string[];
  checkpoint: { id: string; name: string; location: string; instructions: string; kind: string } | null;
  disabledReason: string | null;
  fingerprint: string;
  /** Held evidence, for interviews and the final reconstruction. */
  evidence: { id: string; title: string }[];
  characters: { id: string; name: string; suspect: boolean; role?: string }[];
  locations: { id: string; name: string }[];
  playtestScanUrl: string | null;
  gpsTarget: { lat: number; lon: number } | null;
  board: { placed: number; strings: number };
  title: string;
}

export type OnResult = (r: ActionResult) => void;

/** Which visual language a node speaks. */
export type StageKind =
  | "crypto"
  | "web"
  | "osint"
  | "forensics"
  | "git"
  | "pcap"
  | "sql"
  | "interview"
  | "timeline"
  | "board"
  | "checkpoint"
  | "gps"
  | "final"
  | "answer";

export function stageOf(primitive: string): StageKind {
  switch (primitive) {
    case "cryptic":
      return "crypto";
    case "web-investigation":
    case "session-state":
      return "web";
    case "osint-trail":
      return "osint";
    case "image-forensics":
    case "audio-forensics":
    case "pdf-forensics":
    case "file-forensics":
      return "forensics";
    case "git-forensics":
      return "git";
    case "network-capture":
      return "pcap";
    case "sql-investigation":
      return "sql";
    case "interview":
      return "interview";
    case "timeline":
      return "timeline";
    case "board-deduction":
      return "board";
    case "qr-checkpoint":
      return "checkpoint";
    case "gps-checkpoint":
      return "gps";
    case "final-reconstruction":
      return "final";
    default:
      return "answer";
  }
}

export const STAGE_TITLE: Record<StageKind, string> = {
  crypto: "Decoding desk",
  web: "Field browser",
  osint: "Public web",
  forensics: "Evidence bench",
  git: "Repository",
  pcap: "Captured incident",
  sql: "Investigation database",
  interview: "Interrogation room",
  timeline: "Temporal reconstruction",
  board: "Deduction desk",
  checkpoint: "Field mission",
  gps: "Field mission",
  final: "Reconstruction room",
  answer: "Answer console",
};
