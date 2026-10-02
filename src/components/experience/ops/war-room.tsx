"use client";

import { Activity, Expand, Minimize2, Monitor, Radio } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { LocalTime } from "@/components/dossier/local-time";
import { useRealtime } from "@/components/dossier/realtime";
import { UniverseBackdrop, UniverseProvider, useUniverse } from "@/components/experience/universe/universe-stage";
import type { TeamPin } from "@/components/experience/universe/universe-scene";
import { api } from "@/lib/api";
import { activityText, attention, eventClock, opsUniverse } from "@/lib/experience/ops";
import type { UNode } from "@/lib/experience/universe";
import { fingerprintOf } from "@/lib/experience/variation";
import { cn } from "@/lib/utils";
import type { ControlRoom } from "@/server/game/control-room";

export interface WarRoomStats {
  submissionsPerMin: number;
  correctPerMin: number;
}

interface LiveItem {
  key: number;
  at: string;
  team: string;
  text: string;
  tone: "good" | "bad" | "help" | "neutral";
  fresh: boolean;
}

interface Traffic {
  available: boolean;
  running: boolean;
  spare: string | null;
  actions: number;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

/**
 * The Control Room as an operations center: the real case universe with every
 * team on it, the files that need a human called out where they sit, the last
 * hour's pulse, and a feed that moves the moment a team does. It is built to be
 * read from across a room — large numerals, few words — and never shows a figure
 * the journals didn't produce.
 */
export function WarRoom({ eventId, eventName, accent, phase, cr, stats, children }: { eventId: string; eventName: string; accent: string; phase: string; cr: ControlRoom; stats: WarRoomStats; children?: ReactNode }) {
  const input = useMemo(() => opsUniverse(cr.graph, cr.nodes, cr.totalTeams), [cr.graph, cr.nodes, cr.totalTeams]);
  return (
    <UniverseProvider input={input} fingerprint={fingerprintOf(eventId)} layoutSeed={`${eventId}:ops`} mode="ops" posture="overview" accent={accent}>
      <Room eventName={eventName} phase={phase} cr={cr} stats={stats}>
        {children}
      </Room>
    </UniverseProvider>
  );
}

function Room({ eventName, phase, cr, stats, children }: { eventName: string; phase: string; cr: ControlRoom; stats: WarRoomStats; children?: ReactNode }) {
  const u = useUniverse();
  const router = useRouter();
  const [wall, setWall] = useState(false);
  const [now, setNow] = useState<number | null>(null);
  const [live, setLive] = useState<LiveItem[]>([]);
  const [hot, setHot] = useState<Map<string, number>>(() => new Map());
  const [banner, setBanner] = useState<{ key: number; team: string; title: string } | null>(null);
  const [traffic, setTraffic] = useState<Traffic | null>(null);
  const [wide, setWide] = useState(false);
  const seq = useRef(0);
  const refreshAt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const teamName = useMemo(() => new Map(cr.teams.map((t) => [t.teamId, t.name])), [cr.teams]);
  const nodeTitle = useMemo(() => new Map(cr.graph.nodes.map((n) => [n.id, n.title])), [cr.graph.nodes]);
  const tele = useMemo(() => new Map(cr.nodes.map((n) => [n.id, n])), [cr.nodes]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the clock exists only on the client: the server render must not bake in a time
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    const mq = window.matchMedia("(min-width: 1100px)");
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => {
      clearInterval(t);
      mq.removeEventListener("change", on);
    };
  }, []);

  // Demo traffic: shown only where the deployment allows it, and labelled whenever it runs.
  useEffect(() => {
    api<Traffic>("/api/admin/demo-traffic")
      .then(setTraffic)
      .catch(() => setTraffic(null));
  }, []);
  const toggleTraffic = async () => {
    if (!traffic) return;
    try {
      setTraffic(await api<Traffic>("/api/admin/demo-traffic", { body: { on: !traffic.running } }));
    } catch {
      /* stays as it was */
    }
  };

