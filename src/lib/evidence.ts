import { Camera, FileText, Mic, Package, ScrollText, type LucideIcon } from "lucide-react";

export const EVIDENCE_ICON: Record<string, LucideIcon> = {
  document: FileText,
  photo: Camera,
  testimony: Mic,
  object: Package,
  record: ScrollText,
  audio: Mic,
};
