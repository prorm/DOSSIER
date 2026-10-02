"use client";

import { Archive, Check, Download, FileText, GitBranch, Pause, Play, Radio, Terminal, Waves } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AnswerForm } from "@/components/dossier/answer-form";
import { summarisePcap, type PcapSummary } from "@/lib/experience/pcap";
import { teamDressing } from "@/lib/experience/variation";
import { cn } from "@/lib/utils";
import type { ArtifactLink, StageContext } from "./types";
import { Chip, Question, Window } from "./window";

export type ArtifactKind = "image" | "audio" | "pdf" | "archive" | "mail" | "capture" | "text";

export function artifactKind(a: { mime: string; name: string }): ArtifactKind {
  const m = a.mime.toLowerCase();
  const n = a.name.toLowerCase();
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("audio/") || /\.(wav|mp3|ogg|flac)$/.test(n)) return "audio";
  if (m.includes("pdf") || n.endsWith(".pdf")) return "pdf";
  if (m.includes("zip") || /\.(zip|7z|tar|gz)$/.test(n)) return "archive";
  if (m.includes("rfc822") || n.endsWith(".eml")) return "mail";
  if (m.includes("pcap") || /\.pcap(ng)?$/.test(n)) return "capture";
  return "text";
}

const fmt = (kind: ArtifactKind) => ({ image: "IMG", audio: "AUDIO", pdf: "PDF", archive: "ARCHIVE", mail: "EML", capture: "PCAP", text: "FILE" })[kind];

function Retrieved({ a }: { a: ArtifactLink }) {
  return a.obtained ? (
    <Chip tone="ok">
      <Check className="size-3" /> retrieved
    </Chip>
  ) : (
    <Chip>sealed bag</Chip>
  );
}

function Download_({ a, label = "Retrieve" }: { a: ArtifactLink; label?: string }) {
  // A plain link: the server answers with Content-Disposition: attachment.
  return (
    <a href={a.url} className="chip-btn is-primary">
      <Download className="size-3" aria-hidden="true" /> {label}
    </a>
  );
}

/* ─────────────────────────── photograph ─────────────────────────── */

function PhotoPrint({ a, tag }: { a: ArtifactLink; tag: string }) {
  const box = useRef<HTMLDivElement>(null);
  const img = useRef<HTMLImageElement>(null);
  const [loupe, setLoupe] = useState<{ x: number; y: number; px: number; py: number; w: number; h: number } | null>(null);
  const [bad, setBad] = useState(false);
  const R = 74;
  const Z = 2.6;
  const move = (e: React.PointerEvent) => {
    const el = img.current;
    const b = box.current?.getBoundingClientRect();
    if (!el || !b) return;
    const x = e.clientX - b.left;
    const y = e.clientY - b.top;
    setLoupe({ x, y, px: x / b.width, py: y / b.height, w: b.width, h: b.height });
  };
  return (
    <figure className="print">
      <span className="print-tape" aria-hidden="true" />
      <div ref={box} className="print-img" onPointerMove={move} onPointerLeave={() => setLoupe(null)}>
        {bad ? (
          <div className="grid h-40 place-items-center font-mono text-xs text-mute">Preview unavailable — retrieve the file.</div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img ref={img} src={a.url} alt={a.description || a.name} onError={() => setBad(true)} draggable={false} />
        )}
        {loupe && !bad ? (
          <span
            className="loupe"
            aria-hidden="true"
            style={{
              width: R * 2,
              height: R * 2,
              left: loupe.x - R,
              top: loupe.y - R,
              backgroundImage: `url(${a.url})`,
              backgroundSize: `${loupe.w * Z}px ${loupe.h * Z}px`,
              backgroundPosition: `${-(loupe.px * loupe.w * Z - R)}px ${-(loupe.py * loupe.h * Z - R)}px`,
            }}
          />
        ) : null}
      </div>
      <figcaption>
        <span className="font-mono text-[0.7rem]">{a.name}</span>
        <span className="font-mono text-[0.58rem] tracking-[0.14em] text-faint">{tag}</span>
      </figcaption>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Retrieved a={a} />
        <Download_ a={a} label="Retrieve original" />
      </div>
      <p className="mt-2 font-mono text-[0.6rem] text-faint">Move over the print to magnify. The original file holds more than the print shows.</p>
    </figure>
  );
}

