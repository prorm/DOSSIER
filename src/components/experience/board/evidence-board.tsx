"use client";

import { ArrowRight, Cable, CircleOff, ExternalLink, Gavel, LayoutList, Loader2, Maximize2, Minus, PanelLeftOpen, Pin, PinOff, Plus, Spline, StickyNote, Trash2, Wand2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { useRealtime } from "@/components/dossier/realtime";
import { useMotion } from "@/components/experience/motion";
import { playCue } from "@/components/experience/sound";
import { useTheme } from "@/components/experience/theme-provider";
import { useMaybeUniverse } from "@/components/experience/universe/universe-stage";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { api, ApiError } from "@/lib/api";
import { applyBoardOps, type BoardLayout, type BoardOp } from "@/lib/board";
import { RELATION_VOCAB } from "@/lib/evidence";
import { fitRects, freeSpotRects, labelSpot, overlaps, tidy, type Rect } from "@/lib/experience/board-geometry";
import { boardKind, exhibitStage, isRelation, plausible, RELATION_KINDS, RELATION_STYLE, type BoardKind, type RelationKind } from "@/lib/experience/relations";
import { teamDressing } from "@/lib/experience/variation";
import { nodeHref } from "@/lib/modes";
import { cn } from "@/lib/utils";
import { Decor, ExhibitFace, faceOf } from "./exhibit";
import { RelationPicker, Swatch } from "./relation-picker";
import { chipText, hang, StringEdge, StringLabel, TieDraft, type Pt } from "./strings";

export interface BoardItem {
  id: string; // "ev:<id>" | "sus:<id>" | "loc:<id>" | "tl:<id>"
  kind: "evidence" | "suspect" | "location" | "timeline";
  title: string;
  subtitle: string;
  evidenceKind?: string;
  image?: string | null;
  href?: string;
  isNew?: boolean;
  summary?: string;
}

type View = { tx: number; ty: number; s: number };
type Drag =
  | { type: "pan"; pointerId: number; sx: number; sy: number; tx: number; ty: number }
  | { type: "node"; pointerId: number; id: string; sx: number; sy: number; ox: number; oy: number; moved: boolean };

const NODE_W = 196;
/** Footprints used until the DOM has measured an item (a typical exhibit; a sticky note). */
const EX_H = 118;
const NOTE_W = 172;
const NOTE_H = 116;
const PIN_Y = 9;
const MIN_S = 0.3;
const MAX_S = 2.2;
const uid = () => Math.random().toString(36).slice(2, 10);
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

type SyncState = "saved" | "saving" | "pending" | "offline";
type Picker = { from: string; to: string; x: number; y: number; edit?: { id: string; label: string } };
type Opened = { unlocked: string[]; evidence: string[] };
type SaveResult = { layout: BoardLayout; version: number; opened?: Opened };
/** An open evidence-board deduction the wall can be submitted to. */
export interface TheoryDesk {
  id: string;
  title: string;
  required: number;
  maxUnsupported: number;
}
/** What the wall says back: a theory that opened something, or a review's verdict. Titles fill in as the case file catches up. */
type Verdict = {
  key: number;
  tone: "success" | "partial" | "fail";
  title: string;
  message?: string;
  files: { id: string; title: string | null }[];
  exhibits: { id: string; title: string | null }[];
  source: "mine" | "team" | "review";
};
type ReviewResult = { solved: boolean; feedback: { tone: string; title: string; message?: string }; unlocked: { id: string; title: string }[]; evidence: { id: string; title: string }[] };

/**
 * The evidence board — a signature DOSSIER surface. A wall you stand in front
 * of: exhibits are physical objects with depth, strings are typed (an alibi is
 * not an accusation is not a contradiction), and you tie one by dragging from
 * a pin. Every change is an *operation* applied optimistically here and
 * authoritatively on the server.
 *
 * Geometry works on what the DOM measured (a polaroid is taller than a note):
 * the wall frames itself on arrival, new exhibits land in free space, string
 * labels sit where they cover no exhibit, and Tidy separates anything that
 * overlaps without rearranging the team's work.
 *
 * The board never says which string is right — the server withholds per-link
 * validity on purpose, since telling you would turn the wall into a guessing
 * machine. What it *can* say honestly is when a pairing makes no sense, and
 * when the board, as a whole, cracked something open.
 */
export function EvidenceBoard({ items, initial, fingerprint, desks = [] }: { items: BoardItem[]; initial: { layout: BoardLayout; version: number }; fingerprint: string; desks?: TheoryDesk[] }) {
  const theme = useTheme();
  const router = useRouter();
  const motion = useMotion();
  const universe = useMaybeUniverse();
  const dress = useMemo(() => teamDressing(fingerprint), [fingerprint]);
  const allowed = useMemo(() => new Set(items.map((i) => i.id)), [items]);
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const [server, setServer] = useState(initial);
  const [pending, setPending] = useState<BoardOp[]>([]);
  const [sync, setSync] = useState<SyncState>("saved");
  const layout = useMemo(() => applyBoardOps(server.layout, pending, allowed), [server.layout, pending, allowed]);

  const [view, setView] = useState<View>({ tx: 60, ty: 60, s: 1 });
  const [selected, setSelected] = useState<string | null>(null);
  const [linkFrom, setLinkFrom] = useState<string | null>(null);
  const [dragPos, setDragPos] = useState<{ id: string; x: number; y: number } | null>(null);
  const [draft, setDraft] = useState<{ from: string; to: Pt } | null>(null);
  const [picker, setPicker] = useState<Picker | null>(null);
  const [brk, setBrk] = useState<Verdict | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [tray, setTray] = useState(false);
  const [ready, setReady] = useState(false);
  const [panning, setPanning] = useState(false);
  const [settling, setSettling] = useState(false);
  const [jolt, setJolt] = useState<{ id: string; key: number } | null>(null);
  const [legend, setLegend] = useState(false);
  const [mode, setMode] = useState<"board" | "list">("board");
  const [wallH, setWallH] = useState<number | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const linkDrag = useRef<{ from: string; pointerId: number } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; s: number; cx: number; cy: number; tx: number; ty: number } | null>(null);
  const flushing = useRef(false);
  /** Keys for one-off moments (a verdict, a jolt): a counter, so renders stay pure. */
  const moment = useRef(0);
  const flushed = useRef<Promise<void>>(Promise.resolve());
  /** Once the player pans or zooms, the wall stops re-framing itself on resize. */
  const touched = useRef(false);
  const pendingRef = useRef(pending);
  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  /* ── measured footprints ── */
  const wraps = useRef(new Map<string, HTMLElement>());
  const [sizes, setSizes] = useState<ReadonlyMap<string, { w: number; h: number }>>(() => new Map());
  // Runs after every render on purpose (any card can change size); it converges after one pass.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    let next: Map<string, { w: number; h: number }> | null = null;
    for (const [id, el] of wraps.current) {
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const s = sizes.get(id);
      if (w && h && (!s || s.w !== w || s.h !== h)) (next ??= new Map(sizes)).set(id, { w, h });
    }
    if (next) setSizes(next);
  });
  const wrapRef = useCallback(
    (id: string) => (el: HTMLElement | null) => {
      if (el) wraps.current.set(id, el);
      else wraps.current.delete(id);
    },
    [],
  );

  /* ── persistence ── */
  const push = useCallback((...ops: BoardOp[]) => {
    setPending((p) => [...p, ...ops]);
    setSync("pending");
  }, []);

  const answer = useCallback(
    (opened: Opened | undefined, mine: boolean) => {
      if (!opened || (!opened.unlocked.length && !opened.evidence.length)) return;
      setBrk({ key: ++moment.current, tone: "success", title: "Case break", files: opened.unlocked.map((id) => ({ id, title: null })), exhibits: opened.evidence.map((id) => ({ id, title: null })), source: mine ? "mine" : "team" });
      playCue("unlock", theme.sound);
    },
    [theme.sound],
  );

  const flush = useCallback(async () => {
    if (flushing.current || pendingRef.current.length === 0) return flushed.current;
    flushing.current = true;
    let done = () => {};
    flushed.current = new Promise<void>((r) => (done = r));
    const batch = pendingRef.current.slice(0, 200);
    setSync("saving");
    try {
      const res = await api<SaveResult>("/api/play/board", { body: { ops: batch } });
      setServer({ layout: res.layout, version: res.version });
      setPending((p) => p.slice(batch.length));
      setSync(pendingRef.current.length > batch.length ? "pending" : "saved");
      answer(res.opened, true);
    } catch {
      setSync("offline");
    } finally {
      flushing.current = false;
      done();
    }
  }, [answer]);

  /** Submit the wall to an open deduction: save it, then the same action the file's own page sends. */
  const review = async (desk: TheoryDesk) => {
    setReviewing(true);
    try {
      await flushed.current;
      if (pendingRef.current.length) await flush();
      const r = await api<ReviewResult>("/api/play/action", { body: { nodeId: desk.id, action: { type: "evaluate" } } });
      setBrk({
        key: ++moment.current,
        tone: r.solved ? "success" : r.feedback.tone === "partial" ? "partial" : "fail",
        title: r.feedback.title || (r.solved ? "Theory holds" : "Theory incomplete"),
        message: r.feedback.message,
        files: r.unlocked.map((u) => ({ id: u.id, title: u.title })),
        exhibits: r.evidence.map((e) => ({ id: e.id, title: e.title })),
        source: "review",
      });
      playCue(r.solved ? "unlock" : "deny", theme.sound);
      if (r.solved) setTimeout(() => router.refresh(), 1600);
    } catch (e) {
      setBrk({ key: ++moment.current, tone: "fail", title: "Not reviewed", message: e instanceof ApiError ? e.message : "The review did not go through. Try again.", files: [], exhibits: [], source: "review" });
    } finally {
      setReviewing(false);
    }
  };

  useEffect(() => {
    if (!pending.length) return;
    const t = setTimeout(flush, sync === "offline" ? 4000 : 350);
    return () => clearTimeout(t);
  }, [pending, flush, sync]);

  // Teammates' changes: pull the authoritative board when nothing local is in flight. A teammate's theory that
  // opened something reaches this wall too (the board signal carries what that save opened).
  useRealtime(
    async (m) => {
      const v = Number(m.data?.version ?? 0);
      if (m.type === "board" && v <= server.version) return;
      if (m.type === "board") answer(m.data?.opened as Opened | undefined, false);
      if (pendingRef.current.length) return;
      try {
        setServer(await api<{ layout: BoardLayout; version: number }>("/api/play/board"));
      } catch {
        /* keep local */
      }
    },
    ["board", "reconnected", "team-changed"],
  );
  useEffect(() => {
    if (!brk) return;
    const t = setTimeout(() => setBrk(null), 12000);
    return () => clearTimeout(t);
  }, [brk]);

  useEffect(() => {
    const onBefore = (e: BeforeUnloadEvent) => {
      if (pendingRef.current.length) e.preventDefault();
    };
    window.addEventListener("beforeunload", onBefore);
    return () => window.removeEventListener("beforeunload", onBefore);
  }, []);

  /* ── geometry ── */
  const centerWorld = () => {
    const r = stage.current?.getBoundingClientRect();
    if (!r) return { x: 100, y: 100 };
    return { x: (r.width / 2 - view.tx) / view.s, y: (r.height / 2 - view.ty) / view.s };
  };
  const worldOf = (cx: number, cy: number): Pt => {
    const r = stage.current!.getBoundingClientRect();
    return { x: (cx - r.left - view.tx) / view.s, y: (cy - r.top - view.ty) / view.s };
  };
  const pos = (id: string) => {
    if (dragPos?.id === id) return dragPos;
    if (id.startsWith("note:")) return layout.notes[id] ? { x: layout.notes[id]!.x, y: layout.notes[id]!.y } : null;
    const n = layout.nodes[id];
    return n ? { x: n.x, y: n.y } : null;
  };
  const sizeOf = (id: string) => sizes.get(id) ?? (id.startsWith("note:") ? { w: NOTE_W, h: NOTE_H } : { w: NODE_W, h: EX_H });
  /** Where a string is fastened: the pin. */
  const pinOf = (id: string): Pt | null => {
    const p = pos(id);
    if (!p) return null;
    return id.startsWith("note:") ? { x: p.x + NOTE_W / 2, y: p.y + 10 } : { x: p.x + NODE_W / 2, y: p.y + PIN_Y };
  };

  const placedIds = Object.keys(layout.nodes).filter((id) => allowed.has(id));
  const noteIds = Object.keys(layout.notes);
  // Every footprint on the wall, as measured (re-read each render: a couple of dozen rectangles).
  const rects: (Rect & { id: string; fixed: boolean })[] = [...placedIds, ...noteIds].map((id) => {
    const p = pos(id)!;
    const s = sizeOf(id);
    return { id, x: p.x, y: p.y, w: s.w, h: s.h, fixed: !id.startsWith("note:") && Boolean(layout.nodes[id]?.pinned) };
  });
  const crowded = overlaps(rects, 4);

  const zoomAt = (factor: number, cx?: number, cy?: number) => {
    touched.current = true;
    setView((v) => {
      const r = stage.current?.getBoundingClientRect();
      const px = cx !== undefined && r ? cx - r.left : (r?.width ?? 600) / 2;
      const py = cy !== undefined && r ? cy - r.top : (r?.height ?? 400) / 2;
      const s = clamp(v.s * factor, MIN_S, MAX_S);
      return { s, tx: px - ((px - v.tx) / v.s) * s, ty: py - ((py - v.ty) / v.s) * s };
    });
  };

  const fit = () => {
    const r = stage.current?.getBoundingClientRect();
    if (!r) return;
    const phone = r.width < 640;
    // On a phone the whole wall at 30% is a map nobody can read or tie strings on: stay legible, pan for the rest.
    setView(fitRects({ rects, view: { w: r.width, h: r.height }, min: phone ? 0.42 : MIN_S, max: 1.05, pad: phone ? 48 : 140, inset: { top: 10, bottom: phone ? 10 : 30 } }));
  };
  const fitRef = useRef(fit);
  useEffect(() => {
    fitRef.current = fit;
  });

  // The wall fills the screen below its toolbar.
  useLayoutEffect(() => {
    if (mode !== "board") return;
    const on = () => {
      const el = stage.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top + window.scrollY;
      // Clear the phone tab bar, or a floating dock where the theme navigates with one.
      const below = window.innerWidth < 768 ? 88 : document.querySelector('.shell[data-nav="dock"]') ? 108 : 30;
      setWallH(Math.max(420, Math.round(window.innerHeight - top - below)));
    };
    on();
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, [mode]);

  // Stand the player in front of the whole wall the first time it is on screen, and keep it framed through
  // resizes until they take the controls.
  const framed = useRef(false);
  useEffect(() => {
    if (framed.current || mode !== "board" || !stage.current) return;
    const frameNow = () => {
      if (framed.current) return;
      framed.current = true;
      fitRef.current();
      setReady(true);
    };
    // Frame on real footprints; never keep the wall hidden waiting for one that cannot be measured.
    if ([...placedIds, ...noteIds].every((id) => sizes.has(id))) return frameNow();
    const t = setTimeout(frameNow, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-checked as footprints arrive
  }, [mode, sizes]);
  useEffect(() => {
    const el = stage.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      if (!touched.current && framed.current) fitRef.current();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [mode]);

  const openPicker = (from: string, to: string, cx: number, cy: number, edit?: Picker["edit"]) => {
    const r = stage.current!.getBoundingClientRect();
    const W = Math.min(316, r.width - 16);
    const H = 440;
    setPicker({ from, to, x: clamp(cx - r.left + 10, 8, Math.max(8, r.width - W - 8)), y: clamp(cy - r.top - 20, 8, Math.max(8, r.height - H - 8)), edit });
    setLinkFrom(null);
    setDraft(null);
  };

  /* ── pointer handling ── */
  const onStageDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("[data-picker],[data-chrome]")) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()] as [Pt, Pt];
      pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), s: view.s, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, tx: view.tx, ty: view.ty };
      touched.current = true;
      drag.current = null;
      linkDrag.current = null;
      setDragPos(null);
      setDraft(null);
      return;
    }
    setPicker(null);
    const el = e.target as HTMLElement;
    const nodeEl = el.closest<HTMLElement>("[data-node]");
    const pinEl = el.closest<HTMLElement>("[data-pin]");
    if (nodeEl && pinEl) {
      // Drag from a pin: tie a string.
      const id = nodeEl.dataset.node!;
      linkDrag.current = { from: id, pointerId: e.pointerId };
      setDraft({ from: id, to: worldOf(e.clientX, e.clientY) });
      setSelected(id);
      return;
    }
    if (nodeEl) {
      const id = nodeEl.dataset.node!;
      if (linkFrom && linkFrom !== id) {
        openPicker(linkFrom, id, e.clientX, e.clientY);
        setSelected(id);
        return;
      }
      setSelected(id);
      if (el.closest("a,textarea,input")) return;
      const p = pos(id);
      const pinned = !id.startsWith("note:") && layout.nodes[id]?.pinned;
      if (p && !pinned) drag.current = { type: "node", pointerId: e.pointerId, id, sx: e.clientX, sy: e.clientY, ox: p.x, oy: p.y, moved: false };
      return;
    }
    setSelected(null);
    drag.current = { type: "pan", pointerId: e.pointerId, sx: e.clientX, sy: e.clientY, tx: view.tx, ty: view.ty };
    setPanning(true);
  };

  const frame = useRef(0);
  const onStageMove = (e: React.PointerEvent) => {
    // Parallax: the wall leans a hair toward the pointer (CSS variables, no React render).
    if (motion.effects && stage.current && !drag.current && !linkDrag.current) {
      const r = stage.current.getBoundingClientRect();
      stage.current.style.setProperty("--px", String(clamp((e.clientX - r.left) / r.width - 0.5, -0.5, 0.5) * 2));
      stage.current.style.setProperty("--py", String(clamp((e.clientY - r.top) / r.height - 0.5, -0.5, 0.5) * 2));
    }
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const { clientX, clientY } = e;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      if (pinch.current && pointers.current.size >= 2) {
        const [a, b] = [...pointers.current.values()] as [Pt, Pt];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const p = pinch.current;
        const r = stage.current!.getBoundingClientRect();
        const s = clamp((p.s * d) / Math.max(1, p.d), MIN_S, MAX_S);
        const px = p.cx - r.left;
        const py = p.cy - r.top;
        const mx = (a.x + b.x) / 2 - p.cx;
        const my = (a.y + b.y) / 2 - p.cy;
        setView({ s, tx: px - ((px - p.tx) / p.s) * s + mx, ty: py - ((py - p.ty) / p.s) * s + my });
        return;
      }
      if (linkDrag.current) {
        setDraft({ from: linkDrag.current.from, to: worldOf(clientX, clientY) });
        return;
      }
      const d = drag.current;
      if (!d) return;
      if (d.type === "pan") {
        if (Math.abs(clientX - d.sx) + Math.abs(clientY - d.sy) > 3) touched.current = true;
        setView((v) => ({ ...v, tx: d.tx + clientX - d.sx, ty: d.ty + clientY - d.sy }));
      } else {
        const dx = (clientX - d.sx) / view.s;
        const dy = (clientY - d.sy) / view.s;
        if (Math.abs(dx) + Math.abs(dy) > 2) d.moved = true;
        setDragPos({ id: d.id, x: Math.round(d.ox + dx), y: Math.round(d.oy + dy) });
      }
    });
  };

  const onStageUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (linkDrag.current) {
      const from = linkDrag.current.from;
      linkDrag.current = null;
      const target = document
        .elementsFromPoint(e.clientX, e.clientY)
        .map((n) => (n as HTMLElement).closest<HTMLElement>("[data-node]"))
        .find((n) => n && n.dataset.node !== from);
      if (target) openPicker(from, target.dataset.node!, e.clientX, e.clientY);
      else setDraft(null);
      return;
    }
    const d = drag.current;
    if (d?.type === "node" && d.moved && dragPos?.id === d.id) {
      if (d.id.startsWith("note:")) {
        const n = layout.notes[d.id];
        if (n) push({ op: "note", id: d.id, text: n.text, x: dragPos.x, y: dragPos.y });
      } else push({ op: "place", id: d.id, x: dragPos.x, y: dragPos.y });
      playCue("tick", theme.sound);
    }
    drag.current = null;
    setPanning(false);
    setDragPos(null);
  };

  const onWheel = (e: React.WheelEvent) => {
    zoomAt(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.clientX, e.clientY);
  };

  /* ── keyboard ── */
  const onKey = (e: React.KeyboardEvent) => {
    if ((e.target as HTMLElement).closest("textarea,input,[data-picker]")) return;
    if (e.key === "Escape") {
      setLinkFrom(null);
      setSelected(null);
      setPicker(null);
      setBrk(null);
      return;
    }
    if (e.key === "+" || e.key === "=") return zoomAt(1.15);
    if (e.key === "-") return zoomAt(1 / 1.15);
    if (e.key === "0") return fit();
    if (!selected) return;
    const p = pos(selected);
    const step = e.shiftKey ? 48 : 12;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[e.key] && p) {
      e.preventDefault();
      if (!selected.startsWith("note:") && layout.nodes[selected]?.pinned) return;
      const [dx, dy] = moves[e.key]!;
      if (selected.startsWith("note:")) push({ op: "note", id: selected, text: layout.notes[selected]!.text, x: p.x + dx, y: p.y + dy });
      else push({ op: "place", id: selected, x: p.x + dx, y: p.y + dy });
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      removeItem(selected);
    } else if (e.key.toLowerCase() === "p" && !selected.startsWith("note:")) {
      push({ op: "pin", id: selected, pinned: !layout.nodes[selected]?.pinned });
    } else if (e.key.toLowerCase() === "c") {
      setLinkFrom(selected);
    }
  };

  /* ── actions ── */
  const place = (id: string) => {
    const c = centerWorld();
    push({ op: "place", id, ...freeSpotRects(c.x, c.y, rects, { w: NODE_W, h: EX_H }) });
    setSelected(id);
    setTray(false);
    playCue("tick", theme.sound);
  };
  const addNote = () => {
    const c = centerWorld();
    const id = `note:${uid()}`;
    const spot = freeSpotRects(c.x, c.y, rects, { w: NOTE_W, h: NOTE_H });
    push({ op: "note", id, text: "", x: spot.x, y: spot.y });
    setSelected(id);
  };
  const removeItem = (id: string) => {
    push(id.startsWith("note:") ? { op: "deleteNote", id } : { op: "remove", id });
    setSelected(null);
  };
  /** Separate whatever overlaps, the least distance that does it; fixed exhibits stay put. */
  const tidyUp = () => {
    const moves = tidy(rects);
    if (!moves.size) return;
    setSettling(true);
    window.setTimeout(() => setSettling(false), 700);
    push(...[...moves].map(([id, p]): BoardOp => (id.startsWith("note:") ? { op: "note", id, text: layout.notes[id]?.text ?? "", x: p.x, y: p.y } : { op: "place", id, x: p.x, y: p.y })));
    playCue("confirm", theme.sound);
  };
  const labelOf = (id: string) => (id.startsWith("note:") ? `Note: ${(layout.notes[id]?.text || "empty").slice(0, 24)}` : (byId.get(id)?.title ?? id));
  const kindOf = (id: string): BoardKind => boardKind(id);

  const tie = (from: string, to: string, label: string, editId?: string) => {
    if (editId) push({ op: "unlink", id: editId });
    const linkId = `l-${uid()}`;
    markFresh(linkId);
    push({ op: "link", id: linkId, from, to, label: label.trim().slice(0, 60) });
    playCue("connect", theme.sound);
    setPicker(null);
    setSelected(to);
    setJolt({ id: to, key: ++moment.current });
  };
  useEffect(() => {
    if (!jolt) return;
    const t = setTimeout(() => setJolt(null), 650);
    return () => clearTimeout(t);
  }, [jolt]);

  // Strings you tie animate in; ones already on the wall (or loaded from the server) do not.
  const [fresh, setFresh] = useState<ReadonlySet<string>>(() => new Set());
  const markFresh = (id: string) => {
    setFresh((s) => new Set(s).add(id));
    setTimeout(() => setFresh((s) => (s.has(id) ? new Set([...s].filter((x) => x !== id)) : s)), 1800);
  };

  // Every string that can be drawn (both ends are on the wall), with its structural verdict and a clear spot for its label.
  const chipScale = Math.min(1.5, Math.max(1, (1 / view.s) * 0.75));
  const cords = layout.links.flatMap((link) => {
    const a = pinOf(link.from);
    const b = pinOf(link.to);
    if (!a || !b) return [];
    const fk = kindOf(link.from);
    const tk = kindOf(link.to);
    const kind = isRelation(link.label) ? (link.label.trim().toLowerCase() as RelationKind) : null;
    const verdict = kind ? plausible(kind, fk, tk) : ({ ok: true } as const);
    const g = hang(a, b, verdict.ok ? 1 : 2.4);
    const text = chipText(link.label);
    const chip = { w: (text.length * 6.5 + (verdict.ok ? 22 : 36)) * chipScale, h: 19 * chipScale };
    const spot = labelSpot(g.at, chip, rects).p;
    return [{ link, a, b, fk, tk, ok: verdict.ok, why: verdict.ok ? undefined : verdict.why, spot }];
  });

  const unplaced = items.filter((i) => !(i.id in layout.nodes));
  const stringsOf = (id: string) => layout.links.filter((l) => l.from === id || l.to === id).length;

  const trayList = (
    <div className="space-y-4">
      {(["evidence", "suspect", "location", "timeline"] as const).map((k) => {
        const list = unplaced.filter((i) => i.kind === k);
        if (!list.length && k !== "evidence" && k !== "suspect") return null;
        return (
          <section key={k}>
            <p className="label-mono mb-2">
              {k === "evidence" ? "Exhibits" : k === "suspect" ? "People" : k === "location" ? "Places" : "Timeline"} <span className="text-faint">{list.length}</span>
            </p>
            {list.length === 0 ? (
              <p className="font-mono text-xs text-faint">All on the wall.</p>
            ) : (
              <ul className="space-y-1.5">
                {list.map((i) => (
                  <li key={i.id}>
                    <button type="button" onClick={() => place(i.id)} className="tray-item">
                      <span className="tray-glyph" aria-hidden="true">
                        <Decor face={faceOf(i)} />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[0.8rem]">{i.title}</span>
                      {i.isNew ? <span className="unread-dot" title="Not yet examined"><span className="sr-only">not yet examined</span></span> : null}
                      <Plus className="size-3.5 shrink-0 text-faint" aria-hidden="true" />
                      <span className="sr-only">— pin on the wall</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );

  const syncLabel = sync === "saved" ? "Saved" : sync === "saving" ? "Saving…" : sync === "pending" ? "Unsaved" : "Offline — will retry";
  const syncTone = sync === "saved" ? "bg-signal-green" : sync === "offline" ? "bg-signal-magenta" : "bg-signal-amber";
  const titleOfFile = (id: string) => (universe ? (universe.model.nodes[universe.model.byId.get(id) ?? -1]?.title ?? null) : null);

  return (
    <div className="flex flex-col gap-3" data-testid="evidence-board" data-material={theme.board.material}>
      <div className="board-bar">
        <button type="button" className="chip-btn is-tray" onClick={() => setTray(true)}>
          <PanelLeftOpen className="size-3.5" /> Items <span className="num text-faint">{unplaced.length}</span>
        </button>
        <button type="button" className="chip-btn" onClick={addNote}>
          <StickyNote className="size-3.5" /> Note
        </button>
        <div className="flex items-center rounded-[var(--r-ctl)] border border-line-strong">
          <button type="button" className="icon-btn !h-7 !w-7" onClick={() => zoomAt(1 / 1.2)} aria-label="Zoom out">
            <Minus className="size-3.5" />
          </button>
          <span className="num w-11 text-center text-xs text-mute" aria-live="polite">
            {Math.round(view.s * 100)}%
          </span>
          <button type="button" className="icon-btn !h-7 !w-7" onClick={() => zoomAt(1.2)} aria-label="Zoom in">
            <Plus className="size-3.5" />
          </button>
          <button type="button" className="icon-btn !h-7 !w-7" onClick={() => ((touched.current = false), fit())} aria-label="Fit the wall to the screen" title="Fit the wall (0)">
            <Maximize2 className="size-3.5" />
          </button>
        </div>
        {mode === "board" && crowded ? (
          <button type="button" className="chip-btn is-warn" onClick={tidyUp} title="Separate exhibits that overlap. Fixed exhibits stay where they are.">
            <Wand2 className="size-3.5" /> Tidy <span className="num">{crowded}</span>
          </button>
        ) : null}
        <button type="button" className={cn("chip-btn", legend && "is-primary")} onClick={() => setLegend((v) => !v)} aria-pressed={legend}>
          <Spline className="size-3.5" /> Strings
        </button>
        <button type="button" className={cn("chip-btn", mode === "list" && "is-primary")} onClick={() => setMode(mode === "list" ? "board" : "list")} aria-pressed={mode === "list"}>
          <LayoutList className="size-3.5" /> List view
        </button>
        {desks.map((d) => (
          <button key={d.id} type="button" className="chip-btn is-primary board-desk" onClick={() => void review(d)} disabled={reviewing} title={`Submit this wall to “${d.title}”: it needs ${d.required} supported relationships and tolerates ${d.maxUnsupported} unsupported ones.`}>
            {reviewing ? <Loader2 className="size-3.5 animate-spin" /> : <Gavel className="size-3.5" />} Submit theory <span className="board-desk-file">· {d.title}</span>
          </button>
        ))}
        <span className="ml-auto inline-flex items-center gap-2 font-mono text-[0.65rem] uppercase tracking-[0.12em] text-mute" role="status">
          <span aria-hidden="true" className={cn("size-1.5 rounded-full", syncTone, sync !== "saved" && "animate-pulse-dot")} />
          {syncLabel}
        </span>
      </div>

      {linkFrom ? (
        <div className="flex flex-wrap items-center gap-2 rounded-[var(--r-ctl)] border border-[color-mix(in_srgb,var(--pin)_50%,transparent)] bg-[color-mix(in_srgb,var(--pin)_8%,var(--color-bg))] px-3 py-2">
          <Cable className="size-4" style={{ color: "var(--pin)" }} aria-hidden="true" />
          <span className="font-mono text-xs">
            Tie a string from <strong>{labelOf(linkFrom)}</strong> — tap the other end
          </span>
          <button type="button" className="chip-btn ml-auto" onClick={() => setLinkFrom(null)}>
            <X className="size-3" /> Cancel
          </button>
        </div>
      ) : null}

      {mode === "board" ? (
        // Phones: the wall stays at a legible zoom and runs past the screen on purpose. Say so, and offer the list.
        <p className="board-phone-hint">
          <span>The wall runs past the edges: drag to pan, pinch to zoom.</span>
          <button type="button" className="chip-btn" onClick={() => setMode("list")}>
            <LayoutList className="size-3.5" /> Read it as a list
          </button>
        </p>
      ) : null}

      {mode === "list" ? (
        <BoardListView items={items} layout={layout} labelOf={labelOf} push={push} place={place} tie={(f, t, l) => tie(f, t, l)} />
      ) : (
        <div className="grid gap-3 [&>*]:min-w-0 lg:grid-cols-[236px_minmax(0,1fr)]">
          <aside className="panel board-tray hidden overflow-y-auto p-3 lg:block" style={wallH ? { maxHeight: wallH } : undefined} aria-label="Items not on the wall">
            {trayList}
          </aside>

          <div
            ref={stage}
            role="application"
            aria-roledescription="evidence board"
            aria-label="Evidence board. Drag to pan, pinch or scroll to zoom. Drag from an item's pin to another item to tie a string. Select an item and use arrow keys to move it, P to pin, C to tie string, Delete to remove. A list view is available."
            tabIndex={0}
            onKeyDown={onKey}
            onPointerDown={onStageDown}
            onPointerMove={onStageMove}
            onPointerUp={onStageUp}
            onPointerCancel={onStageUp}
            onWheel={onWheel}
            data-ready={ready}
            className={cn("board-wall", panning ? "cursor-grabbing" : linkFrom || draft ? "cursor-crosshair" : "cursor-grab", settling && "is-settling", brk?.tone === "success" && "is-breaking")}
            style={{ ["--grid" as string]: `${36 * view.s}px`, ["--gx" as string]: `${view.tx}px`, ["--gy" as string]: `${view.ty}px`, ...(wallH ? { height: wallH } : {}) }}
          >
            <div className="board-tilt">
              <div className="board-plane" style={{ transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.s})`, ["--inv" as string]: 1 / view.s }}>
                <svg className="board-strings" width="1" height="1" aria-hidden="true">
                  {cords.map((c) => (
                    <StringEdge key={c.link.id} id={c.link.id} a={c.a} b={c.b} label={c.link.label} sensible={c.ok} fresh={fresh.has(c.link.id)} selected={selected === c.link.from || selected === c.link.to} settle={motion.effects} />
                  ))}
                  {draft
                    ? (() => {
                        const a = pinOf(draft.from);
                        return a ? <TieDraft a={a} b={draft.to} /> : null;
                      })()
                    : null}
                </svg>

                {placedIds.map((id) => {
                  const item = byId.get(id)!;
                  const p = pos(id)!;
                  const pinned = layout.nodes[id]!.pinned;
                  const isSel = selected === id;
                  const stageOf = item.kind === "evidence" || item.kind === "suspect" ? exhibitStage({ isNew: Boolean(item.isNew), strings: stringsOf(id), annotated: Boolean(layout.annotations[id]) }) : null;
                  const lift = stageOf === "anchor" ? 26 : stageOf === "cross-referenced" ? 14 : stageOf === "examined" ? 6 : 0;
                  const rot = (dress.noise(id) - 0.5) * 3.2;
                  return (
                    <div
                      key={id}
                      ref={wrapRef(id)}
                      data-node={id}
                      className={cn("ex-wrap", isSel && "is-selected", dragPos?.id === id && "is-lifted", pinned && "is-pinned", linkFrom && linkFrom !== id && "is-target", jolt?.id === id && "is-jolted")}
                      style={{ left: p.x, top: p.y, width: NODE_W, transform: `translateZ(${dragPos?.id === id ? 64 : lift}px) rotate(${dragPos?.id === id ? 0 : rot}deg)` }}
                    >
                      <button type="button" data-pin className={cn("ex-pinhead", pinned && "is-fixed")} aria-label={`Tie a string from ${item.title}`} tabIndex={-1} />
                      <button type="button" className="ex-hit" onFocus={() => setSelected(id)} aria-pressed={isSel} aria-label={`${item.title}, ${item.subtitle}${stageOf ? `, ${stageOf}` : ""}${pinned ? ", pinned" : ""}`} />
                      <ExhibitFace
                        face={faceOf(item)}
                        title={item.title}
                        subtitle={item.subtitle}
                        stage={stageOf}
                        tag={stageOf && stageOf !== "raw" ? dress.exhibitTag(id) : null}
                        annotation={layout.annotations[id]}
                        flagged={Boolean(item.isNew)}
                      />
                    </div>
                  );
                })}

                {noteIds.map((id) => {
                  const n = layout.notes[id]!;
                  const p = pos(id)!;
                  return (
                    <div key={id} ref={wrapRef(id)} data-node={id} className={cn("note-wrap", selected === id && "is-selected", jolt?.id === id && "is-jolted")} style={{ left: p.x, top: p.y, width: NOTE_W }}>
                      <button type="button" data-pin className="ex-pinhead is-note" aria-label="Tie a string from this note" tabIndex={-1} />
                      <p className="note-grip">Note · drag here</p>
                      <NoteEditor key={n.text} id={id} text={n.text} onCommit={(text) => push({ op: "note", id, text, x: n.x, y: n.y })} onFocus={() => setSelected(id)} />
                    </div>
                  );
                })}

                {/* Labels sit above every exhibit so a string can always be read and re-tied. */}
                {cords.map((c) => (
                  <StringLabel
                    key={c.link.id}
                    at={c.spot}
                    label={c.link.label}
                    fromKind={c.fk}
                    toKind={c.tk}
                    sensible={c.ok}
                    reason={c.why}
                    fresh={fresh.has(c.link.id)}
                    onLabel={(at) => openPicker(c.link.from, c.link.to, at.x, at.y, { id: c.link.id, label: c.link.label })}
                  />
                ))}
              </div>
            </div>

            {placedIds.length === 0 && noteIds.length === 0 ? (
              <div className="pointer-events-none absolute inset-0 grid place-items-center p-6 text-center">
                <div className="board-empty max-w-sm">
                  <p className="font-display text-lg uppercase tracking-[0.1em] text-ink-dim">An empty wall</p>
                  <p className="mt-1 text-sm text-mute">Pin exhibits and people from the tray, then drag from one pin to another to tie them together and say what the string means.</p>
                </div>
              </div>
            ) : null}

            {legend ? <StringKey onClose={() => setLegend(false)} /> : null}

            {brk ? <CaseBreak key={brk.key} brk={brk} fileTitle={titleOfFile} exhibitTitle={(id) => byId.get(`ev:${id}`)?.title ?? null} onClose={() => setBrk(null)} /> : null}

            {picker ? (
              <div data-picker>
                <RelationPicker
                  x={picker.x}
                  y={picker.y}
                  from={labelOf(picker.from)}
                  to={labelOf(picker.to)}
                  fromKind={kindOf(picker.from)}
                  toKind={kindOf(picker.to)}
                  current={picker.edit?.label}
                  onPick={(label) => tie(picker.from, picker.to, label, picker.edit?.id)}
                  onCancel={() => setPicker(null)}
                />
              </div>
            ) : null}

            {selected && !picker ? (
              <div className="board-selbar" data-chrome onPointerDown={(e) => e.stopPropagation()}>
                <span className="max-w-40 truncate px-1.5 font-mono text-[0.7rem] text-ink-dim">{labelOf(selected)}</span>
                {!selected.startsWith("note:") ? (
                  <button type="button" className="chip-btn" onClick={() => push({ op: "pin", id: selected, pinned: !layout.nodes[selected]?.pinned })}>
                    {layout.nodes[selected]?.pinned ? <PinOff className="size-3" /> : <Pin className="size-3" />} {layout.nodes[selected]?.pinned ? "Unfix" : "Fix in place"}
                  </button>
                ) : null}
                <button type="button" className="chip-btn is-primary" onClick={() => setLinkFrom(selected)}>
                  <Cable className="size-3" /> Tie a string
                </button>
                {byId.get(selected)?.href ? (
                  <Link href={byId.get(selected)!.href!} className="chip-btn">
                    <ExternalLink className="size-3" /> Open
                  </Link>
                ) : null}
                {layout.links.some((l) => l.from === selected || l.to === selected) ? (
                  <button type="button" className="chip-btn" onClick={() => layout.links.filter((l) => l.from === selected || l.to === selected).forEach((l) => push({ op: "unlink", id: l.id }))}>
                    <CircleOff className="size-3" /> Cut strings
                  </button>
                ) : null}
                <button type="button" className="chip-btn !text-signal-magenta" onClick={() => removeItem(selected)}>
                  <Trash2 className="size-3" /> Remove
                </button>
              </div>
            ) : null}
          </div>
        </div>
      )}

      <Sheet open={tray} onOpenChange={setTray}>
        <SheetContent side="bottom" className="max-h-[75dvh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Item tray</SheetTitle>
            <SheetDescription>Tap an item to pin it in the middle of the wall.</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-6">{trayList}</div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

/**
 * The wall answering a theory: a case break names what it opened (by title once the case file has
 * caught up); a review that fell short stamps the verdict the deduction returned, in its own words.
 */
function CaseBreak({ brk, fileTitle, exhibitTitle, onClose }: { brk: Verdict; fileTitle: (id: string) => string | null; exhibitTitle: (id: string) => string | null; onClose: () => void }) {
  const files = brk.files.map((f) => ({ id: f.id, title: f.title ?? fileTitle(f.id) }));
  const exhibits = brk.exhibits.map((e) => ({ id: e.id, title: e.title ?? exhibitTitle(e.id) }));
  const first = files[0];
  const opened = files.length + exhibits.length > 0;
  const lede = brk.source === "review" ? (brk.message ?? "") : brk.source === "mine" ? "Your theory holds. The wall opened:" : "Your team's theory holds. The wall opened:";
  return (
    <div className={cn("board-break", `is-${brk.tone}`)} role="status" data-chrome onPointerDown={(e) => e.stopPropagation()}>
      {brk.tone === "success" ? <div className="board-break-flash" aria-hidden="true" /> : null}
      <div className="board-break-card">
        <p className="board-break-stamp">{brk.title}</p>
        {lede ? <p className="board-break-lede">{lede}</p> : null}
        {brk.source === "review" && opened ? <p className="board-break-lede mt-2">It opened:</p> : null}
        <ul className={cn("board-break-list", !opened && "hidden")}>
          {files.map((f) => (
            <li key={`f-${f.id}`}>
              <span className="board-break-kind">File</span>
              <span>{f.title ?? "A sealed file"}</span>
            </li>
          ))}
          {exhibits.map((e) => (
            <li key={`e-${e.id}`}>
              <span className="board-break-kind">Exhibit</span>
              <span>{e.title ?? "A new exhibit"}</span>
            </li>
          ))}
        </ul>
        <div className="board-break-actions">
          {first ? (
            <Link href={nodeHref(first.id)} className="chip-btn is-primary">
              Open the file <ArrowRight className="size-3.5" />
            </Link>
          ) : null}
          {exhibits[0] ? (
            <Link href={`/play/case/evidence/${exhibits[0].id}`} className="chip-btn">
              Examine the exhibit
            </Link>
          ) : null}
          <Link href="/play/map" className="chip-btn">
            See it on the map
          </Link>
          <button type="button" className="chip-btn ml-auto" onClick={onClose} aria-label="Dismiss">
            <X className="size-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

/** What each kind of string asserts — the board's vocabulary, drawn the way the wall draws it. */
function StringKey({ onClose }: { onClose: () => void }) {
  return (
    <div className="board-key panel" data-chrome onPointerDown={(e) => e.stopPropagation()}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="label-mono">What a string says</p>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close the key">
          <X className="size-3.5" />
        </button>
      </div>
      <ul className="grid gap-1.5">
        {RELATION_KINDS.map((k) => (
          <li key={k} className="flex items-center gap-2.5 text-[0.76rem] text-ink-dim">
            <Swatch kind={k} />
            <span>{RELATION_STYLE[k].sentence("A", "B")}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2.5 text-[0.7rem] leading-snug text-faint">Only these are assertions the case can check. Any other label is your own note and is never scored. The wall never tells you which strings are true.</p>
    </div>
  );
}

function NoteEditor({ id, text, onCommit, onFocus }: { id: string; text: string; onCommit: (t: string) => void; onFocus: () => void }) {
  const [v, setV] = useState(text);
  return (
    <Textarea
      aria-label="Note text"
      id={`${id}-text`}
      value={v}
      maxLength={500}
      onChange={(e) => setV(e.target.value)}
      onFocus={onFocus}
      onBlur={() => v !== text && onCommit(v)}
      placeholder="Write a lead…"
      className="note-input"
    />
  );
}

/** Accessible list rendering of the same board model. */
function BoardListView({
  items,
  layout,
  labelOf,
  push,
  place,
  tie,
}: {
  items: BoardItem[];
  layout: BoardLayout;
  labelOf: (id: string) => string;
  push: (...ops: BoardOp[]) => void;
  place: (id: string) => void;
  tie: (from: string, to: string, label: string) => void;
}) {
  const placed = items.filter((i) => i.id in layout.nodes);
  const endpoints = [...placed.map((p) => p.id), ...Object.keys(layout.notes)];
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [label, setLabel] = useState("");
  const selectCls = "h-10 w-full rounded-[var(--r-ctl)] border border-line-strong bg-bg px-2 font-mono text-sm text-ink";
  return (
    <div className="grid gap-4 [&>*]:min-w-0 lg:grid-cols-2">
      <section className="panel p-4" aria-labelledby="bl-items">
        <h2 id="bl-items" className="label-mono mb-3">
          Items
        </h2>
        <ul className="divide-y divide-line">
          {items.map((i) => {
            const on = i.id in layout.nodes;
            return (
              <li key={i.id} className="flex items-center gap-2 py-2">
                <span className="min-w-0 flex-1 truncate font-mono text-sm">{i.title}</span>
                {on ? (
                  <>
                    <button type="button" className="chip-btn" onClick={() => push({ op: "pin", id: i.id, pinned: !layout.nodes[i.id]!.pinned })}>
                      {layout.nodes[i.id]!.pinned ? "Unpin" : "Pin"}
                    </button>
                    <button type="button" className="chip-btn" onClick={() => push({ op: "remove", id: i.id })}>
                      Remove
                    </button>
                  </>
                ) : (
                  <button type="button" className="chip-btn is-primary" onClick={() => place(i.id)}>
                    Place
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </section>
      <section className="panel space-y-3 p-4" aria-labelledby="bl-links">
        <h2 id="bl-links" className="label-mono">
          Strings ({layout.links.length})
        </h2>
        <ul className="divide-y divide-line">
          {layout.links.map((l) => (
            <li key={l.id} className="flex items-center gap-2 py-2 font-mono text-sm">
              <span className="min-w-0 flex-1">
                {labelOf(l.from)} <span className="text-signal-magenta">—</span> {labelOf(l.to)}
                {l.label ? <span className="text-mute"> ({l.label})</span> : null}
              </span>
              <button type="button" className="chip-btn" onClick={() => push({ op: "unlink", id: l.id })}>
                Cut
              </button>
            </li>
          ))}
          {layout.links.length === 0 ? <li className="py-2 font-mono text-xs text-faint">No strings tied yet.</li> : null}
        </ul>
        <form
          className="grid gap-2 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!from || !to || from === to) return;
            tie(from, to, label);
            setLabel("");
          }}
        >
          <label className="label-mono flex flex-col gap-1">
            From
            <select className={selectCls} value={from} onChange={(e) => setFrom(e.target.value)}>
              <option value="">—</option>
              {endpoints.map((id) => (
                <option key={id} value={id}>
                  {labelOf(id)}
                </option>
              ))}
            </select>
          </label>
          <label className="label-mono flex flex-col gap-1">
            To
            <select className={selectCls} value={to} onChange={(e) => setTo(e.target.value)}>
              <option value="">—</option>
              {endpoints.map((id) => (
                <option key={id} value={id}>
                  {labelOf(id)}
                </option>
              ))}
            </select>
          </label>
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Relationship or note" maxLength={60} aria-label="String label" list="relation-vocab" />
          <datalist id="relation-vocab">
            {RELATION_VOCAB.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
          <button type="submit" className="chip-btn is-primary !h-10 justify-center" disabled={!from || !to || from === to}>
            <Cable className="size-4" /> Tie string
          </button>
        </form>
      </section>
    </div>
  );
}
