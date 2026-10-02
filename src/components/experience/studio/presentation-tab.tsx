"use client";

import { Clapperboard, Loader2, Save } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import { useIsClient } from "@/components/dossier/effects";
import { useMotion } from "@/components/experience/motion";
import { ThemeScope } from "@/components/experience/theme-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ctaLabel, resolveOpening, type CinematicVars } from "@/lib/experience/cinematic";
import { THEME_LIST, getTheme, withAccent, type ThemeDef, type ThemeId } from "@/lib/experience/themes";
import { deriveCaseNumber, fingerprintOf } from "@/lib/experience/variation";
import type { AuthorInput } from "@/lib/experience/author";
import { cn } from "@/lib/utils";
import { ThemeTheatre, type TheatreSample } from "./theme-theatre";

const OpeningPlayer = dynamic(() => import("@/components/experience/cinematic/opening-player"), { ssr: false });

export interface PresentationForm {
  theme: ThemeId;
  intensity: "calm" | "balanced" | "cinematic";
  cinematic: { caseNumber: string; kicker: string; lines: string[] };
}

export interface PresentationFacts {
  eventId: string;
  eventName: string;
  title: string;
  codename: string;
  accent: string;
  premiseLead: string;
  files: number;
  exhibits: number;
  acts: number;
}

const INTENSITY: { id: PresentationForm["intensity"]; label: string; note: string }[] = [
  { id: "calm", label: "Calm", note: "A short, quiet opening and little camera motion. Good for long events and projectors." },
  { id: "balanced", label: "Balanced", note: "The full sequence at its natural pace." },
  { id: "cinematic", label: "Cinematic", note: "A longer, theatrical opening. Best for a doors-open moment." },
];

const SPATIAL = { high: "Spatial first", medium: "Balanced 2D / 3D", low: "Document first" } as const;
const LAYOUT = { strata: "tactical layers", organic: "a neural constellation", wall: "a pinned wall", tunnel: "a signal tunnel" } as const;
const NAV = { rail: "side rail", dock: "floating dock", tabs: "file tabs", tuner: "tuner strip" } as const;
const BOARD = { holo: "holo table", glass: "frosted glass", cork: "cork & string", scope: "oscilloscope" } as const;

/** The vars an opening quotes. Only the team's own progress is absent (a preview team has none), and it is shown as such. */
export function previewVars(f: PresentationFacts, form: PresentationForm): CinematicVars {
  return {
    eventName: f.eventName,
    teamName: "Preview Team",
    caseNumber: deriveCaseNumber(f.eventId, form.cinematic.caseNumber),
    title: f.title,
    kicker: form.cinematic.kicker || f.premiseLead,
    extraLines: form.cinematic.lines,
    world: fingerprintOf(f.eventId).slice(0, 4).toUpperCase() + "-" + fingerprintOf(f.eventId).slice(4, 8).toUpperCase(),
    files: f.files,
    open: Math.min(f.files, 3),
    solved: 0,
    acts: f.acts,
    exhibits: f.exhibits,
    held: 0,
    fingerprint: fingerprintOf(f.eventId),
    intensity: form.intensity,
  };
}