/* ─────────────────────────── intercepted recording ─────────────────────────── */

interface Peaks {
  lanes: Float32Array[];
  seconds: number;
}

async function loadPeaks(url: string, bins = 260): Promise<Peaks | null> {
  try {
    const res = await fetch(url, { credentials: "same-origin" });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    const ctx = new AC();
    const audio = await ctx.decodeAudioData(buf.slice(0));
    void ctx.close();
    const lanes: Float32Array[] = [];
    for (let c = 0; c < Math.min(2, audio.numberOfChannels); c++) {
      const data = audio.getChannelData(c);
      const step = Math.max(1, Math.floor(data.length / bins));
      const p = new Float32Array(bins);
      for (let i = 0; i < bins; i++) {
        let m = 0;
        for (let j = i * step; j < Math.min(data.length, (i + 1) * step); j += Math.max(1, step >> 5)) m = Math.max(m, Math.abs(data[j]!));
        p[i] = m;
      }
      lanes.push(p);
    }
    return { lanes, seconds: audio.duration };
  } catch {
    return null;
  }
}

function AudioDeck({ a, tag }: { a: ArtifactLink; tag: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const [peaks, setPeaks] = useState<Peaks | null>(null);
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const [elementDuration, setElementDuration] = useState(0);

  useEffect(() => {
    let alive = true;
    void loadPeaks(a.url).then((p) => alive && setPeaks(p));
    return () => {
      alive = false;
    };
  }, [a.url]);

  const dur = peaks?.seconds ?? elementDuration;

  const draw = useCallback(() => {
    const c = canvas.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = c.clientWidth;
    const h = c.clientHeight;
    if (c.width !== w * dpr) {
      c.width = w * dpr;
      c.height = h * dpr;
    }
    const g = c.getContext("2d")!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const cs = getComputedStyle(c);
    const accent = cs.getPropertyValue("--accent").trim() || "#39ff88";
    const dim = cs.getPropertyValue("--color-line-strong").trim() || "#2a3d50";
    const ink = cs.getPropertyValue("--color-mute").trim() || "#7f93a8";
    const lanes = peaks?.lanes ?? [];
    const laneH = h / Math.max(1, lanes.length || 2);
    const prog = dur ? t / dur : 0;
    (lanes.length ? lanes : [new Float32Array(0), new Float32Array(0)]).forEach((lane, li) => {
      const mid = laneH * li + laneH / 2;
      g.strokeStyle = dim;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(0, mid);
      g.lineTo(w, mid);
      g.stroke();
      const n = lane.length || 1;
      for (let i = 0; i < lane.length; i++) {
        const x = (i / n) * w;
        const amp = Math.max(1, lane[i]! * (laneH * 0.46));
        g.strokeStyle = i / n <= prog ? accent : ink;
        g.globalAlpha = i / n <= prog ? 1 : 0.55;
        g.lineWidth = Math.max(1, w / n - 1);
        g.beginPath();
        g.moveTo(x, mid - amp);
        g.lineTo(x, mid + amp);
        g.stroke();
      }
      g.globalAlpha = 1;
      g.fillStyle = ink;
      g.font = "10px ui-monospace, monospace";
      g.fillText(lanes.length === 1 ? "MONO" : li === 0 ? "L" : "R", 6, laneH * li + 12);
    });
    g.strokeStyle = accent;
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(prog * w, 0);
    g.lineTo(prog * w, h);
    g.stroke();
  }, [peaks, t, dur]);

  useEffect(() => {
    draw();
  }, [draw]);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      setT(audio.current?.currentTime ?? 0);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const seek = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const b = e.currentTarget.getBoundingClientRect();
    const el = audio.current;
    if (el && dur) {
      el.currentTime = ((e.clientX - b.left) / b.width) * dur;
      setT(el.currentTime);
    }
  };

  return (
    <div className="deck-unit">
      <div className="deck-head">
        <Radio className="size-4 text-signal-2" aria-hidden="true" />
        <span className="font-display text-sm font-semibold">Intercepted recording</span>
        <span className="ml-auto font-mono text-[0.6rem] tracking-[0.14em] text-faint">{tag}</span>
      </div>
      <canvas ref={canvas} className="deck-wave" onPointerDown={seek} role="img" aria-label="Waveform of the recording, left and right channels" />
      <audio ref={audio} src={a.url} preload="metadata" onEnded={() => setPlaying(false)} onLoadedMetadata={(e) => (setT(0), setElementDuration(Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : 0))} />
      <div className="deck-ctl">
        <button
          type="button"
          className="deck-play"
          aria-label={playing ? "Pause" : "Play"}
          onClick={() => {
            const el = audio.current;
            if (!el) return;
            if (el.paused) void el.play().then(() => setPlaying(true));
            else {
              el.pause();
              setPlaying(false);
            }
          }}
        >
          {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
        </button>
        <span className="num text-xs text-ink-dim">
          {t.toFixed(1)}s <span className="text-faint">/ {dur ? dur.toFixed(1) : "—"}s</span>
        </span>
        <span className="ml-auto flex items-center gap-2">
          <Retrieved a={a} />
          <Download_ a={a} label="Retrieve original" />
        </span>
      </div>
      <p className="font-mono text-[0.6rem] text-faint">What you hear is on the tape; how it is stored is in the file. Open the original with your own tools.</p>
    </div>
  );
}

/* ─────────────────────────── documents and bags ─────────────────────────── */

function DocumentSheet({ a, tag, kind }: { a: ArtifactLink; tag: string; kind: ArtifactKind }) {
  return (
    <div className="sheet-doc">
      <span className="sheet-fold" aria-hidden="true" />
      <p className="sheet-stamp" aria-hidden="true">
        EXHIBIT {tag.split("-")[1]}
      </p>
      <FileText className="size-7 text-signal-2" aria-hidden="true" />
      <p className="mt-2 font-display text-[0.95rem] font-semibold">{a.name}</p>
      <p className="text-[0.8rem] text-ink-dim">{a.description}</p>
      <div className="sheet-lines" aria-hidden="true">
        <i /> <i /> <i style={{ width: "72%" }} /> <i style={{ width: "58%" }} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Chip tone="info">{fmt(kind)}</Chip>
        <Retrieved a={a} />
        <Download_ a={a} />
      </div>
    </div>
  );
}

function EvidenceBag({ a, tag, kind }: { a: ArtifactLink; tag: string; kind: ArtifactKind }) {
  const Icon = kind === "archive" ? Archive : kind === "capture" ? Waves : kind === "text" ? Terminal : FileText;
  return (
    <div className="bag">
      <span className="bag-seal" aria-hidden="true" />
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 size-6 shrink-0 text-signal-2" aria-hidden="true" />
        <div className="min-w-0">
          <p className="truncate font-display text-[0.92rem] font-semibold">{a.name}</p>
          <p className="text-[0.78rem] text-ink-dim">{a.description}</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Chip tone="info">{fmt(kind)}</Chip>
        <span className="font-mono text-[0.58rem] tracking-[0.14em] text-faint">{tag}</span>
        <Retrieved a={a} />
        <span className="ml-auto">
          <Download_ a={a} />
        </span>
      </div>
    </div>
  );
}

export function ArtifactBench({ items, fingerprint }: { items: ArtifactLink[]; fingerprint: string }) {
  const dress = useMemo(() => teamDressing(fingerprint), [fingerprint]);
  if (!items.length) return <p className="font-mono text-xs text-mute">No exhibits were generated for this file.</p>;
  return (
    <ul className="bench" aria-label="Exhibits">
      {items.map((a) => {
        const kind = artifactKind(a);
        const tag = dress.exhibitTag(a.name);
        return (
          <li key={a.url} className={cn("bench-item", `is-${kind}`)}>
            {kind === "image" ? <PhotoPrint a={a} tag={tag} /> : kind === "audio" ? <AudioDeck a={a} tag={tag} /> : kind === "pdf" || kind === "mail" ? <DocumentSheet a={a} tag={tag} kind={kind} /> : <EvidenceBag a={a} tag={tag} kind={kind} />}
          </li>
        );
      })}
    </ul>
  );
}

function Tools({ tools, title = "Bench instruments" }: { tools: string[]; title?: string }) {
  if (!tools.length) return null;
  return (
    <div>
      <p className="label-mono mb-2">{title}</p>
      <ul className="flex flex-wrap gap-1.5">
        {tools.map((t) => (
          <li key={t}>
            <Chip tone="info">{t}</Chip>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ForensicsStage({ ctx }: { ctx: StageContext }) {
  const v = ctx.view as { question?: string; answerFormat?: string };
  return (
    <div className="space-y-5">
      <Window variant="lens" title="Evidence bench" subtitle={`${ctx.artifacts.length} exhibit${ctx.artifacts.length === 1 ? "" : "s"}`} bodyClassName="p-4 sm:p-6">
        <ArtifactBench items={ctx.artifacts} fingerprint={ctx.fingerprint} />
      </Window>
      <div className="grid gap-5 [&>*]:min-w-0 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Question q={v.question} format={v.answerFormat} />
          <AnswerForm nodeId={ctx.nodeId} disabledReason={ctx.disabledReason} hint={v.answerFormat} />
        </div>
        <div className="space-y-4">
          <Tools tools={ctx.tools} />
          <p className="font-mono text-[0.68rem] text-faint">Files are generated for your team only. Links are signed and expire; reload the page to refresh them. Open them with your own tools.</p>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── git ─────────────────────────── */

function CopyCmd({ cmd }: { cmd: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="cmd"
      onClick={() => {
        void navigator.clipboard?.writeText(cmd);
        setDone(true);
        setTimeout(() => setDone(false), 1100);
      }}
      title="Copy"
    >
      <span aria-hidden="true">$</span> {cmd} <em>{done ? "copied" : "copy"}</em>
    </button>
  );
}

export function GitStage({ ctx }: { ctx: StageContext }) {
  const v = ctx.view as { question?: string; answerFormat?: string };
  const repo = ctx.artifacts[0];
  const commands = ctx.tools.flatMap((t) => t.split(/\s\/\s/)).filter((t) => /^git\s/.test(t));
  return (
    <div className="space-y-5">
      <Window variant="term" icon={GitBranch} title={repo ? repo.name.replace(/\.zip$/, "") : "repository"} subtitle="snapshot · working tree + .git" bodyClassName="p-4 sm:p-5">
        <div className="grid gap-5 [&>*]:min-w-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div>{repo ? <ArtifactBench items={[repo]} fingerprint={ctx.fingerprint} /> : null}</div>
          <div className="space-y-3">
            <p className="label-mono">Where evidence hides in a repository</p>
            <ul className="space-y-2 text-[0.84rem] text-ink-dim">
              <li>› what changed, and who changed it — and what changed <em>back</em></li>
              <li>› branches nobody merged, and tags somebody annotated</li>
              <li>› history that was rewritten, and what the reflog still remembers</li>
            </ul>
            {commands.length ? (
              <div>
                <p className="label-mono mb-2">Toolbox</p>
                <div className="flex flex-col items-start gap-1.5">
                  {commands.map((c) => (
                    <CopyCmd key={c} cmd={c} />
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </Window>
      <div className="max-w-3xl space-y-4">
        <Question q={v.question} format={v.answerFormat} />
        <AnswerForm nodeId={ctx.nodeId} disabledReason={ctx.disabledReason} hint={v.answerFormat} />
      </div>
    </div>
  );
}

/* ─────────────────────────── network capture ─────────────────────────── */

function TrafficScope({ url }: { url: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [s, setS] = useState<PcapSummary | null | "err">(null);
  useEffect(() => {
    let alive = true;
    fetch(url, { credentials: "same-origin" })
      .then((r) => r.arrayBuffer())
      .then((b) => alive && setS(summarisePcap(b) ?? "err"))
      .catch(() => alive && setS("err"));
    return () => {
      alive = false;
    };
  }, [url]);
  useEffect(() => {
    const c = canvas.current;
    if (!c || !s || s === "err") return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = c.clientWidth;
    const h = c.clientHeight;
    c.width = w * dpr;
    c.height = h * dpr;
    const g = c.getContext("2d")!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cs = getComputedStyle(c);
    const accent = cs.getPropertyValue("--accent").trim() || "#39ff88";
    const line = cs.getPropertyValue("--color-line").trim() || "#1c2a38";
    const max = Math.max(1, ...s.bins);
    g.strokeStyle = line;
    g.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      g.beginPath();
      g.moveTo(0, (h / 4) * i);
      g.lineTo(w, (h / 4) * i);
      g.stroke();
    }
    const bw = w / s.bins.length;
    s.bins.forEach((b, i) => {
      const bh = (b / max) * (h - 6);
      g.fillStyle = accent;
      g.globalAlpha = b ? 0.35 + 0.65 * (b / max) : 0.08;
      g.fillRect(i * bw + 1, h - Math.max(2, bh), Math.max(1, bw - 2), Math.max(2, bh));
    });
  }, [s]);
  const mm = (n: number) => (n >= 1024 ? `${(n / 1024).toFixed(1)} KB` : `${n} B`);
  return (
    <div className="scope">
      <div className="scope-stats">
        <div>
          <b className="num">{s && s !== "err" ? s.packets : "—"}</b>
          <span>packets</span>
        </div>
        <div>
          <b className="num">{s && s !== "err" ? `${s.durationSec.toFixed(s.durationSec < 10 ? 1 : 0)}s` : "—"}</b>
          <span>span</span>
        </div>
        <div>
          <b className="num">{s && s !== "err" ? mm(s.bytes) : "—"}</b>
          <span>on the wire</span>
        </div>
        <div>
          <b className="num">{s && s !== "err" ? `${s.minLen}–${s.maxLen}` : "—"}</b>
          <span>frame bytes</span>
        </div>
      </div>
      <canvas ref={canvas} className={cn("scope-plot", s === null && "animate-pulse")} role="img" aria-label="Traffic volume over the capture" />
      <p className="font-mono text-[0.6rem] text-faint">{s === "err" ? "Could not read the capture header." : s === null ? "Reading the capture's record headers…" : "Capture properties only — the payloads are yours to reassemble."}</p>
    </div>
  );
}

export function CaptureStage({ ctx }: { ctx: StageContext }) {
  const v = ctx.view as { question?: string; answerFormat?: string };
  const cap = ctx.artifacts.find((a) => artifactKind(a) === "capture") ?? ctx.artifacts[0];
  return (
    <div className="space-y-5">
      <Window variant="term" icon={Waves} title="Captured incident" subtitle={cap?.name} bodyClassName="p-4 sm:p-5">
        <div className="grid gap-5 [&>*]:min-w-0 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          {cap ? <TrafficScope url={cap.url} /> : null}
          <div className="space-y-4">
            {cap ? <ArtifactBench items={[cap]} fingerprint={ctx.fingerprint} /> : null}
            <Tools tools={ctx.tools} title="Analyst kit" />
          </div>
        </div>
      </Window>
      <div className="max-w-3xl space-y-4">
        <Question q={v.question} format={v.answerFormat} />
        <AnswerForm nodeId={ctx.nodeId} disabledReason={ctx.disabledReason} hint={v.answerFormat} />
      </div>
    </div>
  );
}
