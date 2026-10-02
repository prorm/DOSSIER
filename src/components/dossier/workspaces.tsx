"use client";

import {
  ArrowDown,
  ArrowUp,
  Ban,
  Check,
  Download,
  ExternalLink,
  FileDown,
  Globe,
  Loader2,
  LocateFixed,
  MapPin,
  MessageSquare,
  Network,
  Play,
  QrCode,
  ScanSearch,
  Scale,
  TerminalSquare,
  Undo2,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { AnswerForm, Outcome, useNodeAction } from "./answer-form";
import { Markdown } from "./markdown-client";

/* ─────────────────────────── shared bits ─────────────────────────── */

export interface ArtifactLink {
  name: string;
  mime: string;
  description: string;
  url: string;
}

function fmtKind(mime: string) {
  if (mime.includes("zip")) return "ZIP";
  if (mime.includes("pdf")) return "PDF";
  if (mime.includes("wav")) return "WAV";
  if (mime.includes("jpeg")) return "JPG";
  if (mime.includes("png")) return "PNG";
  if (mime.includes("pcap")) return "PCAP";
  if (mime.includes("rfc822")) return "EML";
  if (mime.includes("sql")) return "SQL";
  if (mime.includes("csv")) return "CSV";
  return "FILE";
}

/** Solved files keep their site reachable: later deductions often need a second look. */
export function SiteRevisit({ site }: { site: { url: string; title: string } }) {
  return (
    <a href={site.url} target="_blank" rel="noopener noreferrer" className="pressable panel flex items-center gap-3 px-3 py-2.5 hover:border-line-strong">
      <Globe className="size-5 shrink-0 text-signal-2" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-mono text-sm">{site.title}</span>
        <span className="block text-xs text-mute">Revisit the sandbox site</span>
      </span>
      <ExternalLink className="size-4 text-mute" aria-hidden="true" />
    </a>
  );
}

export function Artifacts({ items }: { items: ArtifactLink[] }) {
  if (!items.length) return null;
  return (
    <section aria-labelledby="art-h" className="space-y-2">
      <h2 id="art-h" className="label-mono flex items-center gap-2">
        <FileDown className="size-3.5" aria-hidden="true" /> Evidence files
      </h2>
      <ul className="grid gap-2 sm:grid-cols-2">
        {items.map((a) => (
          <li key={a.url}>
            {/* Plain link: the server responds with Content-Disposition: attachment. */}
            <a href={a.url} className="pressable panel flex items-center gap-3 px-3 py-2.5 hover:border-line-strong">
              <span className="grid h-9 w-11 shrink-0 place-items-center rounded-xs border border-line-strong font-mono text-[0.62rem] font-bold text-signal-2">{fmtKind(a.mime)}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-mono text-sm">{a.name}</span>
                <span className="block truncate text-xs text-mute">{a.description}</span>
              </span>
              <Download className="size-4 text-mute" aria-hidden="true" />
            </a>
          </li>
        ))}
      </ul>
      <p className="font-mono text-[0.65rem] text-faint">Files are generated for your team only. Links are signed and expire; reload the page to refresh them. Open them with your own tools.</p>
    </section>
  );
}

function Question({ q, format }: { q?: string; format?: string }) {
  if (!q) return null;
  return (
    <div className="panel border-[color-mix(in_srgb,var(--accent-2)_35%,var(--color-line))] p-4">
      <p className="label-mono mb-1">Question</p>
      <p className="text-[0.95rem] text-ink">{q}</p>
      {format ? <p className="mt-1 font-mono text-xs text-mute">Answer format: {format}</p> : null}
    </div>
  );
}

/* ─────────────────────────── cryptic ─────────────────────────── */

export function CrypticWorkspace({ nodeId, view, disabledReason }: { nodeId: string; view: { total: number; solvedSteps: number; steps: { index: number; prompt: string; reveal: string | null; solved: boolean }[] }; disabledReason: string | null }) {
  return (
    <div className="space-y-4">
      <ol className="space-y-3">
        {view.steps.map((s) => (
          <li key={s.index} className={cn("panel p-4", s.solved && "opacity-80")}>
            <p className="label-mono mb-2 flex items-center gap-2">
              Clue {s.index + 1} / {view.total} {s.solved ? <Check className="size-3.5 text-signal-green" aria-label="solved" /> : null}
            </p>
            <Markdown>{s.prompt}</Markdown>
            {s.reveal ? <p className="mt-3 border-t border-line pt-2 font-mono text-xs text-signal-2">↳ {s.reveal}</p> : null}
          </li>
        ))}
      </ol>
      <AnswerForm nodeId={nodeId} disabledReason={disabledReason} label={`Resolve clue ${Math.min(view.total, view.solvedSteps + 1)}`} />
    </div>
  );
}

/* ─────────────────────────── synthetic site ─────────────────────────── */

export function SiteWorkspace({
  nodeId,
  site,
  question,
  answerFormat,
  secretName,
  discoveries,
  disabledReason,
}: {
  nodeId: string;
  site: { url: string; title: string };
  question?: string;
  answerFormat?: string;
  secretName?: string;
  discoveries: string[];
  disabledReason: string | null;
}) {
  return (
    <div className="space-y-4">
      <div className="panel flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <Globe className="size-8 shrink-0 text-signal-2" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="font-mono text-sm font-semibold">{site.title}</p>
          <p className="text-xs text-mute">A live service inside the DOSSIER sandbox, generated for your team. Your browser&apos;s developer tools work on it; nothing there touches real accounts.</p>
        </div>
        <Button asChild variant="signal">
          <a href={site.url} target="_blank" rel="noopener noreferrer">
            Open site <ExternalLink aria-hidden="true" />
          </a>
        </Button>
      </div>
      {discoveries.length ? (
        <div className="panel p-4">
          <p className="label-mono mb-2 flex items-center gap-2">
            <ScanSearch className="size-3.5" aria-hidden="true" /> Logged discoveries
          </p>
          <ul className="flex flex-wrap gap-2">
            {discoveries.map((d) => (
              <Badge key={d} variant="info">
                {d}
              </Badge>
            ))}
          </ul>
        </div>
      ) : null}
      <Question q={question} format={answerFormat} />
      <AnswerForm nodeId={nodeId} disabledReason={disabledReason} label={secretName ? `Submit the ${secretName}` : "Submit answer"} hint={answerFormat} />
    </div>
  );
}

/* ─────────────────────────── artifacts ─────────────────────────── */

export function ArtifactWorkspace({ nodeId, question, answerFormat, artifacts, disabledReason }: { nodeId: string; question?: string; answerFormat?: string; artifacts: ArtifactLink[]; disabledReason: string | null }) {
  return (
    <div className="space-y-4">
      <Artifacts items={artifacts} />
      <Question q={question} format={answerFormat} />
      <AnswerForm nodeId={nodeId} disabledReason={disabledReason} hint={answerFormat} />
    </div>
  );
}

/* ─────────────────────────── SQL console ─────────────────────────── */

interface SqlResult {
  columns: string[];
  rows: unknown[][];
  rowCount: number;
  truncated: boolean;
  ms: number;
}

export function SqlWorkspace({
  nodeId,
  view,
  artifacts,
  disabledReason,
}: {
  nodeId: string;
  view: { question: string; answerFormat: string; tables: { name: string; columns: string[]; rows: number }[]; queries: number };
  artifacts: ArtifactLink[];
  disabledReason: string | null;
}) {
  const [sql, setSql] = useState("SELECT * FROM employees LIMIT 10");
  const [result, setResult] = useState<SqlResult | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const { ui, run, now } = useNodeAction(nodeId);
  const exec = async () => {
    const r = await run({ type: "query", sql });
    const res = r?.feedback.data?.result as SqlResult | undefined;
    if (res) {
      setResult(res);
      setHistory((h) => [sql, ...h.filter((x) => x !== sql)].slice(0, 8));
    }
  };
  return (
    <div className="space-y-4">
      <Question q={view.question} format={view.answerFormat} />
      <div className="grid gap-4 [&>*]:min-w-0 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="panel max-h-96 overflow-y-auto p-3">
          <p className="label-mono mb-2">Schema</p>
          <ul className="space-y-2 font-mono text-xs">
            {view.tables.map((t) => (
              <li key={t.name}>
                <button type="button" className="text-signal-2 hover:underline" onClick={() => setSql(`SELECT * FROM ${t.name} LIMIT 20`)}>
                  {t.name}
                </button>{" "}
                <span className="text-faint">({t.rows})</span>
                <div className="pl-2 text-mute">{t.columns.join(", ")}</div>
              </li>
            ))}
          </ul>
        </aside>
        <div className="space-y-2">
          <label className="label-mono flex items-center gap-2" htmlFor="sql-in">
            <TerminalSquare className="size-3.5" aria-hidden="true" /> Query console (read-only sandbox)
          </label>
          <Textarea
            id="sql-in"
            value={sql}
            onChange={(e) => setSql(e.target.value)}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === "Enter") void exec();
            }}
            spellCheck={false}
            className="min-h-32 font-mono text-sm"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={exec} disabled={ui.kind === "pending" || Boolean(disabledReason) || !sql.trim()} size="sm">
              {ui.kind === "pending" ? <Loader2 className="animate-spin" /> : <Play />} Run <kbd className="ml-1 text-[0.6rem] opacity-70">Ctrl+Enter</kbd>
            </Button>
            {history.length ? (
              <select className="h-8 max-w-64 rounded-xs border border-line bg-bg px-2 font-mono text-xs" onChange={(e) => e.target.value && setSql(e.target.value)} value="" aria-label="Query history">
                <option value="">history…</option>
                {history.map((h) => (
                  <option key={h} value={h}>
                    {h.slice(0, 60)}
                  </option>
                ))}
              </select>
            ) : null}
            <span className="font-mono text-[0.65rem] text-faint">{view.queries} queries run</span>
          </div>
          {ui.kind === "error" || ui.kind === "cooldown" ? <Outcome ui={ui} now={now} /> : null}
          {result ? (
            <div className="panel overflow-x-auto p-0">
              <table className="w-full min-w-max font-mono text-xs">
                <thead>
                  <tr className="border-b border-line text-left text-mute">
                    {result.columns.map((c) => (
                      <th key={c} className="px-3 py-2 font-medium">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((r, i) => (
                    <tr key={i} className="border-b border-line/60">
                      {r.map((v, j) => (
                        <td key={j} className="px-3 py-1.5 whitespace-nowrap">
                          {v === null ? <span className="text-faint">NULL</span> : String(v)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="border-t border-line px-3 py-1.5 font-mono text-[0.65rem] text-faint">
                {result.rowCount} row{result.rowCount === 1 ? "" : "s"} · {result.ms} ms{result.truncated ? " · showing first 200" : ""}
              </p>
            </div>
          ) : null}
        </div>
      </div>
      <Artifacts items={artifacts} />
      <AnswerForm nodeId={nodeId} disabledReason={disabledReason} hint={view.answerFormat} />
    </div>
  );
}

/* ─────────────────────────── timeline ─────────────────────────── */

interface TlCard {
  id: string;
  label: string;
  source: string;
  shown: string;
  confidence: string;
}

export function TimelineWorkspace({ nodeId, view, disabledReason }: { nodeId: string; view: { prompt: string; referenceTz: string; events: TlCard[]; missing: number; best: number }; disabledReason: string | null }) {
  const [order, setOrder] = useState<string[]>(view.events.map((e) => e.id));
  const [discard, setDiscard] = useState<string[]>([]);
  const { ui, run, now } = useNodeAction(nodeId);
  const byId = useMemo(() => new Map(view.events.map((e) => [e.id, e])), [view.events]);
  const move = (id: string, d: -1 | 1) =>
    setOrder((o) => {
      const i = o.indexOf(id);
      const j = i + d;
      if (i < 0 || j < 0 || j >= o.length) return o;
      const n = [...o];
      [n[i], n[j]] = [n[j]!, n[i]!];
      return n;
    });
  const toggle = (id: string) => {
    if (discard.includes(id)) {
      setDiscard((d) => d.filter((x) => x !== id));
      setOrder((o) => [...o, id]);
    } else {
      setDiscard((d) => [...d, id]);
      setOrder((o) => o.filter((x) => x !== id));
    }
  };
  const card = (e: TlCard, i: number | null) => (
    <li key={e.id} className="panel flex items-start gap-3 p-3">
      {i !== null ? <span className="num w-6 pt-0.5 text-sm text-signal">{i + 1}</span> : <Ban className="mt-0.5 size-4 text-signal-magenta" aria-hidden="true" />}
      <div className="min-w-0 flex-1">
        <p className="text-sm text-ink">{e.label}</p>
        <p className="font-mono text-xs text-mute">
          {e.source}: <span className="text-signal-2">{e.shown}</span> · confidence {e.confidence}
        </p>
      </div>
      {i !== null ? (
        <div className="flex flex-col gap-1">
          <Button size="icon-sm" variant="ghost" aria-label={`Move ${e.label} earlier`} onClick={() => move(e.id, -1)}>
            <ArrowUp />
          </Button>
          <Button size="icon-sm" variant="ghost" aria-label={`Move ${e.label} later`} onClick={() => move(e.id, 1)}>
            <ArrowDown />
          </Button>
        </div>
      ) : null}
      <Button size="xs" variant="outline" onClick={() => toggle(e.id)}>
        {i === null ? (
          <>
            <Undo2 /> restore
          </>
        ) : (
          "discard"
        )}
      </Button>
    </li>
  );
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-dim">
        {view.prompt} Reference clock: <span className="font-mono text-ink">{view.referenceTz}</span>.
      </p>
      {view.missing ? <p className="font-mono text-xs text-signal-amber">{view.missing} event(s) are still missing from your reconstruction. Find the evidence that reveals them.</p> : null}
      <ol className="space-y-2">{order.map((id, i) => card(byId.get(id)!, i))}</ol>
      {discard.length ? (
        <div>
          <p className="label-mono mb-2">Discarded claims</p>
          <ul className="space-y-2">{discard.map((id) => card(byId.get(id)!, null))}</ul>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => run({ type: "order", order, discard })} disabled={ui.kind === "pending" || Boolean(disabledReason)}>
          Lock in timeline
        </Button>
        {view.best ? <span className="font-mono text-xs text-mute">best so far: {view.best}% pairs in order</span> : null}
      </div>
      <Outcome ui={ui} now={now} />
    </div>
  );
}

/* ─────────────────────────── interview ─────────────────────────── */

export function InterviewWorkspace({
  nodeId,
  view,
  evidence,
  disabledReason,
}: {
  nodeId: string;
  view: {
    name: string;
    intro: string;
    transcript: { kind: "ask" | "confront"; id: string; q: string; a: string; contradicted: boolean }[];
    available: { id: string; question: string }[];
    contradictions: { id: string; label: string }[];
    goal: { contradictions: number; reached: number };
  };
  evidence: { id: string; title: string }[];
  disabledReason: string | null;
}) {
  const [present, setPresent] = useState("");
  const { ui, run, now } = useNodeAction(nodeId);
  const busy = ui.kind === "pending" || Boolean(disabledReason);
  const title = new Map(evidence.map((e) => [e.id, e.title]));
  return (
    <div className="grid gap-4 [&>*]:min-w-0 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="space-y-3">
        {view.intro ? <p className="text-sm text-ink-dim">{view.intro}</p> : null}
        <ol className="space-y-3" aria-label="Transcript">
          {view.transcript.map((t, i) => (
            <li key={`${t.kind}-${t.id}-${i}`} className="panel space-y-1.5 p-3">
              <p className="font-mono text-xs text-signal-2">{t.kind === "confront" ? `Presented: ${title.get(t.id) ?? t.id}` : `Q: ${t.q}`}</p>
              <p className={cn("text-sm text-ink", t.contradicted && "line-through decoration-signal-magenta/70")}>
                <MessageSquare className="mr-1.5 inline size-3.5 text-mute" aria-hidden="true" />
                {view.name}: “{t.a}”
              </p>
              {t.contradicted ? <Badge variant="danger">contradicted</Badge> : null}
            </li>
          ))}
          {!view.transcript.length ? <li className="text-sm text-mute">No questions asked yet.</li> : null}
        </ol>
        <Outcome ui={ui} now={now} />
      </div>
      <aside className="space-y-4">
        <div className="panel p-3">
          <p className="label-mono mb-2">Ask</p>
          <ul className="space-y-1.5">
            {view.available.map((q) => (
              <li key={q.id}>
                <Button variant="outline" size="sm" className="h-auto w-full justify-start py-1.5 text-left whitespace-normal" disabled={busy} onClick={() => run({ type: "ask", topic: q.id })}>
                  {q.question}
                </Button>
              </li>
            ))}
            {!view.available.length ? <li className="text-xs text-mute">No open lines of questioning. New evidence may open more.</li> : null}
          </ul>
        </div>
        <div className="panel p-3">
          <p className="label-mono mb-2">Present evidence</p>
          <select className="mb-2 h-9 w-full rounded-xs border border-line bg-bg px-2 text-sm" value={present} onChange={(e) => setPresent(e.target.value)} aria-label="Evidence to present">
            <option value="">choose an exhibit…</option>
            {evidence.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title}
              </option>
            ))}
          </select>
          <Button size="sm" className="w-full" disabled={!present || busy} onClick={() => run({ type: "confront", evidence: present }).then(() => setPresent(""))}>
            <Scale /> Confront
          </Button>
        </div>
        <div className="panel p-3">
          <p className="label-mono mb-1">Contradictions</p>
          <p className="num text-lg">
            <span className="text-signal">{view.goal.reached}</span>
            <span className="text-faint">/{view.goal.contradictions}</span>
          </p>
          <ul className="mt-2 space-y-1 text-xs text-ink-dim">
            {view.contradictions.map((c) => (
              <li key={c.id}>• {c.label}</li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}

/* ─────────────────────────── board deduction ─────────────────────────── */

export function BoardWorkspace({ nodeId, view, disabledReason }: { nodeId: string; view: { prompt: string; required: number; maxUnsupported: number; vocabulary: readonly string[] }; disabledReason: string | null }) {
  const { ui, run, now } = useNodeAction(nodeId);
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-dim">{view.prompt}</p>
      <div className="panel space-y-2 p-4 font-mono text-xs">
        <p>
          Required supported relationships: <span className="text-signal">{view.required}</span> · unsupported assertions tolerated: {view.maxUnsupported}
        </p>
        <p className="text-mute">Relationship labels that count: {view.vocabulary.join(", ")}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline">
          <Link href="/play/board">
            <Network /> Open evidence board
          </Link>
        </Button>
        <Button onClick={() => run({ type: "evaluate" })} disabled={ui.kind === "pending" || Boolean(disabledReason)}>
          Submit theory for analysis
        </Button>
      </div>
      <Outcome ui={ui} now={now} />
    </div>
  );
}

/* ─────────────────────────── physical ─────────────────────────── */

export function CheckpointWorkspace({
  nodeId,
  checkpoint,
  confirmed,
  prompt,
  playtestScanUrl,
}: {
  nodeId: string;
  checkpoint: { id: string; name: string; location: string; instructions: string } | null;
  confirmed: boolean;
  prompt: string;
  playtestScanUrl: string | null;
}) {
  const { ui, run, now } = useNodeAction(nodeId);
  return (
    <div className="space-y-4">
      {prompt ? <Markdown>{prompt}</Markdown> : null}
      {checkpoint ? (
        <div className="panel space-y-2 p-4">
          <p className="flex items-center gap-2 font-mono text-sm font-semibold">
            <MapPin className="size-4 text-signal-2" aria-hidden="true" /> {checkpoint.name}
          </p>
          {checkpoint.location ? <p className="text-sm text-ink-dim">{checkpoint.location}</p> : null}
          {checkpoint.instructions ? <Markdown>{checkpoint.instructions}</Markdown> : null}
          <p className="font-mono text-xs text-mute">Scan the station&apos;s QR code with your phone camera while signed in, or show your team badge from the Field page to the volunteer.</p>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline">
          <Link href="/play/live">
            <QrCode /> Field page & badge
          </Link>
        </Button>
        <Button onClick={() => run({ type: "check" })} disabled={ui.kind === "pending"}>
          {confirmed ? "Confirmed" : "Check confirmation"}
        </Button>
        {playtestScanUrl ? (
          <Button asChild variant="signal">
            <a href={playtestScanUrl}>Playtest: simulate the scan</a>
          </Button>
        ) : null}
      </div>
      <Outcome ui={ui} now={now} />
    </div>
  );
}

export function GpsWorkspace({ nodeId, view, playtestTarget }: { nodeId: string; view: { prompt: string; radiusM: number; confirmed: boolean }; playtestTarget: { lat: number; lon: number } | null }) {
  const { ui, run, now } = useNodeAction(nodeId);
  const [status, setStatus] = useState<string | null>(null);
  const locate = () => {
    if (!("geolocation" in navigator)) return setStatus("This browser cannot share its location.");
    setStatus("Asking your phone for a position fix…");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setStatus(null);
        void run({ type: "locate", lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy });
      },
      (e) => setStatus(e.code === e.PERMISSION_DENIED ? "Location permission was denied." : "Could not get a position fix. Step outside and retry."),
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 },
    );
  };
  return (
    <div className="space-y-4">
      {view.prompt ? <Markdown>{view.prompt}</Markdown> : null}
      <p className="text-sm text-ink-dim">Check in from within about {Math.round(view.radiusM)} m of the marked spot. Stay on public paths; never enter restricted areas.</p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={locate} disabled={ui.kind === "pending" || view.confirmed}>
          <LocateFixed /> {view.confirmed ? "Location verified" : "Check in with my location"}
        </Button>
        {playtestTarget ? (
          <Button variant="signal" onClick={() => run({ type: "locate", lat: playtestTarget.lat, lon: playtestTarget.lon, accuracy: 5 })}>
            Playtest: simulate arrival
          </Button>
        ) : null}
      </div>
      {status ? <p className="font-mono text-xs text-signal-amber">{status}</p> : null}
      <Outcome ui={ui} now={now} />
    </div>
  );
}

/* ─────────────────────────── final reconstruction ─────────────────────────── */

export function FinalWorkspace({
  nodeId,
  view,
  characters,
  locations,
  evidence,
  disabledReason,
}: {
  nodeId: string;
  view: {
    prompt: string;
    fields: { id: string; label: string; type: string; points: number; options: { id: string; label: string }[] }[];
    maxAttempts: number;
    attemptsUsed: number;
    bestCredit: number;
    solved: boolean;
    nextPenalty: number;
    coherenceBonus: number;
  };
  characters: { id: string; name: string; suspect: boolean }[];
  locations: { id: string; name: string }[];
  evidence: { id: string; title: string }[];
  disabledReason: string | null;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const { ui, run, now } = useNodeAction(nodeId);
  const left = view.maxAttempts - view.attemptsUsed;
  const options = (f: (typeof view.fields)[number]) => {
    if (f.options.length) return f.options;
    if (f.type === "suspect") return characters.filter((c) => c.suspect).map((c) => ({ id: c.id, label: c.name }));
    if (f.type === "location") return locations.map((l) => ({ id: l.id, label: l.name }));
    if (f.type === "evidence") return evidence.map((e) => ({ id: e.id, label: e.title }));
    return [];
  };
  if (view.solved) return <p className="panel p-4 font-mono text-sm text-signal-green">Your reconstruction is locked in. Case closed.</p>;
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void run({ type: "accuse", answers });
      }}
    >
      <p className="text-sm text-ink-dim">{view.prompt}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {view.fields.map((f) => (
          <label key={f.id} className="panel flex flex-col gap-1.5 p-3">
            <span className="label-mono flex justify-between">
              <span>{f.label}</span>
              <span className="text-faint">{f.points} pts</span>
            </span>
            {f.type === "time" ? (
              <Input type="time" value={answers[f.id] ?? ""} onChange={(e) => setAnswers((a) => ({ ...a, [f.id]: e.target.value }))} required />
            ) : f.type === "code" ? (
              <Input value={answers[f.id] ?? ""} onChange={(e) => setAnswers((a) => ({ ...a, [f.id]: e.target.value }))} autoComplete="off" spellCheck={false} className="font-mono" required />
            ) : (
              <select className="h-9 rounded-xs border border-line bg-bg px-2 text-sm" value={answers[f.id] ?? ""} onChange={(e) => setAnswers((a) => ({ ...a, [f.id]: e.target.value }))} required>
                <option value="">choose…</option>
                {options(f).map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            )}
          </label>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={ui.kind === "pending" || Boolean(disabledReason) || left <= 0}>
          File reconstruction
        </Button>
        <span className="font-mono text-xs text-mute">
          {left} attempt{left === 1 ? "" : "s"} left · next wrong filing costs {view.nextPenalty} · coherence bonus {view.coherenceBonus} · best so far {view.bestCredit}
        </span>
      </div>
      <Outcome ui={ui} now={now} />
    </form>
  );
}
