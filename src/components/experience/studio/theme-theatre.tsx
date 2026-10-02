"use client";

import { Clapperboard, FolderSearch, Home, Network, Pause, Play, Trophy, Workflow } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { ExhibitFace, faceOf } from "@/components/experience/board/exhibit";
import { ThemeScope, useTheme } from "@/components/experience/theme-provider";
import { UniverseBackdrop, UniverseProvider } from "@/components/experience/universe/universe-stage";
import { authorUniverse, doorsOpen, type AuthorInput } from "@/lib/experience/author";
import { THEME_IDS, THEME_LIST, getTheme, type ThemeDef, type ThemeId } from "@/lib/experience/themes";
import { fingerprintOf } from "@/lib/experience/variation";
import { FAMILY_LABEL } from "@/lib/modes";
import { cn } from "@/lib/utils";

export interface TheatreSample {
  eventName: string;
  title: string;
  exhibits: { title: string; kind: string }[];
  people: string[];
}

const NAV = { rail: "a side rail", dock: "a floating dock", tabs: "folder tabs", tuner: "a tuner strip" } as const;
const LAYOUT = { strata: "tactical layers", organic: "a neural constellation", wall: "a pinned evidence wall", tunnel: "a signal tunnel" } as const;
const NODES = { crystal: "faceted crystals", orb: "lit orbs", card: "typed index cards", pulse: "signal pulses" } as const;
const THREADS = { beam: "light beams", filament: "nerve filaments", string: "red string", wave: "carrier waves" } as const;
const BOARD = { holo: "a holo table", glass: "frosted glass", cork: "cork & string", scope: "an oscilloscope" } as const;
const SURFACE = { slab: "graphite slabs", glass: "frosted glass", paper: "paper & card stock", console: "console panels" } as const;
const OPENING = { seal: "a sealed dossier", orb: "a memory forming", folder: "a case folder", spectrum: "a frequency lock" } as const;
const TYPE: Record<ThemeId, string> = { blacksite: "JetBrains Mono", "neural-archive": "Instrument Serif", "cold-case": "Courier Prime · Newsreader", signal: "Chakra Petch" };

function specOf(t: ThemeDef): [string, string][] {
  return [
    ["Navigation", NAV[t.nav]],
    ["Map", LAYOUT[t.universe.layout]],
    ["Files", NODES[t.universe.nodeStyle]],
    ["Threads", THREADS[t.universe.edgeStyle]],
    ["Board", BOARD[t.board.material]],
    ["Type", TYPE[t.id]],
    ["Surfaces", SURFACE[t.surface]],
    ["Tempo", `${t.motion.durationScale.toFixed(2)}× · ${t.motion.intensity >= 0.85 ? "theatrical" : t.motion.intensity >= 0.65 ? "measured" : "restrained"}`],
    ["Opening", OPENING[t.formation]],
    ["Sound", `${t.sound.wave} · ${Math.round(t.sound.root)} Hz`],
  ];
}

/**
 * The same event, four worlds. One player console for *this* case — its real files in the state a
 * team first sees them, its real exhibits and title — re-dressed by whichever theme is showing:
 * navigation, map, type, surfaces, wall material and exhibit skins all change, never a rule or an
 * answer. "Show all four" walks through every theme and comes back to the one chosen.
 */
