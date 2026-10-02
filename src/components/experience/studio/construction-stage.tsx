"use client";

import { ChevronsDownUp, ChevronsUpDown, Play, ScanLine } from "lucide-react";
import { useMemo, type ReactNode } from "react";

import { ThemeScope } from "@/components/experience/theme-provider";
import { UniverseBackdrop, UniverseProvider } from "@/components/experience/universe/universe-stage";
import { authorUniverse, type AuthorInput } from "@/lib/experience/author";
import { getTheme, type ThemeId } from "@/lib/experience/themes";
import type { UNode } from "@/lib/experience/universe";
import { fingerprintOf, prng } from "@/lib/experience/variation";
import type { Station, StationId } from "@/lib/experience/pipeline";
import { cn } from "@/lib/utils";
import { BuildTheatre, type TheatreState, type WorldSummary } from "./build-theatre";
import type { Replay } from "./use-build-replay";

export interface StoryForWeb {
  characters: { id: string; name: string; suspect: boolean; relationships: { to: string; kind: string }[] }[];
  locations: { id: string; name: string }[];
}

/**
 * The stage: the organiser's case universe, built from the real draft.
 *
 *   no story      an empty, waiting grid
 *   story only    the story's own web: the people, places and relationships the importer found
 *   a blueprint   the challenge graph in the same spatial language players will explore
 *
 * While a recorded build replays, files come into being in dependency order as the
 * playhead crosses the stage that created them. While the server works, the stage
 * says so – and only that: no percentage exists to show.
 */
export function ConstructionStage({
  eventId,
  graph,
  critical,
  story,
  theme,
  accent,
  busy,
  replay,
  expanded,
  onToggle,
  onReplay,
  inspector,
  hint,
  receipt,
  theatre = "off",
  onTheatreClose,
  world = null,
  stations = [],
  onStation,
}: {
  eventId: string;
  graph: AuthorInput | null;
  critical: string[];
  story: StoryForWeb | null;
  theme: ThemeId;
  accent: string;
  busy: string | null;
  replay: Replay;
  expanded: boolean;
  onToggle: () => void;
  onReplay: (() => void) | null;
  inspector: (n: UNode) => ReactNode;
  hint?: string;
  /** The build receipt: lies over the stage on wide screens, under it on narrow ones. */
  receipt?: ReactNode;
  /** Full-screen build theatre: while a build replays, and the world it made afterwards. */
  theatre?: TheatreState;
  onTheatreClose?: () => void;
  world?: WorldSummary | null;
  stations?: Station[];
  onStation?: (id: StationId) => void;
}) {
  const au = useMemo(() => (graph && graph.nodes.length ? authorUniverse(graph) : null), [graph]);
  // A build in flight: the engine has the request and has not answered yet.
  const pending = theatre === "building" && Boolean(busy) && !replay.playing;
  const inTheatre = theatre !== "off" && (Boolean(au) || pending);
  const open = expanded || inTheatre;
  const def = getTheme(theme);
  const generating = replay.playing && replay.trace?.kind === "generate";
  const files = au ? au.order.length : 0;
  // While the files are still coming into being, the readout counts exactly as many as exist.
  const shown = generating ? replay.count : files;
  const depth = au ? Math.max(...au.bands.map((b) => b.depth)) : 0;
  const stage = replay.playing && replay.trace ? replay.trace.stages[replay.running] : null;
  // The critical path lights up when the playhead reaches the stage that wired the graph.
  const wireAt = replay.trace?.stages.findIndex((s) => s.id === "wire") ?? -1;
  const pathOn = !generating || (wireAt >= 0 && Math.max(replay.running, replay.done) >= wireAt);

  return (
    <div className={cn("cs-wrap", open ? "is-expanded" : "is-mini", inTheatre && "is-theatre")}>
    <ThemeScope theme={theme} accent={accent} className={cn("cs", open ? "is-expanded" : "is-mini")}>
      <div className="cs-frame" data-busy={busy ? "true" : "false"}>
        {/* The mini strip is a readout only: no GL context is held for a 76px band. */}
        {au && open ? (
          <UniverseProvider input={au.input} fingerprint={fingerprintOf(eventId)} layoutSeed={`${eventId}:author`} mode="author" posture="overview" accent={accent}>
            <UniverseBackdrop hud labels={false} legend={false} intro={false} path={pathOn ? critical : []} revealRef={replay.revealRef} inspector={inspector} />
            {inTheatre ? <BuildTheatre state={theatre} pending={pending} replay={replay} au={au} stations={stations} world={world} onClose={() => onTheatreClose?.()} onStation={(id) => onStation?.(id)} /> : null}
          </UniverseProvider>
        ) : open ? (
          <>
            <EmptyStage story={story} hint={inTheatre ? "" : hint} />
            {inTheatre ? <BuildTheatre state={theatre} pending={pending} replay={replay} au={null} stations={stations} world={null} onClose={() => onTheatreClose?.()} onStation={(id) => onStation?.(id)} /> : null}
          </>
        ) : null}

        <div className="cs-readout" aria-live="polite">
          <p className="cs-eyebrow">
            <ScanLine className="size-3.5" aria-hidden="true" /> {def.name} <span>·</span> case universe
          </p>
          {au ? (
            <p className="cs-count">
              <b className="num">{shown}</b> / <span className="num">{files}</span> files
              <span className="cs-dim"> · {graph!.rounds.length} rounds · depth {depth}</span>
            </p>
          ) : story ? (
            <p className="cs-count">
              <b className="num">{story.characters.length}</b> people <span className="cs-dim">· {story.locations.length} places · no world built yet</span>
            </p>
          ) : (
            <p className="cs-count cs-dim">Nothing built yet</p>
          )}
          {stage ? <p className="cs-stage">{stage.label}…</p> : busy ? <p className="cs-stage">{busy}…</p> : null}
          <div className="cs-tools">
          {onReplay && !replay.playing ? (
            <button type="button" className="cs-btn" onClick={onReplay} title="Watch the last build again">
              <Play className="size-3.5" aria-hidden="true" /> Replay build
            </button>
          ) : null}
          {replay.playing ? (
            <button type="button" className="cs-btn" onClick={replay.skip}>
              Skip
            </button>
          ) : null}
          <button type="button" className="cs-btn is-icon" onClick={onToggle} aria-label={expanded ? "Shrink the universe" : "Expand the universe"} aria-pressed={expanded}>
            {expanded ? <ChevronsDownUp className="size-4" aria-hidden="true" /> : <ChevronsUpDown className="size-4" aria-hidden="true" />}
          </button>
          </div>
        </div>

        {busy ? <div className="cs-scan" aria-hidden="true" /> : null}
        {au ? (
          <ul className="cs-key" aria-label="Legend">
            <li className="is-path">
              <i /> critical path
            </li>
            <li className="is-odd">
              <i /> red herring or problem
            </li>
            <li className="is-fact">
              <i /> fact flow
            </li>
          </ul>
        ) : null}
      </div>
    </ThemeScope>
    {receipt}
    </div>
  );
}

