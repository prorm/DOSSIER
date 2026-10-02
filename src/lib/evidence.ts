import { Binary, Camera, Database, FileText, GitBranch, Mail, MapPin, Mic, Package, Radio, ScrollText, TerminalSquare, type LucideIcon } from "lucide-react";

export const EVIDENCE_ICON: Record<string, LucideIcon> = {
  document: FileText,
  photo: Camera,
  testimony: Mic,
  object: Package,
  record: ScrollText,
  audio: Radio,
  log: TerminalSquare,
  capture: Binary,
  repository: GitBranch,
  database: Database,
  message: Mail,
  location: MapPin,
};

/** Relationship vocabulary for evidence-board strings (only these count as assertions). */
export const RELATION_VOCAB = ["implicates", "alibi-for", "places-at", "contradicts", "supports", "owned-by", "sent-to", "motive-for", "precedes", "same-as"] as const;
