"use client";

import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Bot,
  CheckCircle2,
  CircleAlert,
  CircleX,
  FileUp,
  Flame,
  GripVertical,
  Loader2,
  Play,
  Plus,
  Rocket,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
  Wand2,
  XCircle,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useRef, useState, useSyncExternalStore } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { api, ApiError } from "@/lib/api";
import type { TheatreState, WorldSummary } from "@/components/experience/studio/build-theatre";
import { ConstructionStage } from "@/components/experience/studio/construction-stage";
import { PipelineRail } from "@/components/experience/studio/pipeline-rail";
import { PresentationTab, type PresentationFacts, type PresentationForm } from "@/components/experience/studio/presentation-tab";
import { Receipt, type Traces } from "@/components/experience/studio/receipt";
import { useBuildReplay, type Replay } from "@/components/experience/studio/use-build-replay";
import type { AuthorInput } from "@/lib/experience/author";
import { currentStation, type BuildTrace, type Station, type StationId } from "@/lib/experience/pipeline";
import { SAMPLE_STORY } from "@/lib/experience/sample-story";
import type { ThemeId } from "@/lib/experience/themes";
import { FAMILY_LABEL, TIER_LABEL } from "@/lib/modes";
import { cn } from "@/lib/utils";
import { tierFor, CURVES, TIERS, type Curve, type Tier } from "@/server/game/core/difficulty";
import { LocalTime } from "./local-time";
import { MetaForm, type StudioMetaForm } from "./studio-setup";
import { CurveChart, DifficultyBars, StudioGraph, type GraphEdge, type GraphNode } from "./studio-graph";

/* ─────────────────────────── types mirrored from server/game/studio.ts ─────────────────────────── */

type Family = "cryptic" | "browser" | "forensics" | "ctf" | "osint" | "inquest" | "physical" | "final" | "custom";

interface Story {
  title: string;
  codename: string;
  premise: string;
  briefing: string;
  characters: { id: string; name: string; role: string; bio: string; suspect: boolean; traits: string[]; relationships: { to: string; kind: string }[] }[];
  organizations: { id: string; name: string; description: string }[];
  locations: { id: string; name: string; description: string; geo?: { lat: number; lon: number } }[];
  artifacts: { id: string; name: string; kind: string; description: string }[];
  timeline: { id: string; at: string; title: string; body: string; actors: string[]; location?: string; public: boolean; requiresEvidence?: string }[];
  motives: { character: string; text: string }[];
  truth: { culprit?: string; motive: string; method: string; location?: string; time: string; keyEvidence: string[]; explanation: string };
}

interface NodeDef {
  id: string;
  round: string;
  title: string;
  primitive: string;
  briefing: string;
  config: Record<string, unknown>;
  gate?: unknown;
  scoring: { points: number };
  hints: { level: string; cost?: number; text: string }[];
  rewards: { evidence: string[] };
  estimatedMinutes: number;
  optional: boolean;
}

interface Issue {
  check: string;
  severity: "error" | "warning";
  node?: string;
  message: string;
}

export interface StudioViewT {
  /** Another event that is live right now; going live would replace it. */
  otherActive: string | null;
  event: { id: string; name: string; kind: string; status: string; active: boolean; version: number; publishedAt: string | null };
  /** The seven stations of the production line, derived server-side from the draft's real state. */
  pipeline: Station[];
  /** Receipts of the last build / playtest / publish. */
  trace: Traces;
  draft: {
    presentation: PresentationForm;
    meta: StudioMetaForm;
    sources: { name: string; markdown: string }[];
    extracted: { acts: { title: string; summary: string }[]; times: string[]; dates: string[]; potentialClues: string[]; potentialRedHerrings: string[]; concepts: { concept: string; count: number }[]; warnings: string[] } | null;
    story: Story | null;
    plan: { rounds: Family[]; curve: Curve; customTiers?: Tier[] };
    blueprint: { rounds: { id: string; title: string; family: Family; tier: Tier; act: string }[]; acts: { id: string; title: string }[]; nodes: NodeDef[]; evidence: { id: string; title: string }[]; redHerrings: { id: string }[] } | null;
    notes: string[];
    suggestions: { concept: string; primitive: string; family: string; mechanic: string; rationale: string; weight: number }[];
    lastValidation: {
      ok: boolean;
      at: string;
      errors: Issue[];
      warnings: Issue[];
      checks: { id: string; label: string; status: "pass" | "warn" | "fail"; count: number }[];
      stats: { nodes: number; maxDepth: number; criticalMinutes: number; totalMinutes: number; durationMinutes: number; solvedInPlaythrough: number };
      quality: { id: string; title: string; primitive: string; depth: number; score: number; perTeam: boolean; textOnly: number; solvers: { text: { solved: boolean; how: string | null }; browser: { applicable: boolean; answerExposed: boolean; fragmentsFound: number; fragmentsTotal: number }; forensic: { applicable: boolean; solved: boolean; how: string | null } } }[];
    } | null;
    proposal: {
      prompt: string;
      understood: string;
      target: { kind: string; id: string | null; title: string };
      plan: string[];
      changes: { node: string; kind: string; summary: string; before?: unknown; after?: unknown }[];
      before: { nodes: number; maxDepth: number; redHerrings: number; perTeam: number; minutes: number; families: string[] };
      after: { nodes: number; maxDepth: number; redHerrings: number; perTeam: number; minutes: number; families: string[] };
      added: string[];
      removed: string[];
    } | null;
    history: { at: string; what: string }[];
  };
  catalog: { id: string; label: string; family: string; summary: string; example: Record<string, unknown>; canHarden: boolean }[];
  graph: {
    nodes: (GraphNode & { score: number; profile: Record<string, number>; points: number; skills: string[]; tools: string[]; channels: string[]; hints: number; evidence: string[]; deps: string[] })[];
    edges: GraphEdge[];
    criticalMinutes: number;
    totalMinutes: number;
    maxDepth: number;
  } | null;
  harden?: { changes: { node: string; kind: string; summary: string; before?: unknown; after?: unknown }[]; scoreBefore: number; scoreAfter: number; depthBefore: number; depthAfter: number };
  version?: number;
}

const ALL_FAMILIES: Family[] = ["cryptic", "browser", "forensics", "ctf", "osint", "inquest", "physical", "final"];

/** Old `?tab=` links (and the e2e suite's) still land somewhere sensible. */
const TAB_TO_STATION: Record<string, StationId> = {
  setup: "world",
  story: "story",
  rounds: "world",
  challenges: "challenges",
  graph: "logic",
  difficulty: "logic",
  copilot: "logic",
  logic: "logic",
  world: "world",
  presentation: "presentation",
  playtest: "playtest",
  publish: "publish",
};
type LogicTab = "graph" | "difficulty" | "copilot";
/** The build theatre replays a receipt at this pace: same stages, same order, same proportions — slow enough to watch. */
const THEATRE_PACE = 0.42;

const STATION_COPY: Record<StationId, string> = {
  story: "Drop in the story as Markdown. DOSSIER reads the people, places, timeline and the truth behind the case; everything downstream is generated from it.",
  world: "Choose the rounds and how steeply the event climbs. Building the world gives every team its own facts, sites and checkpoints.",
  challenges: "Every file the players will open. Edit one, or ask for a harder version and see exactly what changed.",
  logic: "The gates between files: what unlocks what, how deep the chains run, and where a shortcut would break the event.",
  presentation: "How the case looks and opens. Purely cosmetic: it never touches a rule, a score or an answer.",
  playtest: "Validation plays sample teams through the whole event and probes it with synthetic solvers. Then play it yourself before anyone else does.",
  publish: "Ship it. Publishing seals the answers and opens the event to teams.",
};

/** Files in the stage start expanded where the universe is the point, and shrink where forms are. */
// Presentation has its own theatre (one live scene at a time), so the stage folds away there.
const STAGE_OPEN: StationId[] = ["world", "challenges", "logic"];