export function PresentationTab({
  saved,
  facts,
  busy,
  onPreviewTheme,
  onSave,
  graph = null,
  sample,
}: {
  saved: PresentationForm;
  facts: PresentationFacts;
  busy: boolean;
  onPreviewTheme: (t: ThemeId) => void;
  onSave: (v: PresentationForm) => Promise<void>;
  /** The draft's challenge graph: the theatre previews every theme on this case, not a sample. */
  graph?: AuthorInput | null;
  sample?: TheatreSample;
}) {
  const [form, setForm] = useState<PresentationForm>(saved);
  const [lines, setLines] = useState(saved.cinematic.lines.join("\n"));
  const [opening, setOpening] = useState(false);
  const dirty = JSON.stringify(form) !== JSON.stringify(saved);

  // The stage above shows whatever is selected here, before anything is saved.
  useEffect(() => {
    onPreviewTheme(form.theme);
  }, [form.theme, onPreviewTheme]);
  // Leaving the tab (or discarding) puts the stage back on the saved look.
  useEffect(() => () => onPreviewTheme(saved.theme), [onPreviewTheme, saved.theme]);

  const set = (patch: Partial<PresentationForm>) => setForm((f) => ({ ...f, ...patch }));
  const setCine = (patch: Partial<PresentationForm["cinematic"]>) => setForm((f) => ({ ...f, cinematic: { ...f.cinematic, ...patch } }));
  const parsedLines = (text: string) =>
    text
      .split("\n")
      .map((l) => l.trim().slice(0, 90))
      .filter(Boolean)
      .slice(0, 8);

  return (
    <div className="space-y-6">
      <section aria-labelledby="pz-look">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="pz-look" className="label-mono">
            Look &amp; feel
          </h2>
          <p className="text-xs text-mute">Pick a world for this case. Nothing is published until you save and publish.</p>
        </div>
        {graph && sample ? (
          <ThemeTheatre graph={graph} eventId={facts.eventId} accent={facts.accent} selected={form.theme} onSelect={(t) => set({ theme: t })} sample={sample} onOpening={facts.files ? () => setOpening(true) : undefined} />
        ) : (
          <ul className="pz-grid" role="radiogroup" aria-label="Theme">
            {THEME_LIST.map((t) => (
              <li key={t.id}>
                <ThemeCard theme={t} selected={form.theme === t.id} isSaved={saved.theme === t.id} onPick={() => set({ theme: t.id })} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-6 [&>*]:min-w-0 lg:grid-cols-2">
        <section className="space-y-3" aria-labelledby="pz-intensity">
          <h2 id="pz-intensity" className="label-mono">
            Opening intensity
          </h2>
          <div className="pz-seg" role="radiogroup" aria-label="Opening intensity">
            {INTENSITY.map((o) => (
              <button key={o.id} type="button" role="radio" aria-checked={form.intensity === o.id} className={cn(form.intensity === o.id && "is-on")} onClick={() => set({ intensity: o.id })}>
                {o.label}
              </button>
            ))}
          </div>
          <p className="text-sm text-ink-dim">{INTENSITY.find((o) => o.id === form.intensity)!.note}</p>
          <p className="text-xs text-mute">Players who prefer reduced motion always get a still title card, and returning players a 1.5-second re-entry. Both are automatic.</p>
        </section>

        <section className="space-y-3" aria-labelledby="pz-words">
          <h2 id="pz-words" className="label-mono">
            The opening&apos;s words
          </h2>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-mute">Case number</span>
            <Input value={form.cinematic.caseNumber} onChange={(e) => setCine({ caseNumber: e.target.value })} maxLength={24} placeholder={deriveCaseNumber(facts.eventId)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-mute">Line under the title</span>
            <Input value={form.cinematic.kicker} onChange={(e) => setCine({ kicker: e.target.value })} maxLength={120} placeholder={facts.premiseLead || "A radio club heard something at 03:14."} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-mute">Extra boot-log lines (one per line, up to 8). The opening already prints real numbers: files, acts, exhibits.</span>
            <Textarea
              value={lines}
              onChange={(e) => {
                setLines(e.target.value);
                setCine({ lines: parsedLines(e.target.value) });
              }}
              className="min-h-24 font-mono text-xs"
              placeholder={"KESTREL UPLINK ........ OPEN\nNIGHT SHIFT ROSTER ..... LOADED"}
            />
          </label>
        </section>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
        <Button variant="outline" onClick={() => setOpening(true)} disabled={!facts.files}>
          <Clapperboard /> Preview the opening
        </Button>
        <Button disabled={busy || !dirty} onClick={() => onSave(form)}>
          {busy ? <Loader2 className="animate-spin" /> : <Save />} Save look
        </Button>
        {dirty ? <span className="font-mono text-xs text-signal-amber">Unsaved changes</span> : <span className="font-mono text-xs text-mute">Saved{facts.files ? "" : " · generate the world to preview the opening"}</span>}
      </div>

      {opening ? <OpeningPreview facts={facts} form={form} onClose={() => setOpening(false)} /> : null}
    </div>
  );
}

function ThemeCard({ theme, selected, isSaved, onPick }: { theme: ThemeDef; selected: boolean; isSaved: boolean; onPick: () => void }) {
  return (
    <ThemeScope theme={theme.id} className={cn("pz-card", selected && "is-on")}>
      <button type="button" role="radio" aria-checked={selected} onClick={onPick} className="pz-card-btn">
        <span className="pz-sample" aria-hidden="true">
          <MiniUniverse theme={theme} />
        </span>
        <span className="pz-name">{theme.name}</span>
        <span className="pz-tag">{theme.tagline}</span>
        <dl className="pz-spec">
          <div>
            <dt>Map</dt>
            <dd>{LAYOUT[theme.universe.layout]}</dd>
          </div>
          <div>
            <dt>Navigation</dt>
            <dd>{NAV[theme.nav]}</dd>
          </div>
          <div>
            <dt>Board</dt>
            <dd>{BOARD[theme.board.material]}</dd>
          </div>
          <div>
            <dt>Emphasis</dt>
            <dd>{SPATIAL[theme.spatial]}</dd>
          </div>
        </dl>
        {isSaved ? <span className="pz-saved">Current</span> : null}
      </button>
    </ThemeScope>
  );
}

/** A thumbnail in the theme's own node and thread language (shapes, colours, stroke), not a screenshot. */
export function MiniUniverse({ theme }: { theme: ThemeDef }) {
  const u = theme.universe;
  const pts: [number, number, "completed" | "available" | "discovered" | "locked"][] = [
    [22, 62, "completed"],
    [58, 40, "completed"],
    [96, 66, "available"],
    [138, 34, "available"],
    [176, 58, "discovered"],
    [212, 30, "locked"],
  ];
  const edges: [number, number][] = [[0, 1], [1, 2], [1, 3], [2, 4], [3, 4], [4, 5]];
  const curve = (a: [number, number], b: [number, number], k: number) => {
    const mx = (a[0] + b[0]) / 2;
    const my = (a[1] + b[1]) / 2;
    if (u.edgeStyle === "wave") return `M${a[0]},${a[1]} C${mx},${a[1] - 14} ${mx},${b[1] + 14} ${b[0]},${b[1]}`;
    if (u.edgeStyle === "string") return `M${a[0]},${a[1]} Q${mx},${my + 10 + k} ${b[0]},${b[1]}`;
    return `M${a[0]},${a[1]} L${b[0]},${b[1]}`;
  };
  return (
    <svg viewBox="0 0 240 92" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
      <rect width="240" height="92" fill={u.colors.backdrop} />
      {edges.map(([a, b], i) => (
        <path key={i} d={curve([pts[a]![0], pts[a]![1]], [pts[b]![0], pts[b]![1]], i * 2)} fill="none" stroke={pts[a]![2] === "completed" ? u.colors.edgeLive : u.colors.edge} strokeWidth={u.edgeStyle === "filament" ? 0.8 : u.edgeStyle === "string" ? 1.6 : 1.3} strokeDasharray={pts[a]![2] === "completed" ? undefined : "3 3"} opacity={0.85} />
      ))}
      {pts.map(([x, y, s], i) => {
        const fill = u.colors[s];
        const glow = s === "available" ? 0.9 : s === "locked" ? 0.25 : 0.55;
        if (u.nodeStyle === "card")
          return (
            <g key={i} transform={`translate(${x} ${y}) rotate(${(i % 3) * 3 - 3})`} opacity={glow + 0.1}>
              <rect x={-9} y={-11} width={18} height={22} fill="#efe6cf" stroke="rgba(0,0,0,.4)" strokeWidth={0.6} />
              <rect x={-6} y={-8} width={12} height={3} fill={fill} opacity={0.9} />
              <circle cx={0} cy={-11} r={1.8} fill={theme.board.pin} />
            </g>
          );
        if (u.nodeStyle === "orb")
          return (
            <g key={i}>
              <circle cx={x} cy={y} r={11} fill={fill} opacity={glow * 0.25} />
              <circle cx={x} cy={y} r={5.5} fill={fill} opacity={glow + 0.1} />
            </g>
          );
        if (u.nodeStyle === "pulse")
          return (
            <g key={i}>
              <path d={`M${x},${y - 8} L${x + 6},${y} L${x},${y + 8} L${x - 6},${y} Z`} fill={fill} opacity={glow + 0.1} />
              <circle cx={x} cy={y} r={11} fill="none" stroke={fill} strokeWidth={0.6} opacity={glow * 0.6} />
            </g>
          );
        return (
          <g key={i}>
            <circle cx={x} cy={y} r={10} fill={fill} opacity={glow * 0.22} />
            <path d={`M${x},${y - 8} L${x + 7},${y - 2.5} L${x + 4.5},${y + 7} L${x - 4.5},${y + 7} L${x - 7},${y - 2.5} Z`} fill={fill} opacity={glow + 0.1} stroke={fill} strokeWidth={0.6} />
          </g>
        );
      })}
    </svg>
  );
}

/** Plays the real opening sequence for the chosen look, with this event's real counts. Esc or Skip leaves. */
function OpeningPreview({ facts, form, onClose }: { facts: PresentationFacts; form: PresentationForm; onClose: () => void }) {
  const motion = useMotion();
  const mounted = useIsClient();
  const vars = useMemo(() => previewVars(facts, form), [facts, form]);
  const theme = useMemo(() => withAccent(getTheme(form.theme), facts.accent), [form.theme, facts.accent]);
  const script = useMemo(() => resolveOpening(form.theme, motion.reduced || !motion.effects ? "reduced" : "first", vars), [form.theme, motion.reduced, motion.effects, vars]);
  if (!mounted) return null;
  return createPortal(
    <ThemeScope theme={form.theme} className="pz-opening" style={{ display: "contents", background: "transparent" }}>
      <OpeningPlayer script={script} theme={theme} cta={ctaLabel(form.theme)} vars={vars} canScene={motion.webgl && motion.effects} tier={motion.tier} onDone={onClose} />
    </ThemeScope>,
    document.body,
  );
}
