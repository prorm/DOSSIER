/**
 * What kind of object an exhibit is. Pure, so server pages (the case file) and client surfaces
 * (the evidence board) agree on it without either importing the other's module boundary.
 */
export type Skin = "paper" | "polaroid" | "terminal" | "cassette" | "tag";
export type Face = "photo" | "document" | "record" | "log" | "audio" | "message" | "capture" | "repository" | "database" | "testimony" | "object" | "person" | "place" | "clock";

export function faceOf(item: { kind: "evidence" | "suspect" | "location" | "timeline"; evidenceKind?: string }): Face {
  if (item.kind === "suspect") return "person";
  if (item.kind === "location") return "place";
  if (item.kind === "timeline") return "clock";
  const k = item.evidenceKind ?? "document";
  return (["photo", "document", "record", "log", "audio", "message", "capture", "repository", "database", "testimony", "object"].includes(k) ? k : k === "location" ? "place" : "document") as Face;
}

export const SKIN: Record<Face, Skin> = {
  photo: "polaroid",
  person: "polaroid",
  document: "paper",
  record: "paper",
  message: "paper",
  testimony: "paper",
  object: "paper",
  log: "terminal",
  capture: "terminal",
  repository: "terminal",
  database: "terminal",
  audio: "cassette",
  place: "tag",
  clock: "tag",
};