/** Before there is a world: a waiting grid, or the story's own web of people and places. */
function EmptyStage({ story, hint }: { story: StoryForWeb | null; hint?: string }) {
  return (
    <div className="cs-empty">
      <div className="cs-grid" aria-hidden="true" />
      {story ? <StoryWeb story={story} /> : null}
      {hint === "" ? null : <p className="cs-hint">{hint !== undefined ? hint : (story ? "This is your story as the importer read it. Choose rounds and build the world." : "Drop in a story to begin.")}</p>}
    </div>
  );
}

function StoryWeb({ story }: { story: StoryForWeb }) {
  const pts = useMemo(() => {
    const r = prng(story.characters.map((c) => c.id).join("|") + story.locations.map((l) => l.id).join("|"));
    const W = 1000;
    const H = 420;
    const cx = W / 2;
    const cy = H / 2 + 6;
    const out = new Map<string, { x: number; y: number; name: string; kind: "person" | "place"; suspect: boolean; i: number }>();
    const n = Math.max(1, story.characters.length);
    story.characters.forEach((c, i) => {
      const a = (i / n) * Math.PI * 2 - Math.PI / 2 + (r() - 0.5) * 0.12;
      out.set(c.id, { x: cx + Math.cos(a) * 350 * (0.92 + r() * 0.12), y: cy + Math.sin(a) * 158 * (0.92 + r() * 0.12), name: c.name, kind: "person", suspect: c.suspect, i });
    });
    const m = Math.max(1, story.locations.length);
    story.locations.forEach((l, i) => {
      const a = (i / m) * Math.PI * 2 + 0.4 + (r() - 0.5) * 0.2;
      out.set(l.id, { x: cx + Math.cos(a) * 150 * (0.85 + r() * 0.25), y: cy + Math.sin(a) * 70 * (0.85 + r() * 0.25), name: l.name, kind: "place", suspect: false, i: n + i });
    });
    const links: { a: string; b: string; kind: string; i: number }[] = [];
    story.characters.forEach((c) => c.relationships.forEach((rel) => out.has(rel.to) && links.push({ a: c.id, b: rel.to, kind: rel.kind, i: links.length })));
    return { out, links };
  }, [story]);
  return (
    <svg className="cs-web" viewBox="0 0 1000 420" preserveAspectRatio="xMidYMid meet" role="img" aria-label={`Story web: ${story.characters.length} people, ${story.locations.length} places`}>
      {pts.links.map((l) => {
        const a = pts.out.get(l.a)!;
        const b = pts.out.get(l.b)!;
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2 + (a.x < b.x ? -22 : 22);
        return <path key={`${l.a}-${l.b}-${l.i}`} d={`M${a.x},${a.y} Q${mx},${my} ${b.x},${b.y}`} className="cs-web-link" style={{ animationDelay: `${120 + l.i * 45}ms` }} />;
      })}
      {[...pts.out.entries()].map(([id, p]) => (
        <g key={id} className={cn("cs-web-pt", p.kind === "place" && "is-place", p.suspect && "is-suspect")} transform={`translate(${p.x} ${p.y})`} style={{ animationDelay: `${p.i * 40}ms` }}>
          {p.kind === "place" ? <rect x={-5} y={-5} width={10} height={10} transform="rotate(45)" /> : <circle r={p.suspect ? 6 : 4.5} />}
          <text y={p.kind === "place" ? 20 : p.y < 210 ? -13 : 20} textAnchor="middle">
            {p.name.length > 22 ? `${p.name.slice(0, 21)}…` : p.name}
          </text>
        </g>
      ))}
    </svg>
  );
}
