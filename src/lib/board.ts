import { z } from "zod";

/**
 * Evidence-board model shared by server (authoritative apply) and client
 * (optimistic apply). Item ids: "ev:<evidenceId>", "sus:<suspectId>", "note:<id>".
 */

const Coord = z.number().finite().min(-5000).max(5000);
const BoardId = z.string().regex(/^[a-z0-9:-]{1,80}$/);

export const BoardOp = z.discriminatedUnion("op", [
  z.object({ op: z.literal("place"), id: BoardId, x: Coord, y: Coord }),
  z.object({ op: z.literal("remove"), id: BoardId }),
  z.object({ op: z.literal("pin"), id: BoardId, pinned: z.boolean() }),
  z.object({ op: z.literal("link"), id: BoardId, from: BoardId, to: BoardId, label: z.string().max(60).default("") }),
  z.object({ op: z.literal("unlink"), id: BoardId }),
  z.object({ op: z.literal("note"), id: BoardId, text: z.string().max(500), x: Coord, y: Coord }),
  z.object({ op: z.literal("deleteNote"), id: BoardId }),
  z.object({ op: z.literal("annotate"), id: BoardId, text: z.string().max(1000) }),
]);
export type BoardOp = z.infer<typeof BoardOp>;

export interface BoardLayout {
  nodes: Record<string, { x: number; y: number; pinned: boolean }>;
  links: { id: string; from: string; to: string; label: string }[];
  notes: Record<string, { text: string; x: number; y: number }>;
  annotations: Record<string, string>;
}

export const EMPTY_BOARD: BoardLayout = { nodes: {}, links: [], notes: {}, annotations: {} };
const LIMITS = { nodes: 150, links: 300, notes: 80 };

/** Board item ids: "ev:<evidenceId>", "sus:<suspectId>", "note:<id>". Pure, unit-tested. */
export function applyBoardOps(layout: BoardLayout, ops: BoardOp[], allowed: Set<string>): BoardLayout {
  const next: BoardLayout = {
    nodes: { ...layout.nodes },
    links: [...layout.links],
    notes: { ...layout.notes },
    annotations: { ...layout.annotations },
  };
  const exists = (id: string) => (id.startsWith("note:") ? id in next.notes : allowed.has(id) && id in next.nodes);
  for (const op of ops) {
    switch (op.op) {
      case "place":
        if (op.id.startsWith("note:")) {
          const n = next.notes[op.id];
          if (n) next.notes[op.id] = { ...n, x: op.x, y: op.y };
        } else if (allowed.has(op.id)) {
          if (!(op.id in next.nodes) && Object.keys(next.nodes).length >= LIMITS.nodes) break;
          next.nodes[op.id] = { x: op.x, y: op.y, pinned: next.nodes[op.id]?.pinned ?? false };
        }
        break;
      case "remove":
        delete next.nodes[op.id];
        next.links = next.links.filter((l) => l.from !== op.id && l.to !== op.id);
        break;
      case "pin":
        if (next.nodes[op.id]) next.nodes[op.id] = { ...next.nodes[op.id]!, pinned: op.pinned };
        break;
      case "link":
        if (op.from === op.to || !exists(op.from) || !exists(op.to)) break;
        if (next.links.length >= LIMITS.links) break;
        if (next.links.some((l) => l.id === op.id || (l.from === op.from && l.to === op.to) || (l.from === op.to && l.to === op.from))) break;
        next.links.push({ id: op.id, from: op.from, to: op.to, label: op.label });
        break;
      case "unlink":
        next.links = next.links.filter((l) => l.id !== op.id);
        break;
      case "note":
        if (!op.id.startsWith("note:")) break;
        if (!(op.id in next.notes) && Object.keys(next.notes).length >= LIMITS.notes) break;
        next.notes[op.id] = { text: op.text, x: op.x, y: op.y };
        break;
      case "deleteNote":
        delete next.notes[op.id];
        next.links = next.links.filter((l) => l.from !== op.id && l.to !== op.id);
        break;
      case "annotate":
        if (!allowed.has(op.id)) break;
        if (op.text) next.annotations[op.id] = op.text;
        else delete next.annotations[op.id];
        break;
    }
  }
  return next;
}