export function StudioWorkspace({ initial }: { initial: StudioViewT }) {
  const router = useRouter();
  const params = useSearchParams();
  const [view, setView] = useState<StudioViewT>(initial);
  const tabParam = params.get("tab") ?? "";
  const [station, setStation] = useState<StationId>(() => TAB_TO_STATION[tabParam] ?? currentStation(initial.pipeline).id);
  const [logicTab, setLogicTab] = useState<LogicTab>(tabParam === "difficulty" ? "difficulty" : tabParam === "copilot" ? "copilot" : "graph");
  const [busy, setBusy] = useState<{ label: string; station: StationId } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(params.get("node"));
  const [edit, setEdit] = useState<NodeDef | null>(null);
  const [stagePref, setStagePref] = useState<boolean | null>(null);
  const [previewTheme, setPreviewTheme] = useState<ThemeId | null>(null);
  const [receiptKind, setReceiptKind] = useState<BuildTrace["kind"]>(() => {
    const s = TAB_TO_STATION[tabParam] ?? currentStation(initial.pipeline).id;
    return s === "playtest" ? "validate" : s === "publish" ? "publish" : initial.trace.generate ? "generate" : latestKind(initial.trace);
  });
  const replay = useBuildReplay();
  const [theatre, setTheatre] = useState<TheatreState>("off");
  const top = useRef<HTMLDivElement>(null);

  const d = view.draft;
  const bp = d.blueprint;
  const g = view.graph;
  const next = currentStation(view.pipeline);
  const here = view.pipeline.find((s) => s.id === station)!;

  const run: Run = async (op, label, at) => {
    setBusy({ label, station: at ?? station });
    setError(null);
    const kind = op.op === "generate" ? "generate" : op.op === "validate" ? "validate" : op.op === "publish" ? "publish" : null;
    if (kind === "generate") {
      top.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      // The theatre takes the screen the moment the engine starts, not when it answers.
      setTheatre("building");
    }
    try {
      const r = await api<StudioViewT & { redirect?: string }>(`/api/studio/${view.event.id}`, { body: op, timeoutMs: 180_000 });
      if (r.redirect) {
        window.location.href = r.redirect;
        return null;
      }
      setView(r);
      router.refresh();
      const trace = kind ? r.trace[kind] : undefined;
      if (kind && trace) {
        setReceiptKind(kind);
        // The build is replayed from its own receipt the moment it lands.
        // A build takes the screen: the theatre replays its receipt, then shows the world it made.
        if (kind === "generate") setTheatre("building");
        replay.play(
          trace,
          r.draft.blueprint?.nodes.length ?? 0,
          () => {
            if (kind === "generate") {
              setTheatre((t) => (t === "off" ? t : "done"));
              setStation((s) => (s === "world" ? "challenges" : s));
            }
          },
          kind === "generate" ? THEATRE_PACE : 1,
        );
      }
      return r;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong.");
      if (kind === "generate") setTheatre("off");
      // A failed run still leaves a receipt on the server: pull it so the stage can show where the line stopped.
      if (kind) void api<StudioViewT>(`/api/studio/${view.event.id}`).then((v) => (setView(v), v.trace[kind] && (setReceiptKind(kind), replay.play(v.trace[kind]!, 0)))).catch(() => undefined);
      return null;
    } finally {
      setBusy(null);
    }
  };

  const authorGraph = useMemo<AuthorInput | null>(() => {
    if (!bp || !g) return null;
    return {
      nodes: g.nodes.map((n) => ({ id: n.id, title: n.title, family: n.family, round: n.round, depth: n.depth, points: n.points, minutes: n.minutes, optional: n.optional, redHerring: n.redHerring, perTeam: n.perTeam, configError: n.configError })),
      edges: g.edges.map((e) => ({ from: e.from, to: e.to, kind: e.kind })),
      rounds: bp.rounds.map((r) => ({ id: r.id, act: r.act })),
      acts: bp.acts,
    };
  }, [bp, g]);
  const critical = useMemo(() => g?.nodes.filter((n) => n.critical).map((n) => n.id) ?? [], [g]);
  // The world as built, quoted by the theatre's closing card: every number read from the draft.
  const world = useMemo<WorldSummary | null>(() => {
    if (!bp || !g) return null;
    const metric = (id: string, label: string) => Number(view.pipeline.find((st) => st.id === id)?.metrics.find((m) => m.label === label)?.value ?? 0);
    return {
      title: d.story?.title || d.meta.title,
      files: bp.nodes.length,
      acts: bp.acts.length,
      rounds: bp.rounds.length,
      exhibits: bp.evidence.length,
      facts: metric("world", "world facts"),
      depth: g.maxDepth,
      criticalMinutes: g.criticalMinutes,
      mechanics: metric("challenges", "mechanics"),
      people: d.story?.characters.length ?? 0,
    };
  }, [bp, g, view.pipeline, d.story, d.meta.title]);

  const generating = busy?.label.toLowerCase().includes("generat") || (replay.playing && replay.trace?.kind === "generate");
  const expanded = stagePref ?? (Boolean(generating) || STAGE_OPEN.includes(station) || (!bp && Boolean(d.story)));
  const theme = previewTheme ?? d.presentation.theme;
  const story = d.story ? { characters: d.story.characters, locations: d.story.locations } : null;

  const facts: PresentationFacts = {
    eventId: view.event.id,
    eventName: d.meta.title,
    title: d.story?.title || d.meta.title,
    codename: d.story?.codename ?? "",
    accent: d.meta.accent,
    premiseLead: /^[^.!?]{12,120}[.!?]?/.exec((d.story?.premise ?? "").replace(/\s+/g, " ").trim())?.[0] ?? "",
    files: bp?.nodes.length ?? 0,
    exhibits: bp?.evidence.length ?? 0,
    acts: bp?.acts.length ?? 0,
  };

  const go = (id: StationId) => {
    setStation(id);
    setStagePref(null);
    // Land with the stage just under the rail, whatever the scroll position was.
    requestAnimationFrame(() => document.querySelector(".cs-wrap")?.scrollIntoView({ block: "start", behavior: "smooth" }));
    // Each station opens on the receipt that belongs to it.
    setReceiptKind(id === "playtest" ? "validate" : id === "publish" ? "publish" : "generate");
  };

  const receipt = <Receipt traces={view.trace} kind={receiptKind} onKind={setReceiptKind} replay={replay} className="rc-stage" />;

  return (
    <div ref={top} className="space-y-0">
      <header className="flex flex-wrap items-end justify-between gap-3 pb-4">
        <div className="min-w-0">
          <p className="label-mono flex flex-wrap items-center gap-2">
            Studio{view.event.kind !== "studio" ? ` · ${view.event.kind}` : ""} · {view.event.status}
            {view.event.version ? <Badge variant="outline">published v{view.event.version}</Badge> : <Badge variant="warning">unpublished</Badge>}
            {view.event.active ? <Badge variant="accent">active</Badge> : null}
          </p>
          <h1 className="mt-1 truncate text-xl font-semibold uppercase tracking-[0.04em] sm:text-2xl">{d.meta.title}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" disabled={!view.event.version || Boolean(busy)} onClick={() => run({ op: "playtest", reset: false }, "Opening playtest", "playtest")}>
            <Play /> Play as team
          </Button>
          <Button size="sm" disabled={!d.blueprint || Boolean(busy)} onClick={() => go("publish")}>
            <Rocket /> Publish…
          </Button>
        </div>
      </header>

      <PipelineRail stations={view.pipeline} active={station} next={next.id} lit={replay.lit} busy={busy?.station ?? null} onSelect={go} />

      <ConstructionStage
        eventId={view.event.id}
        graph={authorGraph}
        critical={critical}
        story={story}
        theme={theme}
        accent={d.meta.accent}
        busy={busy && busy.label !== "Saving" ? busy.label : null}
        replay={replay}
        expanded={expanded}
        onToggle={() => setStagePref(!expanded)}
        onReplay={
          view.trace.generate && authorGraph
            ? () => {
                setReceiptKind("generate");
                setTheatre("building");
                replay.play(view.trace.generate!, authorGraph.nodes.length, () => setTheatre((t) => (t === "off" ? t : "done")), THEATRE_PACE);
              }
            : null
        }
        theatre={theatre}
        onTheatreClose={() => {
          setTheatre("off");
          if (replay.playing) replay.skip();
        }}
        world={world}
        stations={view.pipeline}
        onStation={go}
        hint={!d.story ? "Drop in a story to begin." : undefined}
        inspector={(n) => (
          <AuthorInspector
            view={view}
            nodeId={n.id}
            busy={Boolean(busy)}
            onEdit={(def) => setEdit(def)}
            onHarden={async (id) => void (await run({ op: "harden", node: id }, "Making it harder", "challenges"))}
            onGates={(id) => {
              setSelected(id);
              setLogicTab("graph");
              go("logic");
            }}
          />
        )}
        receipt={receipt}
      />

      <div className="pt-1">
        <div className="wb-head">
          <div className="min-w-0">
            <p className="wb-kicker">
              {String(here.index + 1).padStart(2, "0")} / {here.verb}
            </p>
            <h2 className="wb-title">{here.title}</h2>
            <p className="wb-sub">{STATION_COPY[station]}</p>
          </div>
          {here.metrics.length ? (
            <ul className="wb-metrics" aria-label={`${here.title} in numbers`}>
              {here.metrics.map((m) => (
                <li key={m.label}>
                  <b className="num">{m.value}</b>
                  <span>{m.label}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        {busy ? (
          <p className="flex items-center gap-2 pb-3 font-mono text-xs text-signal-2" role="status">
            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> {busy.label}…
          </p>
        ) : null}
        {error ? (
          <p className="mb-3 flex items-center gap-2 border-l-2 border-signal-magenta px-3 py-2 text-sm text-signal-magenta" role="alert">
            <CircleX className="size-4" aria-hidden="true" /> {error}
          </p>
        ) : null}
        {here.next && here.status !== "done" ? (
          <p className={cn("wb-next", here.status === "fail" && "is-bad", here.status === "warn" && "is-warn")}>
            <ArrowRight className="size-4 shrink-0" aria-hidden="true" /> {here.next}
          </p>
        ) : null}

        {station === "story" ? <StoryTab view={view} run={run} onNext={() => go("world")} /> : null}
        {station === "world" ? (
          <div className="space-y-6">
            <RoundsTab view={view} run={run} onGenerated={() => undefined} busy={Boolean(busy)} />
            <details className="panel p-5" open={!bp}>
              <summary className="label-mono cursor-pointer">Event identity &amp; schedule</summary>
              <div className="mt-4">
                <MetaForm initial={d.meta} submitLabel="Save setup" onSave={async (meta) => void (await run({ op: "meta", meta }, "Saving", "world"))} />
              </div>
            </details>
          </div>
        ) : null}
        {station === "challenges" ? <ChallengesTab view={view} run={run} busy={Boolean(busy)} onGraph={(id) => (setSelected(id), setLogicTab("graph"), go("logic"))} onEdit={setEdit} /> : null}
        {station === "logic" ? (
          <>
            <div className="wb-sub-tabs" role="navigation" aria-label="Logic views">
              {(
                [
                  ["graph", "Graph"],
                  ["difficulty", "Difficulty"],
                  ["copilot", "Copilot"],
                ] as const
              ).map(([id, label]) => (
                <button key={id} type="button" aria-current={logicTab === id ? "page" : undefined} onClick={() => setLogicTab(id)}>
                  {label}
                </button>
              ))}
            </div>
            {logicTab === "graph" ? <GraphTab view={view} selected={selected} setSelected={setSelected} /> : null}
            {logicTab === "difficulty" ? <DifficultyTab view={view} /> : null}
            {logicTab === "copilot" ? <CopilotTab view={view} run={run} busy={Boolean(busy)} /> : null}
          </>
        ) : null}
        {station === "presentation" ? (
          <PresentationTab
            key={JSON.stringify(d.presentation)}
            saved={d.presentation}
            facts={facts}
            busy={Boolean(busy)}
            onPreviewTheme={setPreviewTheme}
            graph={authorGraph}
            sample={{
              eventName: d.meta.title,
              title: d.story?.title || d.meta.title,
              exhibits: (bp?.evidence ?? []).slice(0, 4).map((e) => ({ title: e.title, kind: (e as { kind?: string }).kind ?? "document" })),
              people: (d.story?.characters ?? []).filter((c) => c.suspect).map((c) => c.name),
            }}
            onSave={async (presentation) => void (await run({ op: "presentation", presentation }, "Saving look", "presentation"))}
          />
        ) : null}
        {station === "playtest" ? <PlaytestTab view={view} run={run} busy={Boolean(busy)} replay={replay} receiptKind={receiptKind} setReceiptKind={setReceiptKind} /> : null}
        {station === "publish" ? <PublishPanel view={view} run={run} busy={Boolean(busy)} replay={replay} receiptKind={receiptKind} setReceiptKind={setReceiptKind} onStation={go} /> : null}

        {d.history.length ? (
          <details className="panel mt-8 p-3">
            <summary className="label-mono cursor-pointer">Draft history</summary>
            <ul className="mt-2 space-y-1 font-mono text-xs text-mute">
              {d.history.map((h, i) => (
                <li key={i}>
                  <LocalTime iso={h.at} format="full" /> — {h.what}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>

      <NodeEditor node={edit} onClose={() => setEdit(null)} run={run} catalog={view.catalog} />
    </div>
  );
}

function latestKind(t: StudioViewT["trace"]): BuildTrace["kind"] {
  const all = (Object.values(t).filter(Boolean) as BuildTrace[]).sort((a, b) => b.at.localeCompare(a.at));
  return all[0]?.kind ?? "generate";
}

type Run = (op: Record<string, unknown>, label: string, at?: StationId) => Promise<StudioViewT | null>;

/* ─────────────────────────── Story ─────────────────────────── */

function StoryTab({ view, run, onNext }: { view: StudioViewT; run: Run; onNext: () => void }) {
  const [sources, setSources] = useState(view.draft.sources.length ? view.draft.sources : [{ name: "story.md", markdown: "" }]);
  const [story, setStory] = useState<Story | null>(view.draft.story);
  const [over, setOver] = useState(false);
  const ex = view.draft.extracted;

  const addFiles = async (files: FileList | File[]) => {
    const read = await Promise.all([...files].filter((f) => /\.(md|markdown|txt)$/i.test(f.name) && f.size < 200_000).map(async (f) => ({ name: f.name, markdown: await f.text() })));
    setSources((s) => [...s.filter((x) => x.markdown.trim()), ...read]);
  };
  const parse = async () => {
    const r = await run({ op: "story-import", sources: sources.filter((s) => s.markdown.trim()) }, "Compiling story");
    if (r) setStory(r.draft.story);
  };
  const upd = (fn: (s: Story) => void) =>
    setStory((s) => {
      if (!s) return s;
      const n = structuredClone(s);
      fn(n);
      return n;
    });

  return (
    <div className="space-y-5">
      <section
        className={cn("panel space-y-3 border-dashed p-5", over && "border-[var(--accent)] bg-raised/40")}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void addFiles(e.dataTransfer.files);
        }}
      >
        <div className="flex flex-wrap items-center gap-3">
          <FileUp className="size-5 text-signal-2" aria-hidden="true" />
          <p className="text-sm text-ink-dim">
            Drop <code>story.md</code>, <code>characters.md</code>, <code>locations.md</code>, <code>lore.md</code> here — or paste below. Headings like <em>Characters</em>, <em>Locations</em>, <em>Timeline</em>, <em>Truth</em> and <em>Acts</em> are understood; prose is mined for names, places and times.
          </p>
          <label className="ml-auto">
            <span className="sr-only">Choose Markdown files</span>
            <input type="file" accept=".md,.markdown,.txt" multiple className="text-xs" onChange={(e) => e.target.files && void addFiles(e.target.files)} />
          </label>
        </div>
        {sources.map((s, i) => (
          <div key={i} className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Input value={s.name} onChange={(e) => setSources((x) => x.map((y, j) => (j === i ? { ...y, name: e.target.value } : y)))} className="h-8 max-w-60 font-mono text-xs" aria-label="File name" />
              <Button size="icon-sm" variant="ghost" aria-label={`Remove ${s.name}`} onClick={() => setSources((x) => x.filter((_, j) => j !== i))}>
                <Trash2 />
              </Button>
            </div>
            <Textarea value={s.markdown} onChange={(e) => setSources((x) => x.map((y, j) => (j === i ? { ...y, markdown: e.target.value } : y)))} className="min-h-40 font-mono text-xs" placeholder="# The case…" />
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setSources((s) => [...s, { name: `notes-${s.length + 1}.md`, markdown: "" }])}>
            <Plus /> Add file
          </Button>
          <Button size="sm" onClick={parse} disabled={!sources.some((s) => s.markdown.trim())}>
            <Sparkles /> Compile story
          </Button>
          {!story ? (
            <Button
              variant="ghost"
              size="sm"
              title="Loads a complete whodunit and compiles it, so you can see the whole machine in a couple of minutes"
              onClick={async () => {
                const sample = [{ name: SAMPLE_STORY.name, markdown: SAMPLE_STORY.markdown }];
                setSources(sample);
                const r = await run({ op: "story-import", sources: sample }, "Compiling the sample story");
                if (r) setStory(r.draft.story);
              }}
            >
              Try a sample story
            </Button>
          ) : null}
        </div>
      </section>

      {story ? (
        <>
          {ex?.warnings.length ? (
            <ul className="space-y-1">
              {ex.warnings.map((w) => (
                <li key={w} className="flex items-center gap-2 text-sm text-signal-amber">
                  <CircleAlert className="size-4" aria-hidden="true" /> {w}
                </li>
              ))}
            </ul>
          ) : null}
          <section className="panel space-y-3 p-5">
            <div className="grid gap-3 md:grid-cols-3">
              <label className="flex flex-col gap-1 md:col-span-2">
                <span className="label-mono">Title</span>
                <Input value={story.title} onChange={(e) => upd((s) => void (s.title = e.target.value))} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="label-mono">Codename</span>
                <Input value={story.codename} onChange={(e) => upd((s) => void (s.codename = e.target.value))} />
              </label>
            </div>
            <label className="flex flex-col gap-1">
              <span className="label-mono">Premise</span>
              <Textarea value={story.premise} onChange={(e) => upd((s) => void (s.premise = e.target.value))} className="min-h-16" />
            </label>
          </section>

          <div className="grid gap-4 [&>*]:min-w-0 lg:grid-cols-2">
            <section className="panel p-4">
              <h2 className="label-mono mb-2">Characters ({story.characters.length})</h2>
              <ul className="space-y-2">
                {story.characters.map((c, i) => (
                  <li key={c.id} className="grid grid-cols-[1fr_1fr_auto_auto] items-center gap-2">
                    <Input value={c.name} onChange={(e) => upd((s) => void (s.characters[i]!.name = e.target.value))} className="h-8 text-sm" aria-label="Name" />
                    <Input value={c.role} onChange={(e) => upd((s) => void (s.characters[i]!.role = e.target.value))} className="h-8 text-sm" aria-label="Role" placeholder="role" />
                    <label className="flex items-center gap-1 font-mono text-[0.65rem] text-mute">
                      <Switch checked={c.suspect} onCheckedChange={(v) => upd((s) => void (s.characters[i]!.suspect = v))} aria-label={`${c.name} is a suspect`} /> suspect
                    </label>
                    <Button size="icon-sm" variant="ghost" aria-label={`Remove ${c.name}`} onClick={() => upd((s) => void s.characters.splice(i, 1))}>
                      <Trash2 />
                    </Button>
                  </li>
                ))}
              </ul>
              <Button size="xs" variant="outline" className="mt-2" onClick={() => upd((s) => void s.characters.push({ id: `person-${s.characters.length + 1}`, name: "New person", role: "", bio: "", suspect: false, traits: [], relationships: [] }))}>
                <Plus /> Person
              </Button>
            </section>
            <section className="panel p-4">
              <h2 className="label-mono mb-2">Locations ({story.locations.length})</h2>
              <ul className="space-y-2">
                {story.locations.map((l, i) => (
                  <li key={l.id} className="grid grid-cols-[1fr_1.4fr_auto] items-center gap-2">
                    <Input value={l.name} onChange={(e) => upd((s) => void (s.locations[i]!.name = e.target.value))} className="h-8 text-sm" aria-label="Location name" />
                    <Input value={l.description} onChange={(e) => upd((s) => void (s.locations[i]!.description = e.target.value))} className="h-8 text-sm" aria-label="Description" />
                    <span className="font-mono text-[0.6rem] text-faint">{l.geo ? `${l.geo.lat.toFixed(3)},${l.geo.lon.toFixed(3)}` : "no geo"}</span>
                  </li>
                ))}
              </ul>
            </section>
            <section className="panel p-4">
              <h2 className="label-mono mb-2">Timeline ({story.timeline.length})</h2>
              <ul className="space-y-2">
                {story.timeline.map((t, i) => (
                  <li key={t.id} className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-2">
                    <Input value={t.at} onChange={(e) => upd((s) => void (s.timeline[i]!.at = e.target.value))} className="h-8 font-mono text-sm" aria-label="Time" />
                    <Input value={t.title} onChange={(e) => upd((s) => void (s.timeline[i]!.title = e.target.value))} className="h-8 text-sm" aria-label="Event" />
                    <span className="font-mono text-[0.6rem] text-faint">{t.actors.length} actor(s)</span>
                  </li>
                ))}
              </ul>
            </section>
            <section className="panel space-y-2 p-4">
              <h2 className="label-mono mb-1">Truth (never shown to players)</h2>
              <label className="flex items-center gap-2 text-sm">
                <span className="w-20 font-mono text-xs text-mute">Culprit</span>
                <select className="h-8 flex-1 rounded-xs border border-line bg-bg px-2 text-sm" value={story.truth.culprit ?? ""} onChange={(e) => upd((s) => void (s.truth.culprit = e.target.value || undefined))}>
                  <option value="">(planner chooses)</option>
                  {story.characters.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              {(["motive", "method", "time"] as const).map((k) => (
                <label key={k} className="flex items-center gap-2 text-sm">
                  <span className="w-20 font-mono text-xs text-mute">{k}</span>
                  <Input value={story.truth[k]} onChange={(e) => upd((s) => void (s.truth[k] = e.target.value))} className="h-8 flex-1 text-sm" />
                </label>
              ))}
              <label className="flex items-center gap-2 text-sm">
                <span className="w-20 font-mono text-xs text-mute">Where</span>
                <select className="h-8 flex-1 rounded-xs border border-line bg-bg px-2 text-sm" value={story.truth.location ?? ""} onChange={(e) => upd((s) => void (s.truth.location = e.target.value || undefined))}>
                  <option value="">(first location)</option>
                  {story.locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </label>
            </section>
          </div>

          {ex ? (
            <div className="grid gap-4 [&>*]:min-w-0 lg:grid-cols-3">
              <section className="panel p-4">
                <h2 className="label-mono mb-2">Acts detected</h2>
                <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-dim">
                  {ex.acts.map((a) => (
                    <li key={a.title}>{a.title}</li>
                  ))}
                  {!ex.acts.length ? <li className="list-none text-mute">None — acts follow the rounds.</li> : null}
                </ol>
                {story.artifacts.length ? <p className="mt-3 font-mono text-xs text-mute">Artifacts: {story.artifacts.map((a) => a.name).join(", ")}</p> : null}
                {story.organizations.length ? <p className="mt-1 font-mono text-xs text-mute">Organisations: {story.organizations.map((a) => a.name).join(", ")}</p> : null}
              </section>
              <section className="panel p-4 lg:col-span-2">
                <h2 className="label-mono mb-2">Story → mechanics</h2>
                <ul className="max-h-64 space-y-1.5 overflow-y-auto text-sm">
                  {view.draft.suggestions.slice(0, 14).map((s, i) => (
                    <li key={i} className="grid grid-cols-[7rem_1fr] gap-2">
                      <span className="font-mono text-xs text-signal-2">{s.concept}</span>
                      <span>
                        <span className="font-mono text-xs text-ink">{s.primitive}</span> — <span className="text-ink-dim">{s.mechanic}</span>
                      </span>
                    </li>
                  ))}
                </ul>
                {ex.potentialRedHerrings.length ? <p className="mt-3 text-xs text-mute">Potential red herrings: {ex.potentialRedHerrings.slice(0, 3).join(" · ")}</p> : null}
              </section>
            </div>
          ) : null}
          <div className="flex gap-2">
            <Button onClick={() => story && run({ op: "story-save", story }, "Saving story")}>
              <Save /> Save story edits
            </Button>
            <Button variant="outline" onClick={onNext}>
              Next: rounds
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}

/* ─────────────────────────── Rounds ─────────────────────────── */

function RoundsTab({ view, run, onGenerated, busy }: { view: StudioViewT; run: Run; onGenerated: () => void; busy: boolean }) {
  const [rounds, setRounds] = useState<Family[]>(view.draft.plan.rounds);
  const [curve, setCurve] = useState<Curve>(view.draft.plan.curve);
  const [custom, setCustom] = useState<Tier[]>(view.draft.plan.customTiers ?? rounds.map((_, i) => tierFor("standard", i, rounds.length)));
  const [dragging, setDragging] = useState<number | null>(null);
  const move = (from: number, to: number) =>
    setRounds((r) => {
      if (to < 0 || to >= r.length) return r;
      const n = [...r];
      const [x] = n.splice(from, 1);
      n.splice(to, 0, x!);
      return n;
    });
  const plan = { rounds, curve, customTiers: curve === "custom" ? custom.slice(0, rounds.length) : undefined };
  return (
    <div className="grid gap-5 [&>*]:min-w-0 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section className="panel space-y-3 p-5">
        <h2 className="label-mono">Round order (drag to reorder)</h2>
        <ol className="space-y-2">
          {rounds.map((f, i) => (
            <li
              key={`${f}-${i}`}
              draggable
              onDragStart={() => setDragging(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragging !== null) move(dragging, i);
                setDragging(null);
              }}
              className={cn("panel flex items-center gap-3 px-3 py-2", dragging === i && "opacity-50")}
            >
              <GripVertical className="size-4 cursor-grab text-faint" aria-hidden="true" />
              <span className="num w-6 text-xs text-mute">{i + 1}</span>
              <span className="flex-1 font-mono text-sm">{FAMILY_LABEL[f] ?? f}</span>
              {curve === "custom" ? (
                <select className="h-8 rounded-xs border border-line bg-bg px-2 text-xs" value={custom[i] ?? "intermediate"} onChange={(e) => setCustom((c) => Object.assign([...c], { [i]: e.target.value as Tier }))} aria-label="Tier">
                  {TIERS.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              ) : (
                <Badge variant="outline">{TIER_LABEL[tierFor(curve, i, rounds.length)]}</Badge>
              )}
              <Button size="icon-sm" variant="ghost" aria-label="Move up" onClick={() => move(i, i - 1)}>
                <ArrowUp />
              </Button>
              <Button size="icon-sm" variant="ghost" aria-label="Move down" onClick={() => move(i, i + 1)}>
                <ArrowDown />
              </Button>
              <Button size="icon-sm" variant="ghost" aria-label="Remove round" onClick={() => setRounds((r) => r.filter((_, j) => j !== i))}>
                <Trash2 />
              </Button>
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap gap-2">
          {ALL_FAMILIES.map((f) => (
            <Button key={f} size="xs" variant="outline" onClick={() => setRounds((r) => (f === "final" ? [...r.filter((x) => x !== "final"), "final"] : [...r.filter((x) => x !== "final"), f, ...(r.includes("final") ? (["final"] as Family[]) : [])]))}>
              <Plus /> {FAMILY_LABEL[f]}
            </Button>
          ))}
        </div>
      </section>
      <aside className="space-y-4">
        <section className="panel space-y-3 p-4">
          <h2 className="label-mono">Difficulty curve</h2>
          <div className="grid grid-cols-2 gap-1.5">
            {CURVES.map((c) => (
              <Button key={c} size="sm" variant={curve === c ? "default" : "outline"} onClick={() => setCurve(c)}>
                {c}
              </Button>
            ))}
          </div>
          <p className="text-xs text-mute">Higher curves add dependencies, channels, decoys, red herrings and cross-round chains — never longer strings.</p>
        </section>
        <section className="panel space-y-2 p-4">
          <Button variant="outline" className="w-full" disabled={busy} onClick={() => run({ op: "plan", plan }, "Saving plan")}>
            <Save /> Save plan
          </Button>
          <Button
            className="w-full"
            disabled={busy || !view.draft.story || rounds.length === 0}
            onClick={async () => {
              const saved = await run({ op: "plan", plan }, "Saving plan");
              if (saved && (await run({ op: "generate" }, "Generating challenge graph"))) onGenerated();
            }}
          >
            <Wand2 /> Generate
          </Button>
          {!view.draft.story ? <p className="text-xs text-signal-amber">Import a story first.</p> : null}
          {view.draft.notes.length ? (
            <ul className="max-h-48 space-y-1 overflow-y-auto border-t border-line pt-2 text-xs text-mute">
              {view.draft.notes.map((n, i) => (
                <li key={i}>• {n}</li>
              ))}
            </ul>
          ) : null}
        </section>
      </aside>
    </div>
  );
}

/* ─────────────────────────── Challenges ─────────────────────────── */

function ChallengesTab({ view, run, busy, onGraph, onEdit }: { view: StudioViewT; run: Run; busy: boolean; onGraph: (id: string) => void; onEdit: (n: NodeDef) => void }) {
  const bp = view.draft.blueprint;
  const g = view.graph;
  const [lastHarden, setLastHarden] = useState<StudioViewT["harden"] | null>(null);
  if (!bp || !g) return <p className="panel p-5 text-sm text-mute">Build the world on the World station first.</p>;
  const info = new Map(g.nodes.map((n) => [n.id, n]));
  const title = new Map(bp.nodes.map((n) => [n.id, n.title]));
  const evTitle = new Map(bp.evidence.map((e) => [e.id, e.title]));
  return (
    <div className="space-y-6">
      <p className="font-mono text-xs text-mute">
        {bp.nodes.length} challenges · critical path ~{g.criticalMinutes} min · all required ~{g.totalMinutes} min · max dependency depth {g.maxDepth}
      </p>
      {lastHarden ? (
        <section className="panel border-[color-mix(in_srgb,var(--color-signal-amber)_40%,var(--color-line))] p-4">
          <p className="label-mono !text-signal-amber flex items-center gap-2">
            <Flame className="size-3.5" aria-hidden="true" /> Made harder — difficulty {lastHarden.scoreBefore} → {lastHarden.scoreAfter}, depth {lastHarden.depthBefore} → {lastHarden.depthAfter}
          </p>
          <ul className="mt-2 space-y-2 text-sm">
            {lastHarden.changes.map((c, i) => (
              <li key={i}>
                <Badge variant="outline">{c.kind}</Badge> <span className="font-mono text-xs text-mute">{c.node}</span> — {c.summary}
                <details className="mt-1">
                  <summary className="cursor-pointer font-mono text-[0.65rem] text-faint">before / after</summary>
                  <div className="grid gap-2 md:grid-cols-2">
                    <pre className="max-h-48 overflow-auto rounded-xs bg-bg p-2 text-[0.65rem] text-signal-magenta">{JSON.stringify(c.before, null, 1)}</pre>
                    <pre className="max-h-48 overflow-auto rounded-xs bg-bg p-2 text-[0.65rem] text-signal-green">{JSON.stringify(c.after, null, 1)}</pre>
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {bp.rounds.map((r) => (
        <section key={r.id}>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h2 className="font-mono text-sm font-semibold uppercase tracking-[0.08em]">{r.title}</h2>
            <Badge variant="info">{FAMILY_LABEL[r.family]}</Badge>
            <Badge variant="outline">{TIER_LABEL[r.tier]}</Badge>
            <Button size="xs" variant="outline" className="ml-auto" disabled={busy} onClick={async () => {
              const v = await run({ op: "harden", round: r.id }, `Making ${r.title} harder`);
              if (v?.harden) setLastHarden(v.harden);
            }}>
              <Flame /> Make round harder
            </Button>
          </div>
          <ul className="grid gap-3 lg:grid-cols-2">
            {bp.nodes.filter((n) => n.round === r.id).map((n) => {
              const x = info.get(n.id)!;
              return (
                <li key={n.id} className={cn("panel space-y-2 p-4", x.configError && "border-signal-magenta")}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1 basis-48">
                      <p className="font-mono text-sm font-semibold">{n.title}</p>
                      <p className="font-mono text-[0.68rem] text-mute">
                        {n.primitive} · {n.scoring.points} pts · ~{n.estimatedMinutes} min{n.optional ? " · side path" : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {x.perTeam ? <Badge variant="success">unique per team</Badge> : <Badge variant="warning">same for all</Badge>}
                      <Badge variant={x.textOnly > 0.5 ? "danger" : x.textOnly > 0.2 ? "warning" : "outline"} title="Internal heuristic: how far a text-only solver could get">
                        text-only ~{Math.round(x.textOnly * 100)}%
                      </Badge>
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-[1fr_1fr]">
                    <DifficultyBars profile={x.profile} compact />
                    <dl className="space-y-1 text-[0.72rem]">
                      <div>
                        <dt className="inline font-mono text-faint">Depends on: </dt>
                        <dd className="inline text-ink-dim">{x.deps.length ? x.deps.map((dd) => title.get(dd) ?? dd).join(", ") : "entry point"}</dd>
                      </div>
                      <div>
                        <dt className="inline font-mono text-faint">Skills: </dt>
                        <dd className="inline text-ink-dim">{x.skills.join(", ") || "—"}</dd>
                      </div>
                      <div>
                        <dt className="inline font-mono text-faint">Tools: </dt>
                        <dd className="inline text-ink-dim">{x.tools.join(", ") || "—"}</dd>
                      </div>
                      <div>
                        <dt className="inline font-mono text-faint">Interaction: </dt>
                        <dd className="inline text-ink-dim">{x.channels.join(", ")}</dd>
                      </div>
                      <div>
                        <dt className="inline font-mono text-faint">Evidence: </dt>
                        <dd className="inline text-ink-dim">{n.rewards.evidence.map((e) => evTitle.get(e) ?? e).join(", ") || "—"}</dd>
                      </div>
                      <div>
                        <dt className="inline font-mono text-faint">Hints: </dt>
                        <dd className="inline text-ink-dim">{n.hints.map((h) => `${h.level}${h.cost !== undefined ? ` (${h.cost})` : ""}`).join(", ") || "none"}</dd>
                      </div>
                      <div>
                        <dt className="inline font-mono text-faint">Depth: </dt>
                        <dd className="inline text-ink-dim">{x.depth} hop{x.depth === 1 ? "" : "s"} · difficulty {x.score}</dd>
                      </div>
                    </dl>
                  </div>
                  {x.configError ? <p className="text-xs text-signal-magenta">{x.configError}</p> : null}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <Button size="xs" variant="outline" onClick={() => onEdit(n)}>
                      Edit
                    </Button>
                    <Button size="xs" variant="outline" disabled={busy} onClick={async () => {
                      const v = await run({ op: "harden", node: n.id }, `Making ${n.title} harder`);
                      if (v?.harden) setLastHarden(v.harden);
                    }}>
                      <Flame /> Make it harder
                    </Button>
                    <Button size="xs" variant="ghost" onClick={() => onGraph(n.id)}>
                      Show in graph
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

function NodeEditor({ node, onClose, run, catalog }: { node: NodeDef | null; onClose: () => void; run: Run; catalog: StudioViewT["catalog"] }) {
  const [draft, setDraft] = useState<{ title: string; briefing: string; points: number; minutes: number; optional: boolean; primitive: string; config: string; gate: string; hints: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const key = node?.id;
  const [loadedFor, setLoadedFor] = useState<string | undefined>(undefined);
  if (node && loadedFor !== key) {
    setLoadedFor(key);
    setDraft({
      title: node.title,
      briefing: node.briefing,
      points: node.scoring.points,
      minutes: node.estimatedMinutes,
      optional: node.optional,
      primitive: node.primitive,
      config: JSON.stringify(node.config, null, 2),
      gate: node.gate ? JSON.stringify(node.gate, null, 2) : "",
      hints: JSON.stringify(node.hints, null, 2),
    });
    setErr(null);
  }
  const save = async (remove = false) => {
    if (!node || !draft) return;
    try {
      const edit = remove
        ? { nodeId: node.id, remove: true }
        : {
            nodeId: node.id,
            title: draft.title,
            briefing: draft.briefing,
            points: draft.points,
            estimatedMinutes: draft.minutes,
            optional: draft.optional,
            primitive: draft.primitive,
            config: draft.primitive === node.primitive ? JSON.parse(draft.config) : undefined,
            gate: draft.gate.trim() ? JSON.parse(draft.gate) : null,
            hints: JSON.parse(draft.hints),
          };
      const r = await run({ op: "node", edit }, remove ? "Removing" : "Saving challenge");
      if (r) onClose();
    } catch (e) {
      setErr(e instanceof SyntaxError ? `Invalid JSON: ${e.message}` : "Could not save.");
    }
  };
  return (
    <Sheet open={Boolean(node)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Edit challenge</SheetTitle>
          <SheetDescription>Configs are validated against the primitive&apos;s schema. Answers are templates over per-team facts — plaintext answers are hashed on save.</SheetDescription>
        </SheetHeader>
        {draft ? (
          <div className="space-y-3 px-4 pb-6">
            <label className="flex flex-col gap-1">
              <span className="label-mono">Title</span>
              <Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="label-mono">Primitive</span>
              <select className="h-9 rounded-xs border border-line bg-bg px-2 text-sm" value={draft.primitive} onChange={(e) => setDraft({ ...draft, primitive: e.target.value })}>
                {catalog.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label} ({p.id})
                  </option>
                ))}
              </select>
              {draft.primitive !== node?.primitive ? <span className="text-xs text-signal-amber">Switching primitive resets the config to that primitive&apos;s example.</span> : null}
            </label>
            <div className="grid grid-cols-3 gap-2">
              <label className="flex flex-col gap-1">
                <span className="label-mono">Points</span>
                <Input type="number" value={draft.points} onChange={(e) => setDraft({ ...draft, points: Number(e.target.value) })} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="label-mono">Minutes</span>
                <Input type="number" value={draft.minutes} onChange={(e) => setDraft({ ...draft, minutes: Number(e.target.value) })} />
              </label>
              <label className="flex items-end gap-2 pb-2 text-sm">
                <Switch checked={draft.optional} onCheckedChange={(v) => setDraft({ ...draft, optional: v })} /> side path
              </label>
            </div>
            <label className="flex flex-col gap-1">
              <span className="label-mono">Briefing (Markdown, may use {"{{facts}}"})</span>
              <Textarea value={draft.briefing} onChange={(e) => setDraft({ ...draft, briefing: e.target.value })} className="min-h-24" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="label-mono">Gate (JSON: node / all / any / evidence / checkpoint / links / after / hidden…)</span>
              <Textarea value={draft.gate} onChange={(e) => setDraft({ ...draft, gate: e.target.value })} className="min-h-20 font-mono text-xs" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="label-mono">Hints (JSON)</span>
              <Textarea value={draft.hints} onChange={(e) => setDraft({ ...draft, hints: e.target.value })} className="min-h-24 font-mono text-xs" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="label-mono">Primitive config (JSON)</span>
              <Textarea value={draft.config} onChange={(e) => setDraft({ ...draft, config: e.target.value })} className="min-h-64 font-mono text-xs" disabled={draft.primitive !== node?.primitive} />
            </label>
            {err ? <p className="text-sm text-signal-magenta">{err}</p> : null}
            <div className="flex gap-2">
              <Button onClick={() => save(false)}>
                <Save /> Save
              </Button>
              <Button variant="outline" onClick={() => save(true)} className="text-signal-magenta">
                <Trash2 /> Remove
              </Button>
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

/* ─────────────────────────── Graph ─────────────────────────── */

function GraphTab({ view, selected, setSelected }: { view: StudioViewT; selected: string | null; setSelected: (id: string) => void }) {
  const g = view.graph;
  const bp = view.draft.blueprint;
  if (!g || !bp) return <p className="panel p-5 text-sm text-mute">Generate the event first.</p>;
  const sel = g.nodes.find((n) => n.id === selected);
  const title = new Map(bp.nodes.map((n) => [n.id, n.title]));
  return (
    <div className="grid gap-4 [&>*]:min-w-0 xl:grid-cols-[minmax(0,1fr)_300px]">
      <StudioGraph nodes={g.nodes} edges={g.edges} selected={selected} onSelect={setSelected} roundOrder={bp.rounds.map((r) => r.id)} />
      <aside className="panel space-y-3 p-4">
        {sel ? (
          <>
            <p className="font-mono text-sm font-semibold">{sel.title}</p>
            <p className="font-mono text-xs text-mute">
              {sel.primitive} · {sel.roundTitle} · {sel.tier} · depth {sel.depth}
            </p>
            <DifficultyBars profile={sel.profile} />
            <div className="text-xs text-ink-dim">
              <p>Needs: {sel.deps.map((d) => title.get(d) ?? d).join(", ") || "nothing (entry point)"}</p>
              <p>Unlocks: {g.edges.filter((e) => e.from === sel.id).map((e) => title.get(e.to) ?? e.to).join(", ") || "—"}</p>
            </div>
          </>
        ) : (
          <p className="text-sm text-mute">Click a node to inspect it. Columns are dependency depth: a node in column 5 sits at the end of a 5-hop chain.</p>
        )}
      </aside>
    </div>
  );
}

/* ─────────────────────────── Difficulty ─────────────────────────── */

function DifficultyTab({ view }: { view: StudioViewT }) {
  const g = view.graph;
  const bp = view.draft.blueprint;
  if (!g || !bp) return <p className="panel p-5 text-sm text-mute">Generate the event first.</p>;
  const avg = (ids: string[]) => {
    const list = g.nodes.filter((n) => ids.includes(n.id));
    const out: Record<string, number> = {};
    for (const n of list) for (const [k, v] of Object.entries(n.profile)) out[k] = (out[k] ?? 0) + v / list.length;
    return out;
  };
  return (
    <div className="space-y-5">
      <section className="panel p-4">
        <h2 className="label-mono mb-2">Difficulty across the event (0–100, story order)</h2>
        <CurveChart nodes={g.nodes} rounds={bp.rounds} />
      </section>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {bp.rounds.map((r) => (
          <section key={r.id} className="panel p-4">
            <h3 className="mb-2 flex items-center justify-between font-mono text-sm font-semibold">
              {r.title} <Badge variant="outline">{TIER_LABEL[r.tier]}</Badge>
            </h3>
            <DifficultyBars profile={avg(bp.nodes.filter((n) => n.round === r.id).map((n) => n.id))} />
          </section>
        ))}
      </div>
      <section className="panel overflow-x-auto p-0">
        <table className="w-full min-w-[640px] text-sm">
          <caption className="label-mono px-4 py-3 text-left">AI / text-only solvability — an internal heuristic for event quality, not a claim of AI resistance</caption>
          <thead>
            <tr className="border-y border-line text-left font-mono text-xs text-mute">
              <th className="px-4 py-2">Challenge</th>
              <th className="px-4 py-2">Interaction channels</th>
              <th className="px-4 py-2 text-right">Depth</th>
              <th className="px-4 py-2 text-right">Text-only ~</th>
            </tr>
          </thead>
          <tbody>
            {[...g.nodes].sort((a, b) => b.textOnly - a.textOnly).map((n) => (
              <tr key={n.id} className="border-b border-line/60">
                <td className="px-4 py-1.5">{n.title}</td>
                <td className="px-4 py-1.5 font-mono text-xs text-ink-dim">{n.channels.join(", ")}</td>
                <td className="num px-4 py-1.5 text-right">{n.depth}</td>
                <td className="num px-4 py-1.5 text-right">{Math.round(n.textOnly * 100)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

/* ─────────────────────────── Copilot ─────────────────────────── */

function CopilotTab({ view, run, busy }: { view: StudioViewT; run: Run; busy: boolean }) {
  const [prompt, setPrompt] = useState("");
  const p = view.draft.proposal;
  const examples = ["Make Round 3 feel like a cybercrime investigation", "Make the inquest round harder", "Add a red herring to round 5", "Make act II easier", "Add an OSINT trail"];
  return (
    <div className="grid gap-5 [&>*]:min-w-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <section className="panel space-y-3 p-5">
        <h2 className="label-mono flex items-center gap-2">
          <Bot className="size-3.5" aria-hidden="true" /> Authoring copilot
        </h2>
        <p className="text-sm text-ink-dim">Describe a change. The copilot proposes a structured modification of the challenge graph — it never edits code and never applies anything until you accept.</p>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (prompt.trim().length >= 3) void run({ op: "copilot", prompt }, "Drafting proposal");
          }}
        >
          <Input value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Make Round 3 feel like a cybercrime investigation" disabled={!view.draft.blueprint} />
          <Button type="submit" disabled={busy || prompt.trim().length < 3 || !view.draft.blueprint}>
            Propose
          </Button>
        </form>
        <ul className="flex flex-wrap gap-2">
          {examples.map((x) => (
            <li key={x}>
              <button type="button" className="rounded-xs border border-line px-2 py-1 font-mono text-[0.68rem] text-mute hover:text-ink" onClick={() => setPrompt(x)}>
                {x}
              </button>
            </li>
          ))}
        </ul>
      </section>
      <section className="panel space-y-3 p-5">
        {p ? (
          <>
            <p className="label-mono">Proposal for “{p.prompt}”</p>
            <p className="font-mono text-xs text-mute">
              Target: {p.target.kind} {p.target.title} · understood: {p.understood}
            </p>
            <pre className="whitespace-pre-wrap rounded-xs bg-bg p-3 font-mono text-xs text-ink">{p.plan.join("\n")}</pre>
            <table className="w-full font-mono text-xs">
              <thead>
                <tr className="text-left text-mute">
                  <th />
                  <th>nodes</th>
                  <th>depth</th>
                  <th>herrings</th>
                  <th>per-team</th>
                  <th>minutes</th>
                </tr>
              </thead>
              <tbody>
                {(["before", "after"] as const).map((k) => (
                  <tr key={k}>
                    <td className="text-mute">{k}</td>
                    <td>{p[k].nodes}</td>
                    <td>{p[k].maxDepth}</td>
                    <td>{p[k].redHerrings}</td>
                    <td>{p[k].perTeam}</td>
                    <td>{p[k].minutes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {p.changes.length ? (
              <details>
                <summary className="cursor-pointer font-mono text-xs text-mute">{p.changes.length} structural change(s)</summary>
                <ul className="mt-2 space-y-1 text-xs text-ink-dim">
                  {p.changes.map((c, i) => (
                    <li key={i}>
                      <Badge variant="outline">{c.kind}</Badge> {c.node}: {c.summary}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
            <div className="flex gap-2">
              <Button disabled={busy} onClick={() => run({ op: "copilot-apply", accept: true }, "Applying proposal")}>
                <CheckCircle2 /> Accept
              </Button>
              <Button variant="outline" disabled={busy} onClick={() => run({ op: "copilot-apply", accept: false }, "Discarding")}>
                <XCircle /> Discard
              </Button>
            </div>
          </>
        ) : (
          <p className="text-sm text-mute">No pending proposal.</p>
        )}
      </section>
    </div>
  );
}

/* ─────────────────────────── Stage inspector ─────────────────────────── */

/** What the organiser sees when they click a file in the universe: the same facts Logic and Challenges show, one click from editing. */
function AuthorInspector({ view, nodeId, busy, onEdit, onHarden, onGates }: { view: StudioViewT; nodeId: string; busy: boolean; onEdit: (n: NodeDef) => void; onHarden: (id: string) => void; onGates: (id: string) => void }) {
  const bp = view.draft.blueprint;
  const g = view.graph;
  const n = g?.nodes.find((x) => x.id === nodeId);
  const def = bp?.nodes.find((x) => x.id === nodeId);
  if (!bp || !g || !n || !def) return null;
  const title = new Map(bp.nodes.map((x) => [x.id, x.title]));
  const needs = n.deps.map((d) => title.get(d) ?? d);
  const unlocks = g.edges.filter((e) => e.from === n.id).map((e) => title.get(e.to) ?? e.to);
  return (
    <div className="space-y-2.5">
      <p className="label-mono flex flex-wrap items-center gap-x-2">
        <span>{FAMILY_LABEL[n.family as Family] ?? n.family}</span>
        <span className="text-faint">·</span>
        <span>{n.roundTitle}</span>
        <span className="text-faint">·</span>
        <span>{TIER_LABEL[n.tier as Tier] ?? n.tier}</span>
      </p>
      <h3 className="text-lg leading-tight font-semibold">{n.title}</h3>
      <p className="font-mono text-xs text-mute">
        {n.primitive} · {n.points} pts · ~{n.minutes} min · depth {n.depth} · difficulty {n.score}
      </p>
      <p className="flex flex-wrap gap-1.5">
        {n.critical ? <Badge variant="warning">critical path</Badge> : null}
        {n.redHerring ? <Badge variant="danger">red herring</Badge> : null}
        {n.optional ? <Badge variant="outline">side path</Badge> : null}
        {n.perTeam ? <Badge variant="success">unique per team</Badge> : <Badge variant="outline">same for all</Badge>}
        <Badge variant={n.textOnly > 0.5 ? "danger" : n.textOnly > 0.2 ? "warning" : "outline"}>text-only ~{Math.round(n.textOnly * 100)}%</Badge>
      </p>
      {n.configError ? <p className="text-xs text-signal-magenta">{n.configError}</p> : null}
      <p className="text-xs text-ink-dim">
        <span className="font-mono text-faint">Needs </span>
        {needs.join(", ") || "nothing (entry point)"}
      </p>
      <p className="text-xs text-ink-dim">
        <span className="font-mono text-faint">Unlocks </span>
        {unlocks.join(", ") || "nothing (an ending)"}
      </p>
      <div className="flex flex-wrap gap-1.5 pt-1">
        <Button size="xs" onClick={() => onEdit(def)}>
          Edit challenge
        </Button>
        <Button size="xs" variant="outline" disabled={busy} onClick={() => onHarden(n.id)}>
          <Flame /> Make it harder
        </Button>
        <Button size="xs" variant="ghost" onClick={() => onGates(n.id)}>
          Show gates
        </Button>
      </div>
    </div>
  );
}

/* ─────────────────────────── Playtest ─────────────────────────── */

type ReceiptProps = { replay: Replay; receiptKind: BuildTrace["kind"]; setReceiptKind: (k: BuildTrace["kind"]) => void };

function PlaytestTab({ view, run, busy, replay, receiptKind, setReceiptKind }: { view: StudioViewT; run: Run; busy: boolean } & ReceiptProps) {
  const v = view.draft.lastValidation;
  const stale = view.pipeline.find((s) => s.id === "playtest")?.headline === "Changed since last validation";
  const icon = (s: "pass" | "warn" | "fail") => (s === "pass" ? <CheckCircle2 className="size-4 text-signal-green" aria-label="pass" /> : s === "warn" ? <CircleAlert className="size-4 text-signal-amber" aria-label="warning" /> : <CircleX className="size-4 text-signal-magenta" aria-label="fail" />);
  const quality = useMemo(() => v?.quality ?? [], [v]);
  const published = Boolean(view.event.version);
  return (
    <div className="space-y-5">
      <section className="flex flex-wrap items-center gap-3">
        <Button disabled={busy || !view.draft.blueprint} onClick={() => run({ op: "validate" }, "Running compiler validation (plays every sample team through the event)", "playtest")}>
          <ShieldCheck /> Validate
        </Button>
        {published ? (
          <>
            <Button variant="signal" disabled={busy} onClick={() => run({ op: "playtest", reset: false }, "Opening playtest", "playtest")}>
              <Play /> Play as team
            </Button>
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => run({ op: "playtest", reset: true }, "Creating a fresh playtest team", "playtest")}>
              fresh playtest team
            </Button>
          </>
        ) : (
          <Button
            variant="signal"
            disabled={busy || !view.draft.blueprint}
            title="Publishes the event privately (teams cannot see it until you make it active) and opens it as a playtest team"
            onClick={async () => {
              const r = await run({ op: "publish", activate: false }, "Publishing privately for playtest", "playtest");
              if (r) await run({ op: "playtest", reset: false }, "Opening playtest", "playtest");
            }}
          >
            <Play /> Publish privately &amp; play as team
          </Button>
        )}
        {stale && v ? <span className="font-mono text-xs text-signal-amber">The event changed after this report.</span> : null}
      </section>

      <Receipt traces={view.trace} kind={receiptKind} onKind={setReceiptKind} replay={replay} className="rc-inline" />

      {v ? (
        <>
          <p className={cn("font-mono text-sm", v.ok ? "text-signal-green" : "text-signal-magenta")}>
            {v.ok ? "✓ Publishable" : "✖ Not publishable"} — {v.errors.length} error(s), {v.warnings.length} warning(s) · {v.stats.solvedInPlaythrough}/{v.stats.nodes} solved by the playthrough bot · max depth {v.stats.maxDepth} · critical path ~{v.stats.criticalMinutes}/{v.stats.durationMinutes} min
          </p>
          <div className="grid gap-4 [&>*]:min-w-0 lg:grid-cols-2">
            <section className="panel p-4">
              <h2 className="label-mono mb-2">Compiler checks</h2>
              <ul className="space-y-1.5">
                {v.checks.map((c) => (
                  <li key={c.id} className="flex items-center gap-2 text-sm">
                    {icon(c.status)} <span className="flex-1">{c.label}</span>
                    {c.count ? <span className="font-mono text-xs text-mute">{c.count}</span> : null}
                  </li>
                ))}
              </ul>
            </section>
            <section className="panel max-h-[28rem] overflow-y-auto p-4">
              <h2 className="label-mono mb-2">Issues</h2>
              <ul className="space-y-1.5 text-sm">
                {[...v.errors, ...v.warnings].map((i, k) => (
                  <li key={k} className={i.severity === "error" ? "text-signal-magenta" : "text-signal-amber"}>
                    {i.severity === "error" ? "✖" : "⚠"} [{i.check}] {i.node ? <span className="font-mono text-xs">{i.node}: </span> : null}
                    <span className="text-ink-dim">{i.message}</span>
                  </li>
                ))}
                {!v.errors.length && !v.warnings.length ? <li className="text-mute">None.</li> : null}
              </ul>
            </section>
          </div>
          <section className="panel overflow-x-auto p-0">
            <table className="w-full min-w-[760px] text-sm">
              <caption className="label-mono px-4 py-3 text-left">Synthetic solvers — how far shortcuts get (event-quality testing only)</caption>
              <thead>
                <tr className="border-y border-line text-left font-mono text-xs text-mute">
                  <th className="px-4 py-2">Challenge</th>
                  <th className="px-4 py-2">TextSolver</th>
                  <th className="px-4 py-2">BrowserToolSolver</th>
                  <th className="px-4 py-2">ForensicToolSolver</th>
                  <th className="px-4 py-2 text-right">Text-only ~</th>
                </tr>
              </thead>
              <tbody>
                {quality.map((q) => (
                  <tr key={q.id} className="border-b border-line/60">
                    <td className="px-4 py-1.5">
                      {q.title} <span className="font-mono text-[0.65rem] text-faint">{q.primitive}</span>
                    </td>
                    <td className="px-4 py-1.5 text-xs">{q.solvers.text.solved ? <span className="text-signal-magenta">cracks it ({q.solvers.text.how})</span> : <span className="text-mute">no</span>}</td>
                    <td className="px-4 py-1.5 text-xs">
                      {q.solvers.browser.applicable ? (q.solvers.browser.answerExposed ? <span className="text-signal-magenta">answer in crawl</span> : <span className="text-mute">{q.solvers.browser.fragmentsFound}/{q.solvers.browser.fragmentsTotal} fragments found, no order</span>) : <span className="text-faint">n/a</span>}
                    </td>
                    <td className="px-4 py-1.5 text-xs">{q.solvers.forensic.applicable ? (q.solvers.forensic.solved ? <span className="text-signal-amber">{q.solvers.forensic.how}</span> : <span className="text-mute">strings/exif: no</span>) : <span className="text-faint">n/a</span>}</td>
                    <td className="num px-4 py-1.5 text-right">{Math.round(q.textOnly * 100)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      ) : (
        <p className="panel p-5 text-sm text-mute">Run validation to see the compiler report. Publishing always validates first.</p>
      )}
    </div>
  );
}

/* ─────────────────────────── Publish ─────────────────────────── */

function PublishPanel({ view, run, busy, replay, receiptKind, setReceiptKind, onStation }: { view: StudioViewT; run: Run; busy: boolean; onStation: (s: StationId) => void } & ReceiptProps) {
  // Going live replaces whatever is live now, so that is never the default when something else is running.
  const [goLive, setGoLive] = useState(!view.otherActive && !view.event.active);
  const [copied, setCopied] = useState(false);
  const v = view.draft.lastValidation;
  const before = view.pipeline.filter((s) => s.id !== "publish");
  const blocked = !view.draft.blueprint;
  // Hydration-safe: the server renders nothing for it, the browser fills it in.
  const origin = useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => "",
  );
  return (
    <div className="space-y-6">
      <ol className="divide-y divide-line border-y border-line" aria-label="Checklist">
        {before.map((s) => (
          <li key={s.id}>
            <button type="button" className="flex w-full items-center gap-3 px-1 py-2.5 text-left hover:bg-raised/40" onClick={() => onStation(s.id)}>
              <span aria-hidden="true" className={cn("size-2.5 shrink-0 rounded-full border-2", s.status === "done" || s.status === "ready" ? "border-[var(--accent)] bg-[var(--accent)]" : s.status === "warn" ? "border-signal-amber bg-signal-amber/40" : s.status === "fail" ? "border-signal-magenta bg-signal-magenta" : "border-line-strong")} />
              <span className="w-28 shrink-0 font-mono text-xs font-semibold uppercase tracking-[0.1em]">{s.title}</span>
              <span className="min-w-0 flex-1 truncate text-sm text-ink-dim">{s.headline}</span>
              <span className="sr-only">{s.status}</span>
            </button>
          </li>
        ))}
      </ol>

      {v ? (
        <p className={cn("font-mono text-sm", v.ok ? "text-signal-green" : "text-signal-magenta")}>
          {v.ok ? "✓ Publishable" : "✖ Not publishable"} — {v.errors.length} error(s), {v.warnings.length} warning(s)
        </p>
      ) : null}

      <section className="flex flex-wrap items-center gap-4">
        <Button size="lg" disabled={busy || blocked} onClick={() => run({ op: "publish", activate: goLive }, "Validating and publishing", "publish")}>
          <Rocket /> {view.event.version ? `Publish v${view.event.version + 1}` : "Publish"}
        </Button>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={goLive} onCheckedChange={setGoLive} /> go live: make this the event teams see
        </label>
        {goLive && view.otherActive ? <span className="font-mono text-xs text-signal-amber">This replaces “{view.otherActive}” as the live event.</span> : null}
        {!view.event.active && view.event.version ? (
          <Button variant="outline" size="sm" disabled={busy} onClick={() => run({ op: "activate" }, "Activating", "publish")}>
            Make active
          </Button>
        ) : null}
        {view.event.active && view.event.status !== "live" && view.event.status !== "ended" && view.event.version ? (
          <Button variant="signal" size="sm" disabled={busy} onClick={() => run({ op: "start" }, "Starting the event", "publish")}>
            <Play /> Start the event now
          </Button>
        ) : null}
      </section>

      {view.event.version ? (
        <section className="space-y-2 border-l-2 border-[var(--accent)] py-1 pl-4">
          <p className="font-mono text-sm">
            {view.event.active ? (view.event.status === "live" ? "Live — the clock is running." : "Live for registration — the clock has not started.") : "Published, not live."} Version {view.event.version}
            {view.event.publishedAt ? (
              <>
                {" · "}
                <LocalTime iso={view.event.publishedAt} format="full" />
              </>
            ) : null}
          </p>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-mute">Players enter at</span>
            <code className="rounded-xs bg-raised px-2 py-1 font-mono text-xs">{origin || "your event URL"}</code>
            <Button
              size="xs"
              variant="outline"
              onClick={() => {
                void navigator.clipboard?.writeText(origin).then(() => setCopied(true));
                setTimeout(() => setCopied(false), 1800);
              }}
            >
              {copied ? "Copied" : "Copy"}
            </Button>
            <Button size="xs" variant="outline" asChild>
              <a href="/admin">Open the Control Room</a>
            </Button>
          </div>
        </section>
      ) : null}

      <Receipt traces={view.trace} kind={receiptKind} onKind={setReceiptKind} replay={replay} className="rc-inline" />
    </div>
  );
}