export function ThemeTheatre({ graph, eventId, accent, selected, onSelect, sample, onOpening }: { graph: AuthorInput | null; eventId: string; accent: string; selected: ThemeId; onSelect: (t: ThemeId) => void; sample: TheatreSample; onOpening?: () => void }) {
  const [showing, setShowing] = useState<ThemeId>(selected);
  const [wipe, setWipe] = useState<{ id: ThemeId; key: number } | null>(null);
  const [cycling, setCycling] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const wipes = useRef(0);
  const input = useMemo(() => (graph && graph.nodes.length ? doorsOpen(authorUniverse(graph)) : null), [graph]);
  const entry = useMemo(() => (input ? input.nodes.filter((n) => n.state === "open").slice(0, 4) : []), [input]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  // The swap happens under the transition, so the reflow is never seen.
  const show = (id: ThemeId) => {
    if (id === showing) return;
    setWipe({ id, key: ++wipes.current });
    timers.current.push(setTimeout(() => setShowing(id), 300));
    timers.current.push(setTimeout(() => setWipe(null), 900));
  };
  const pick = (id: ThemeId) => {
    stop();
    onSelect(id);
    show(id);
  };
  const stop = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setCycling(false);
  };
  const cycle = () => {
    if (cycling) {
      stop();
      show(selected);
      return;
    }
    setCycling(true);
    const start = THEME_IDS.indexOf(showing);
    const order = [1, 2, 3, 4].map((k) => THEME_IDS[(start + k) % THEME_IDS.length]!);
    order.forEach((id, i) =>
      timers.current.push(
        setTimeout(() => {
          setWipe({ id, key: ++wipes.current });
          timers.current.push(setTimeout(() => setShowing(id), 300));
          timers.current.push(setTimeout(() => setWipe(null), 900));
        }, i * 4200),
      ),
    );
    timers.current.push(
      setTimeout(() => {
        setCycling(false);
        if (order.at(-1) !== selected) {
          setWipe({ id: selected, key: ++wipes.current });
          setTimeout(() => setShowing(selected), 300);
          setTimeout(() => setWipe(null), 900);
        }
      }, order.length * 4200),
    );
  };

  const t = getTheme(showing);
  return (
    <section className="tt" aria-label="The same event in each theme">
      <div className="tt-bar">
        <div className="tt-switch" role="radiogroup" aria-label="Theme">
          {THEME_LIST.map((th) => (
            <button key={th.id} type="button" role="radio" aria-checked={selected === th.id} className={cn("tt-opt", showing === th.id && "is-showing", selected === th.id && "is-chosen")} onClick={() => pick(th.id)} style={{ ["--opt" as string]: th.brand }}>
              <span className="tt-opt-name" style={{ fontFamily: th.fonts.display }}>
                {th.name}
              </span>
              <span className="tt-opt-tag">{th.tagline}</span>
            </button>
          ))}
        </div>
        <div className="tt-tools">
          <button type="button" className={cn("chip-btn", cycling && "is-primary")} onClick={cycle} aria-pressed={cycling}>
            {cycling ? <Pause className="size-3.5" /> : <Play className="size-3.5" />} {cycling ? "Stop" : "Show all four"}
          </button>
          {onOpening ? (
            <button type="button" className="chip-btn" onClick={onOpening}>
              <Clapperboard className="size-3.5" /> Play the opening
            </button>
          ) : null}
        </div>
      </div>

      <div className="tt-main">
        <div className="tt-device">
          <ThemeScope theme={showing} accent={accent} className="tt-screen">
            {input ? <PreviewConsole input={input} eventId={eventId} accent={accent} sample={sample} entry={entry.map((n) => ({ id: n.id, title: n.title ?? "", family: n.family }))} /> : <p className="tt-empty">Build the world first: the preview is your own case.</p>}
          </ThemeScope>
          {wipe ? <div key={wipe.key} className={cn("tt-wipe", `w-${wipe.id}`)} aria-hidden="true" /> : null}
          {cycling ? <p className="tt-now" aria-live="polite">{t.name}</p> : null}
        </div>

        <aside className="tt-spec" aria-label={`${t.name}: what changes`}>
          <p className="tt-spec-head">
            <span style={{ fontFamily: t.fonts.display }}>{t.name}</span>
            <em>{t.tagline}</em>
          </p>
          <dl>
            {specOf(t).map(([k, v]) => (
              <div key={`${showing}:${k}`}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          <p className="tt-spec-foot">Same files, same gates, same answers. Only the presentation changes.</p>
        </aside>
      </div>
    </section>
  );
}

const NAV_ITEMS = [
  { label: "Console", short: "Home", icon: Home },
  { label: "Case map", short: "Map", icon: Workflow },
  { label: "Case file", short: "Case", icon: FolderSearch },
  { label: "Board", short: "Board", icon: Network },
  { label: "Ranks", short: "Ranks", icon: Trophy },
];

/** The player's console for this case, in miniature, wearing the theme around it. */
function PreviewConsole({ input, eventId, accent, sample, entry }: { input: NonNullable<ReturnType<typeof doorsOpen>>; eventId: string; accent: string; sample: TheatreSample; entry: { id: string; title: string; family: string }[] }) {
  const t = useTheme();
  // The briefing panel covers the left of the miniature: the map is framed into what it leaves free, so its
  // labels land beside the panel, not on it. Measured first, so the camera's first pose already knows.
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e!.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Right edge of the panel (+ the rail where there is one); tags are centred on their file, so the frame keeps
  // half a tag's width (~70px) of margin. Too narrow for floating labels: the panel already names these files.
  const panel = Math.min(250, width * 0.38) + 14 + (t.nav === "rail" ? 48 : 0);
  const roomy = width >= 640;
  return (
    <UniverseProvider input={input} fingerprint={fingerprintOf(eventId)} layoutSeed={`${eventId}:preview`} mode="player" posture="overview" accent={accent}>
      <div className="pv" data-nav={t.nav} ref={box}>
        <div className="pv-scene">
          {width ? <UniverseBackdrop hud={false} legend={false} labels={roomy} maxLabels={3} acts={false} intro={false} list={false} interactive={false} shift={roomy ? Math.round(panel / 2 + 70) : Math.round(panel / 2)} labelClearLeft={panel + 8} /> : null}
        </div>
        <header className="pv-head">
          <span className="pv-logo">D</span>
          <span className="pv-event">{sample.eventName}</span>
          <span className="pv-live">live</span>
          <span className="pv-score">
            <small>score</small>0
          </span>
        </header>
        {t.nav === "tabs" ? (
          <nav className="pv-tabs" aria-hidden="true">
            {NAV_ITEMS.map((n, i) => (
              <span key={n.label} className={cn(i === 0 && "is-on")}>
                <n.icon className="size-3" /> {n.label}
              </span>
            ))}
          </nav>
        ) : null}
        {t.nav === "rail" ? (
          <nav className="pv-rail" aria-hidden="true">
            {NAV_ITEMS.map((n, i) => (
              <span key={n.label} className={cn(i === 0 && "is-on")}>
                <n.icon className="size-3.5" />
                <small>{n.short}</small>
              </span>
            ))}
          </nav>
        ) : null}
        {t.nav === "tuner" ? (
          <nav className="pv-tuner" aria-hidden="true">
            {NAV_ITEMS.map((n, i) => (
              <span key={n.label} className={cn(i === 0 && "is-on")}>
                <n.icon className="size-3" />
                <small>{n.short}</small>
              </span>
            ))}
          </nav>
        ) : null}
        {t.nav === "dock" ? (
          <nav className="pv-dock panel" aria-hidden="true">
            {NAV_ITEMS.map((n, i) => (
              <span key={n.label} className={cn(i === 0 && "is-on")}>
                <n.icon className="size-3.5" />
                {i === 0 ? <b>{n.label}</b> : null}
              </span>
            ))}
          </nav>
        ) : null}

        <section className="pv-panel">
          <p className="label-mono">Operative console · Preview team</p>
          <h3 className="pv-title">{sample.title}</h3>
          <div className="panel hud-glass pv-files">
            <p className="label-mono">Open files</p>
            <ul>
              {entry.map((f) => (
                <li key={f.id}>
                  <span className="pv-file">{f.title}</span>
                  <span className="pv-fam">{FAMILY_LABEL[f.family] ?? f.family}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="pv-wallbox" data-material={t.board.material}>
          <div className="board-wall pv-wall">
            <svg className="pv-string" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              <path d="M27 18 Q 50 46 73 30" />
              <path d="M27 18 Q 36 58 46 66" />
            </svg>
            {sample.exhibits.slice(0, 2).map((e, i) => (
              <div key={e.title} className={cn("pv-ex", `at-${i}`)}>
                <span className="ex-pinhead" />
                <ExhibitFace face={faceOf({ kind: "evidence", evidenceKind: e.kind })} title={e.title} subtitle={e.kind} stage={i === 0 ? "cross-referenced" : "examined"} tag={null} />
              </div>
            ))}
            {sample.people[0] ? (
              <div className="pv-ex at-2">
                <span className="ex-pinhead" />
                <ExhibitFace face="person" title={sample.people[0]} subtitle="person of interest" stage="examined" tag={null} />
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </UniverseProvider>
  );
}
