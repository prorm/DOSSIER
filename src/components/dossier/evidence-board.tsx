"use client";

import {
  Cable,
  CircleOff,
  ExternalLink,
  LayoutList,
  Maximize2,
  Minus,
  Move,
  PanelLeftOpen,
  Pin,
  PinOff,
  Plus,
  StickyNote,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { applyBoardOps, type BoardLayout, type BoardOp } from "@/lib/board";
import { EVIDENCE_ICON } from "@/lib/evidence";
import { cn } from "@/lib/utils";
import { useRealtime } from "./realtime";

export interface BoardItem {
  id: string; // "ev:<id>" | "sus:<id>"
  kind: "evidence" | "suspect";
  title: string;
  subtitle: string;
  evidenceKind?: string;
  image?: string | null;
  href?: string;
}

type View = { tx: number; ty: number; s: number };
type Drag =
  | { type: "pan"; pointerId: number; sx: number; sy: number; tx: number; ty: number }
  | { type: "node"; pointerId: number; id: string; sx: number; sy: number; ox: number; oy: number; moved: boolean };

const NODE_W = 184;
const NODE_H = 92;
const NOTE_W = 168;
const MIN_S = 0.35;
const MAX_S = 2.2;
const uid = () => Math.random().toString(36).slice(2, 10);
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

type SyncState = "saved" | "saving" | "pending" | "offline";

/**
 * The evidence board: a pannable, zoomable corkboard where a team pins exhibits
 * and suspects, ties them with red string, pins sticky notes and keeps private
 * annotations. Every change is an *operation* applied optimistically here and
 * authoritatively on the server (teammates never overwrite each other). A list
 * view carries the same model for keyboard and screen-reader users.
 */
export function EvidenceBoard({ items, initial }: { items: BoardItem[]; initial: { layout: BoardLayout; version: number } }) {
  const allowed = useMemo(() => new Set(items.map((i) => i.id)), [items]);
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const [server, setServer] = useState(initial);
  const [pending, setPending] = useState<BoardOp[]>([]);
  const [sync, setSync] = useState<SyncState>("saved");
  const layout = useMemo(() => applyBoardOps(server.layout, pending, allowed), [server.layout, pending, allowed]);

  const [view, setView] = useState<View>({ tx: 40, ty: 40, s: 1 });
  const [selected, setSelected] = useState<string | null>(null);
  const [linkFrom, setLinkFrom] = useState<string | null>(null);
  const [linkLabel, setLinkLabel] = useState("");
  const [dragPos, setDragPos] = useState<{ id: string; x: number; y: number } | null>(null);
  const [tray, setTray] = useState(false);
  const [panning, setPanning] = useState(false);
  const [mode, setMode] = useState<"board" | "list">("board");
  const stage = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; s: number; cx: number; cy: number; tx: number; ty: number } | null>(null);
  const flushing = useRef(false);
  const pendingRef = useRef(pending);
  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  /* ── persistence ── */
  const push = useCallback((...ops: BoardOp[]) => {
    setPending((p) => [...p, ...ops]);
    setSync("pending");
  }, []);

  const flush = useCallback(async () => {
    if (flushing.current || pendingRef.current.length === 0) return;
    flushing.current = true;
    const batch = pendingRef.current.slice(0, 200);
    setSync("saving");
    try {
      const res = await api<{ layout: BoardLayout; version: number }>("/api/play/inquest/board", { body: { ops: batch } });
      setServer(res);
      setPending((p) => p.slice(batch.length));
      setSync(pendingRef.current.length > batch.length ? "pending" : "saved");
    } catch {
      setSync("offline");
    } finally {
      flushing.current = false;
    }
  }, []);

  useEffect(() => {
    if (!pending.length) return;
    const t = setTimeout(flush, sync === "offline" ? 4000 : 350);
    return () => clearTimeout(t);
  }, [pending, flush, sync]);

  // Teammates' changes: pull the authoritative board when nothing local is in flight.
  useRealtime(
    async (m) => {
      const v = Number(m.data?.version ?? 0);
      if (m.type === "board" && v <= server.version) return;
      if (pendingRef.current.length) return;
      try {
        setServer(await api<{ layout: BoardLayout; version: number }>("/api/play/inquest/board"));
      } catch {
        /* keep local */
      }
    },
    ["board", "reconnected", "team-changed"],
  );

  // Warn before closing the tab with unsaved changes.
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
  const pos = (id: string) => {
    if (dragPos?.id === id) return dragPos;
    if (id.startsWith("note:")) return layout.notes[id] ? { x: layout.notes[id]!.x, y: layout.notes[id]!.y } : null;
    const n = layout.nodes[id];
    return n ? { x: n.x, y: n.y } : null;
  };
  const center = (id: string) => {
    const p = pos(id);
    if (!p) return null;
    return id.startsWith("note:") ? { x: p.x + NOTE_W / 2, y: p.y + 14 } : { x: p.x + NODE_W / 2, y: p.y + 10 };
  };

  const zoomAt = (factor: number, cx?: number, cy?: number) => {
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
    const pts = [...Object.values(layout.nodes), ...Object.values(layout.notes)];
    if (!r || !pts.length) return setView({ tx: 40, ty: 40, s: 1 });
    const minX = Math.min(...pts.map((p) => p.x));
    const minY = Math.min(...pts.map((p) => p.y));
    const maxX = Math.max(...pts.map((p) => p.x + NODE_W));
    const maxY = Math.max(...pts.map((p) => p.y + NODE_H));
    const s = clamp(Math.min(r.width / (maxX - minX + 80), r.height / (maxY - minY + 80)), MIN_S, 1.2);
    setView({ s, tx: (r.width - (maxX - minX) * s) / 2 - minX * s, ty: (r.height - (maxY - minY) * s) / 2 - minY * s });
  };

  /* ── pointer handling ── */
  const onStageDown = (e: React.PointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()] as [{ x: number; y: number }, { x: number; y: number }];
      pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), s: view.s, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, tx: view.tx, ty: view.ty };
      drag.current = null;
      setDragPos(null);
      return;
    }
    const target = (e.target as HTMLElement).closest<HTMLElement>("[data-node]");
    if (target) {
      const id = target.dataset.node!;
      if (linkFrom && linkFrom !== id) {
        push({ op: "link", id: `l-${uid()}`, from: linkFrom, to: id, label: linkLabel.trim().slice(0, 60) });
        setLinkFrom(null);
        setLinkLabel("");
        setSelected(id);
        return;
      }
      setSelected(id);
      if ((e.target as HTMLElement).closest("a,textarea,input")) return;
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
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const { clientX, clientY } = e;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      if (pinch.current && pointers.current.size >= 2) {
        const [a, b] = [...pointers.current.values()] as [{ x: number; y: number }, { x: number; y: number }];
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
      const d = drag.current;
      if (!d) return;
      if (d.type === "pan") setView((v) => ({ ...v, tx: d.tx + clientX - d.sx, ty: d.ty + clientY - d.sy }));
      else {
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
    const d = drag.current;
    if (d?.type === "node" && d.moved && dragPos?.id === d.id) {
      if (d.id.startsWith("note:")) {
        const n = layout.notes[d.id];
        if (n) push({ op: "note", id: d.id, text: n.text, x: dragPos.x, y: dragPos.y });
      } else push({ op: "place", id: d.id, x: dragPos.x, y: dragPos.y });
    }
    drag.current = null;
    setPanning(false);
    setDragPos(null);
  };

  const onWheel = (e: React.WheelEvent) => {
    zoomAt(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.clientX, e.clientY);
  };

  /* ── keyboard for the selected item ── */
  const onKey = (e: React.KeyboardEvent) => {
    if ((e.target as HTMLElement).closest("textarea,input")) return;
    if (e.key === "Escape") {
      setLinkFrom(null);
      setSelected(null);
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
    const n = Object.keys(layout.nodes).length;
    push({ op: "place", id, x: Math.round(c.x - NODE_W / 2 + ((n * 37) % 120) - 60), y: Math.round(c.y - NODE_H / 2 + ((n * 53) % 90) - 45) });
    setSelected(id);
    setTray(false);
  };
  const addNote = () => {
    const c = centerWorld();
    const id = `note:${uid()}`;
    push({ op: "note", id, text: "", x: Math.round(c.x - NOTE_W / 2), y: Math.round(c.y - 40) });
    setSelected(id);
  };
  const removeItem = (id: string) => {
    push(id.startsWith("note:") ? { op: "deleteNote", id } : { op: "remove", id });
    setSelected(null);
  };

  const unplaced = items.filter((i) => !(i.id in layout.nodes));
  const placedIds = Object.keys(layout.nodes).filter((id) => allowed.has(id));
  const labelOf = (id: string) => (id.startsWith("note:") ? `Note: ${(layout.notes[id]?.text || "empty").slice(0, 24)}` : (byId.get(id)?.title ?? id));

  const trayList = (
    <div className="space-y-4">
      {(["evidence", "suspect"] as const).map((k) => {
        const list = unplaced.filter((i) => i.kind === k);
        return (
          <section key={k}>
            <p className="label-mono mb-2">
              {k === "evidence" ? "Exhibits" : "Suspects"} ({list.length})
            </p>
            {list.length === 0 ? (
              <p className="font-mono text-xs text-faint">All on the board.</p>
            ) : (
              <ul className="space-y-1.5">
                {list.map((i) => (
                  <li key={i.id}>
                    <button
                      type="button"
                      onClick={() => place(i.id)}
                      className="pressable flex w-full items-center gap-2 rounded-sm border border-line bg-bg px-2.5 py-2 text-left hover:border-line-strong"
                    >
                      <Plus className="size-3.5 shrink-0 text-signal" aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate font-mono text-xs">{i.title}</span>
                      <span className="sr-only">— place on board</span>
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

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" className="lg:hidden" onClick={() => setTray(true)}>
          <PanelLeftOpen /> Items <span className="num text-faint">{unplaced.length}</span>
        </Button>
        <Button variant="outline" size="sm" onClick={addNote}>
          <StickyNote /> Note
        </Button>
        <div className="flex items-center rounded-sm border border-line">
          <Button variant="ghost" size="icon-sm" onClick={() => zoomAt(1 / 1.2)} aria-label="Zoom out">
            <Minus />
          </Button>
          <span className="num w-12 text-center text-xs text-mute" aria-live="polite">
            {Math.round(view.s * 100)}%
          </span>
          <Button variant="ghost" size="icon-sm" onClick={() => zoomAt(1.2)} aria-label="Zoom in">
            <Plus />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={fit} aria-label="Fit board to screen">
            <Maximize2 />
          </Button>
        </div>
        <Button variant={mode === "list" ? "signal" : "outline"} size="sm" onClick={() => setMode(mode === "list" ? "board" : "list")} aria-pressed={mode === "list"}>
          <LayoutList /> List view
        </Button>
        <span className="ml-auto inline-flex items-center gap-2 font-mono text-[0.65rem] uppercase tracking-[0.12em] text-mute" role="status">
          <span aria-hidden="true" className={cn("size-1.5 rounded-full", syncTone, sync !== "saved" && "animate-pulse-dot")} />
          {syncLabel}
        </span>
      </div>

      {linkFrom ? (
        <div className="flex flex-wrap items-center gap-2 rounded-sm border border-[color-mix(in_srgb,var(--color-signal-magenta)_45%,transparent)] bg-[color-mix(in_srgb,var(--color-signal-magenta)_7%,var(--color-bg))] px-3 py-2">
          <Cable className="size-4 text-signal-magenta" aria-hidden="true" />
          <span className="font-mono text-xs">
            Tie string from <strong>{labelOf(linkFrom)}</strong> → tap another item
          </span>
          <Input value={linkLabel} onChange={(e) => setLinkLabel(e.target.value)} placeholder="label (optional)" maxLength={60} className="h-8 w-44" aria-label="String label" />
          <Button variant="ghost" size="xs" onClick={() => setLinkFrom(null)}>
            <X /> Cancel
          </Button>
        </div>
      ) : null}

      {mode === "list" ? (
        <BoardListView items={items} layout={layout} labelOf={labelOf} push={push} place={place} />
      ) : (
        <div className="grid gap-3 [&>*]:min-w-0 lg:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="panel hidden max-h-[70dvh] overflow-y-auto p-3 lg:block" aria-label="Items not on the board">
            {trayList}
          </aside>

          <div
            ref={stage}
            role="application"
            aria-roledescription="evidence board"
            aria-label="Evidence board. Drag to pan, pinch or scroll to zoom. Select an item and use arrow keys to move it, P to pin, C to tie string, Delete to remove. A list view is available."
            tabIndex={0}
            onKeyDown={onKey}
            onPointerDown={onStageDown}
            onPointerMove={onStageMove}
            onPointerUp={onStageUp}
            onPointerCancel={onStageUp}
            onWheel={onWheel}
            className={cn(
              "grid-bg relative h-[70dvh] min-h-[420px] touch-none overflow-hidden rounded-md border border-line select-none",
              panning ? "cursor-grabbing" : linkFrom ? "cursor-crosshair" : "cursor-grab",
            )}
            style={{ backgroundSize: `${32 * view.s}px ${32 * view.s}px`, backgroundPosition: `${view.tx}px ${view.ty}px` }}
          >
            <div className="absolute top-0 left-0 origin-top-left" style={{ transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.s})` }}>
              {/* Red string */}
              <svg className="pointer-events-none absolute top-0 left-0 overflow-visible" width="1" height="1" aria-hidden="true">
                {layout.links.map((l) => {
                  const a = center(l.from);
                  const b = center(l.to);
                  if (!a || !b) return null;
                  const sag = Math.min(80, Math.hypot(b.x - a.x, b.y - a.y) * 0.15);
                  const mx = (a.x + b.x) / 2;
                  const my = (a.y + b.y) / 2 + sag;
                  return (
                    <g key={l.id}>
                      <path d={`M ${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}`} fill="none" stroke="#000" strokeOpacity={0.45} strokeWidth={4} transform="translate(1.5 3)" />
                      <path d={`M ${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}`} fill="none" stroke="var(--color-signal-magenta)" strokeWidth={2} strokeLinecap="round" />
                      {l.label ? (
                        <text x={mx} y={(a.y + b.y) / 2 + sag / 2 - 6} textAnchor="middle" className="fill-ink font-mono text-[11px]" style={{ paintOrder: "stroke", stroke: "var(--color-bg)", strokeWidth: 4 }}>
                          {l.label}
                        </text>
                      ) : null}
                    </g>
                  );
                })}
              </svg>

              {placedIds.map((id) => {
                const item = byId.get(id)!;
                const p = pos(id)!;
                const pinned = layout.nodes[id]!.pinned;
                const isSel = selected === id;
                const Icon = item.kind === "evidence" ? (EVIDENCE_ICON[item.evidenceKind ?? ""] ?? Move) : undefined;
                return (
                  <div
                    key={id}
                    data-node={id}
                    className={cn(
                      "absolute flex overflow-hidden rounded-sm border bg-surface shadow-[0_14px_30px_-12px_rgba(0,0,0,0.9)] transition-shadow",
                      isSel ? "border-[var(--accent)] shadow-[0_0_0_1px_var(--accent),0_14px_30px_-12px_rgba(0,0,0,0.9)]" : "border-line-strong",
                      linkFrom && linkFrom !== id && "ring-1 ring-signal-magenta/60",
                      dragPos?.id === id && "scale-[1.02] shadow-[0_24px_40px_-12px_rgba(0,0,0,0.95)]",
                    )}
                    style={{ left: p.x, top: p.y, width: NODE_W, minHeight: NODE_H }}
                  >
                    <span aria-hidden="true" className={cn("absolute top-1.5 left-1/2 z-10 size-3 -translate-x-1/2 rounded-full border border-black/40", pinned ? "bg-signal-amber" : "bg-signal-magenta")} />
                    {item.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.image} alt="" className="h-auto w-14 shrink-0 object-cover grayscale-[30%]" draggable={false} />
                    ) : null}
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 flex-col gap-1 p-2.5 pt-4 text-left outline-none"
                      onFocus={() => setSelected(id)}
                      aria-pressed={isSel}
                      aria-label={`${item.title}, ${item.subtitle}${pinned ? ", pinned" : ""}`}
                    >
                      <span className="flex items-center gap-1 font-mono text-[0.58rem] uppercase tracking-[0.12em] text-faint">
                        {Icon ? <Icon className="size-3" aria-hidden="true" /> : null}
                        {item.subtitle}
                      </span>
                      <span className="line-clamp-2 font-mono text-[0.78rem] font-semibold leading-tight text-ink">{item.title}</span>
                      {layout.annotations[id] ? <span className="line-clamp-2 text-[0.7rem] text-signal-amber">✎ {layout.annotations[id]}</span> : null}
                    </button>
                  </div>
                );
              })}

              {Object.entries(layout.notes).map(([id, n]) => {
                const p = pos(id)!;
                return (
                  <div
                    key={id}
                    data-node={id}
                    className={cn(
                      "absolute rounded-xs border bg-[#2a2410] p-2 shadow-[0_14px_30px_-12px_rgba(0,0,0,0.9)] -rotate-1",
                      selected === id ? "border-signal-amber" : "border-[#4a3f14]",
                    )}
                    style={{ left: p.x, top: p.y, width: NOTE_W }}
                  >
                    <p className="mb-1 cursor-move font-mono text-[0.55rem] uppercase tracking-[0.14em] text-signal-amber/70">Note · drag here</p>
                    <NoteEditor key={n.text} id={id} text={n.text} onCommit={(text) => push({ op: "note", id, text, x: n.x, y: n.y })} onFocus={() => setSelected(id)} />
                  </div>
                );
              })}
            </div>

            {placedIds.length === 0 && Object.keys(layout.notes).length === 0 ? (
              <div className="pointer-events-none absolute inset-0 grid place-items-center p-6 text-center">
                <div>
                  <p className="font-mono text-sm uppercase tracking-[0.12em] text-ink-dim">Empty board</p>
                  <p className="mt-1 text-sm text-mute">Place exhibits and suspects from the item tray, then tie them together with string.</p>
                </div>
              </div>
            ) : null}

            {selected ? (
              <div className="absolute right-2 bottom-2 left-2 flex flex-wrap items-center gap-1.5 rounded-sm border border-line-strong bg-raised/95 p-1.5 backdrop-blur sm:left-auto" onPointerDown={(e) => e.stopPropagation()}>
                <span className="max-w-40 truncate px-1.5 font-mono text-[0.7rem] text-ink-dim">{labelOf(selected)}</span>
                {!selected.startsWith("note:") ? (
                  <Button size="xs" variant="ghost" onClick={() => push({ op: "pin", id: selected, pinned: !layout.nodes[selected]?.pinned })}>
                    {layout.nodes[selected]?.pinned ? <PinOff /> : <Pin />} {layout.nodes[selected]?.pinned ? "Unpin" : "Pin"}
                  </Button>
                ) : null}
                <Button size="xs" variant="ghost" onClick={() => setLinkFrom(selected)}>
                  <Cable /> String
                </Button>
                {byId.get(selected)?.href ? (
                  <Button size="xs" variant="ghost" asChild>
                    <Link href={byId.get(selected)!.href!}>
                      <ExternalLink /> Open
                    </Link>
                  </Button>
                ) : null}
                {layout.links.some((l) => l.from === selected || l.to === selected) ? (
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() => layout.links.filter((l) => l.from === selected || l.to === selected).forEach((l) => push({ op: "unlink", id: l.id }))}
                  >
                    <CircleOff /> Cut strings
                  </Button>
                ) : null}
                <Button size="xs" variant="destructive" onClick={() => removeItem(selected)}>
                  <Trash2 /> Remove
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      )}

      <Sheet open={tray} onOpenChange={setTray}>
        <SheetContent side="bottom" className="max-h-[75dvh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Item tray</SheetTitle>
            <SheetDescription>Tap an item to place it at the centre of the board.</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-6">{trayList}</div>
        </SheetContent>
      </Sheet>
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
      className="min-h-16 resize-none border-0 bg-transparent p-0 font-mono text-xs text-[#f3e3a1] shadow-none placeholder:text-[#8a7a3c] focus-visible:shadow-none"
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
}: {
  items: BoardItem[];
  layout: BoardLayout;
  labelOf: (id: string) => string;
  push: (...ops: BoardOp[]) => void;
  place: (id: string) => void;
}) {
  const placed = items.filter((i) => i.id in layout.nodes);
  const endpoints = [...placed.map((p) => p.id), ...Object.keys(layout.notes)];
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [label, setLabel] = useState("");
  const selectCls = "h-10 w-full rounded-sm border border-line-strong bg-bg px-2 font-mono text-sm text-ink";
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
                    <Button size="xs" variant="ghost" onClick={() => push({ op: "pin", id: i.id, pinned: !layout.nodes[i.id]!.pinned })}>
                      {layout.nodes[i.id]!.pinned ? "Unpin" : "Pin"}
                    </Button>
                    <Button size="xs" variant="ghost" onClick={() => push({ op: "remove", id: i.id })}>
                      Remove
                    </Button>
                  </>
                ) : (
                  <Button size="xs" variant="signal" onClick={() => place(i.id)}>
                    Place
                  </Button>
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
              <Button size="xs" variant="ghost" onClick={() => push({ op: "unlink", id: l.id })}>
                Cut
              </Button>
            </li>
          ))}
          {layout.links.length === 0 ? <li className="py-2 font-mono text-xs text-faint">No strings tied yet.</li> : null}
        </ul>
        <form
          className="grid gap-2 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!from || !to || from === to) return;
            push({ op: "link", id: `l-${uid()}`, from, to, label: label.trim() });
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
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label (optional)" maxLength={60} aria-label="String label" />
          <Button type="submit" variant="signal" disabled={!from || !to || from === to}>
            <Cable /> Tie string
          </Button>
        </form>
      </section>
    </div>
  );
}