  // The server numbers are re-read at most every few seconds, however busy the room gets.
  const refreshSoon = useCallback(() => {
    const wait = Math.max(600, refreshAt.current + 6000 - Date.now());
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      refreshAt.current = Date.now();
      router.refresh();
      if (traffic?.running) api<Traffic>("/api/admin/demo-traffic").then(setTraffic).catch(() => undefined);
    }, wait);
  }, [router, traffic?.running]);
  useEffect(() => () => clearTimeout(timer.current), []);

  useRealtime(
    (m) => {
      if (m.type === "activity" && m.data) {
        const d = m.data as { team?: string; node?: string; correct?: boolean; solved?: boolean; hint?: boolean };
        if (d.node) {
          u.pulse(d.node);
          const id = d.node;
          setHot((h) => new Map(h).set(id, Date.now()));
        }
        const tone: LiveItem["tone"] = d.solved ? "good" : d.hint ? "help" : d.correct ? "good" : d.correct === false ? "bad" : "neutral";
        const team = teamName.get(String(d.team)) ?? "A team";
        const item: LiveItem = { key: ++seq.current, at: new Date().toISOString(), team, text: activityText(d, (id) => nodeTitle.get(id) ?? id), tone, fresh: true };
        setLive((l) => [item, ...l].slice(0, 14));
        setTimeout(() => setLive((l) => l.map((x) => (x.key === item.key ? { ...x, fresh: false } : x))), 4500);
        if (d.solved && d.node) setBanner({ key: item.key, team, title: nodeTitle.get(d.node) ?? "a file" });
      }
      if (["activity", "checkpoint", "leaderboard", "event-status", "first-blood", "reconnected"].includes(m.type)) refreshSoon();
    },
    ["activity", "checkpoint", "leaderboard", "event-status", "first-blood", "reconnected"],
  );
  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 4600);
    return () => clearTimeout(t);
  }, [banner]);
  // A file stays "hot" for half a minute after a team touched it.
  useEffect(() => {
    if (!hot.size) return;
    const t = setInterval(() => setHot((h) => new Map([...h].filter(([, at]) => Date.now() - at < 30_000))), 5000);
    return () => clearInterval(t);
  }, [hot.size]);

  useEffect(() => {
    if (!wall) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setWall(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [wall]);

  const toggleWall = () => {
    const next = !wall;
    setWall(next);
    // A wall is read from across a room: always start from the whole picture.
    u.recenter();
    try {
      if (next) void document.documentElement.requestFullscreen?.();
      else if (document.fullscreenElement) void document.exitFullscreen();
    } catch {
      /* fullscreen is a nicety */
    }
  };

  const clock = eventClock(cr.startedAt, cr.endsAt, now ?? 0);
  const attn = useMemo(() => attention({ warnings: cr.warnings, titles: Object.fromEntries(cr.graph.nodes.map((n) => [n.id, n.title])), teams: cr.teams, checkpoints: cr.checkpointTraffic }), [cr.warnings, cr.graph.nodes, cr.teams, cr.checkpointTraffic]);
  const pins = useMemo<TeamPin[]>(() => cr.teams.map((t) => ({ id: t.teamId, name: t.name, nodeId: t.current?.id ?? null, stuck: t.stuck, active: t.active, rank: t.rank })), [cr.teams]);
  const peak = Math.max(1, ...cr.pulse.map((b) => b.attempts));
  const sumAttempts = cr.pulse.reduce((s, b) => s + b.attempts, 0);
  const sumCorrect = cr.pulse.reduce((s, b) => s + b.correct, 0);
  const stuckTeams = cr.teams.filter((t) => t.stuck).length;

  // Callouts in space: the files people are on right now, and the ones teams are stuck on.
  const tagIds = useMemo(() => {
    const stuck = cr.nodes.filter((n) => n.stuck > 0).sort((a, b) => b.stuck - a.stuck).slice(0, 4).map((n) => n.id);
    const recent = [...hot.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([id]) => id);
    return [...new Set([...recent, ...stuck])].slice(0, 5);
  }, [cr.nodes, hot]);
  const tagMeta = useCallback(
    (n: UNode) => {
      const t = tele.get(n.id);
      if (!t) return null;
      return `${t.stuck ? `${t.stuck} stuck · ` : ""}${t.solved}/${cr.totalTeams} through${hot.has(n.id) ? " · now" : ""}`;
    },
    [tele, cr.totalTeams, hot],
  );

  const focus = (id?: string) => {
    if (!id) return;
    const n = u.model.nodes[u.model.byId.get(id) ?? -1];
    if (!n) return;
    u.select(id);
    u.flyTo(n.pos, u.theme.universe.distance * 0.95);
  };

  return (
    <div className={cn("wr", wall && "is-wall")} data-testid="war-room">
      <section className="wr-top" aria-label="Live operations">
        <div className="wr-stage">
          <UniverseBackdrop hud legend={false} labels intro={false} pins={pins} tagIds={tagIds} tagMeta={tagMeta} shift={wide ? -190 : 0} inspector={(n) => <NodeInspector n={n} cr={cr} />} />
          <div className="wr-head">
            <p className="wr-eyebrow">
              <span className={cn("wr-dot", phase === "live" && "is-live")} aria-hidden="true" /> {phase === "live" ? "Live" : phase}
              {cr.totalTeams ? ` · ${cr.totalTeams} teams` : ""}
              {traffic?.running ? <span className="wr-demo">demo traffic · {traffic.actions} moves</span> : null}
            </p>
            <h1 className="wr-title">
              <span className="sr-only">Control room · </span>
              {eventName}
            </h1>
            <p className="wr-clock" aria-label="Event clock">
              {now === null ? "--:--:--" : phase === "live" && clock.remaining ? clock.remaining : (clock.elapsed ?? "--:--:--")}
              <span>{phase === "live" && clock.remaining ? "left" : "elapsed"}</span>
            </p>
            {clock.fraction !== null ? (
              <div className="wr-bar" role="img" aria-label={`${pct(clock.fraction)} of the event has elapsed`}>
                <i style={{ width: pct(clock.fraction) }} />
              </div>
            ) : null}
          </div>
          <ul className="wr-key" aria-label="Legend">
            <li className="is-heat">
              <i /> teams working here
            </li>
            <li className="is-stuck">
              <i /> stuck
            </li>
            <li className="is-done">
              <i /> everyone through
            </li>
            <li className="is-dim">
              <i /> not reached
            </li>
          </ul>
          <div className="wr-tools">
            {traffic?.available ? (
              <button type="button" className={cn("wr-btn", traffic.running && "is-on")} onClick={toggleTraffic} aria-pressed={traffic.running} title={`Demo teams keep playing through the real engine${traffic.spare ? ` (never as ${traffic.spare})` : ""}. For showcases only.`}>
                <Radio className="size-3.5" aria-hidden="true" /> <span className="wr-lbl">{traffic.running ? "Stop demo traffic" : "Demo traffic"}</span>
              </button>
            ) : null}
            <Link href="/display" target="_blank" className="wr-btn">
              <Monitor className="size-3.5" aria-hidden="true" /> <span className="wr-lbl">Projector</span>
            </Link>
            <button type="button" className="wr-btn" onClick={toggleWall} aria-pressed={wall}>
              {wall ? <Minimize2 className="size-3.5" aria-hidden="true" /> : <Expand className="size-3.5" aria-hidden="true" />} <span className="wr-lbl">{wall ? "Exit wall" : "Wall mode"}</span>
            </button>
          </div>
          {banner ? (
            <div key={banner.key} className="wr-break" role="status">
              <Activity className="size-4" aria-hidden="true" />
              <b>{banner.team}</b>
              <span>solved</span>
              <em>{banner.title}</em>
            </div>
          ) : null}
        </div>

        <aside className="wr-side" aria-label="Status">
          <dl className="wr-nums">
            <div>
              <dt>Active</dt>
              <dd className="num">
                {cr.activeTeams}
                <small>/{cr.totalTeams}</small>
              </dd>
            </div>
            <div>
              <dt>Through</dt>
              <dd className="num">{pct(cr.avgCompletion)}</dd>
            </div>
            <div>
              <dt>Tries/min</dt>
              <dd className="num">{stats.submissionsPerMin}</dd>
            </div>
            <div>
              <dt>{stuckTeams ? "Stuck" : "Hints/h"}</dt>
              <dd className={cn("num", stuckTeams > 0 && "is-warn")}>{stuckTeams || cr.hintsLastHour}</dd>
            </div>
          </dl>

          <div className="wr-pulse">
            <p className="wr-h">
              The last hour
              <span className="num">
                {sumAttempts} attempt{sumAttempts === 1 ? "" : "s"} · {sumCorrect} right
              </span>
            </p>
            {sumAttempts === 0 ? <p className="wr-clear">No attempts in the last hour.</p> : null}
            <svg className={sumAttempts === 0 ? "hidden" : undefined} viewBox={`0 0 ${cr.pulse.length * 14} 44`} preserveAspectRatio="none" role="img" aria-label={`Attempts and correct answers in five-minute buckets over the last hour: ${sumAttempts} attempts, ${sumCorrect} correct`}>
              {cr.pulse.map((b, i) => {
                const h = (b.attempts / peak) * 40;
                const g = (b.correct / peak) * 40;
                return (
                  <g key={b.at} transform={`translate(${i * 14 + 1} 0)`}>
                    <rect x={0} y={42 - h} width={11} height={Math.max(b.attempts ? 1.5 : 0.6, h)} className="wr-bar-all" />
                    <rect x={0} y={42 - g} width={11} height={g} className="wr-bar-ok" />
                  </g>
                );
              })}
            </svg>
          </div>

          <div className="wr-attn">
            <p className="wr-h">
              Needs attention
              <span className="num">{attn.length ? attn.length : "all clear"}</span>
            </p>
            {attn.length === 0 ? (
              <p className="wr-clear">Nothing needs you. Every file is inside its estimate and no team is stuck.</p>
            ) : (
              <ul>
                {attn.map((a) => (
                  <li key={a.id}>
                    <button type="button" className={cn("wr-item", `is-${a.severity}`)} onClick={() => focus(a.node)} disabled={!a.node}>
                      <i aria-hidden="true" />
                      <b>{a.title}</b>
                      <span>{a.detail}</span>
                      <span className="sr-only">{a.severity}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="wr-feed">
            <p className="wr-h">
              Activity
              <span className="num">{live.length ? "now" : "recent"}</span>
            </p>
            <ol aria-live="off">
              {live.map((l) => (
                <li key={l.key} className={cn("is-" + l.tone, l.fresh && "is-fresh")}>
                  <b>{l.team}</b> {l.text}
                </li>
              ))}
              {cr.feed.slice(0, Math.max(3, 12 - live.length)).map((f, i) => (
                <li key={`${f.at}-${i}`} className="is-old">
                  <b>{f.team}</b> {f.text}
                  <time>
                    <LocalTime iso={f.at} />
                  </time>
                </li>
              ))}
              {live.length === 0 && cr.feed.length === 0 ? <li className="is-old">Quiet. The first move will appear here.</li> : null}
            </ol>
          </div>
        </aside>
      </section>

      {!wall ? <div className="wr-detail">{children}</div> : null}
    </div>
  );
}

/** What the operator learns by clicking a file: who is on it, how it is going, how it compares with its estimate. */
function NodeInspector({ n, cr }: { n: UNode; cr: ControlRoom }) {
  const t = cr.nodes.find((x) => x.id === n.id);
  const here = cr.teams.filter((x) => x.current?.id === n.id);
  if (!t) return null;
  const slow = t.medianMinutes !== null && t.medianMinutes > t.expectedMinutes * 2;
  return (
    <div className="space-y-2.5">
      <p className="label-mono flex flex-wrap gap-x-2">
        <span>{t.round}</span>
        <span className="text-faint">·</span>
        <span>{t.primitive}</span>
        {t.critical ? <span className="text-signal-amber">critical path</span> : null}
      </p>
      <h3 className="text-lg leading-tight font-semibold">{t.title}</h3>
      <dl className="grid grid-cols-4 gap-2 font-mono">
        {(
          [
            ["reached", t.unlocked, ""],
            ["solved", t.solved, ""],
            ["stuck", t.stuck, t.stuck ? "text-signal-amber" : ""],
            ["wrong", t.wrong, ""],
          ] as const
        ).map(([k, v, tone]) => (
          <div key={k}>
            <dt className="text-[0.55rem] tracking-[0.14em] text-faint uppercase">{k}</dt>
            <dd className={cn("num text-xl font-semibold", tone)}>{v}</dd>
          </div>
        ))}
      </dl>
      <p className={cn("font-mono text-xs", slow ? "text-signal-amber" : "text-ink-dim")}>
        median {t.medianMinutes ?? "—"} min · p90 {t.p90Minutes ?? "—"} min <span className="text-faint">vs {t.expectedMinutes} min expected</span>
      </p>
      <p className="font-mono text-xs text-mute">
        {t.attempts ? `${pct(t.failureRate)} of ${t.attempts} attempts missed` : "no attempts yet"} · {t.unlocked ? `${pct(t.hintRate)} asked for a hint` : "not reached"}
      </p>
      {here.length ? (
        <p className="text-xs text-ink-dim">
          <span className="font-mono text-faint">On it now </span>
          {here.map((x) => x.name).join(", ")}
        </p>
      ) : null}
    </div>
  );
}
