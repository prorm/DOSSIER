"use client";

import { AlertTriangle, ArrowDown, ArrowUp, Ban, Fingerprint, GripVertical, Lock, Network, Scale, Stamp, Undo2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { Outcome, useNodeAction } from "@/components/dossier/answer-form";
import HoldButton from "@/components/reactbits/HoldButton";
import { RELATION_KINDS, RELATION_STYLE } from "@/lib/experience/relations";
import { cn } from "@/lib/utils";
import type { StageContext } from "./types";
import { Chip, Window } from "./window";

/* ─────────────────────────── interrogation room ─────────────────────────── */

interface Turn {
  kind: "ask" | "confront";
  id: string;
  q: string;
  a: string;
  contradicted: boolean;
}

/** Types an answer out, letter by letter, only when it has just arrived. Reduced motion gets the whole line. */
function useTypewriter(text: string, on: boolean, speed = 16) {
  // Progress is tagged with the text it belongs to, so a new answer starts from zero without any reset step.
  const [typed, setTyped] = useState({ text, n: 0 });
  useEffect(() => {
    if (!on || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let i = 0;
    const t = setInterval(() => {
      i += 1;
      setTyped({ text, n: i });
      if (i >= text.length) clearInterval(t);
    }, speed);
    return () => clearInterval(t);
  }, [text, on, speed]);
  const animating = on && typed.n < text.length && typeof window !== "undefined" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  return animating ? text.slice(0, typed.text === text ? typed.n : 0) : text;
}

function Answer({ who, text, fresh, contradicted }: { who: string; text: string; fresh: boolean; contradicted: boolean }) {
  const shown = useTypewriter(text, fresh);
  return (
    <div className={cn("bubble bubble-them", contradicted && "is-contradicted")}>
      <p className="bubble-who">{who}</p>
      <p>“{shown}”</p>
      {contradicted ? (
        <span className="bubble-stamp">
          <Stamp className="size-3" aria-hidden="true" /> contradicted
        </span>
      ) : null}
    </div>
  );
}

export function InterviewStage({ ctx }: { ctx: StageContext }) {
  const view = ctx.view as unknown as {
    name: string;
    intro: string;
    transcript: Turn[];
    available: { id: string; question: string }[];
    contradictions: { id: string; label: string }[];
    goal: { contradictions: number; reached: number };
  };
  const [present, setPresent] = useState<string | null>(null);
  const { ui, run, now } = useNodeAction(ctx.nodeId);
  const busy = ui.kind === "pending" || Boolean(ctx.disabledReason);
  const person = ctx.characters.find((c) => c.name === view.name);
  const title = useMemo(() => new Map(ctx.evidence.map((e) => [e.id, e.title])), [ctx.evidence]);
  // Exchanges that arrive after the room was opened are typed out; the record you walked into is not replayed.
  const [opened] = useState(view.transcript.length);
  const log = useRef<HTMLOListElement>(null);
  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight, behavior: "smooth" });
  }, [view.transcript.length]);
  const initials = view.name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2);
  const { reached, contradictions: goal } = view.goal;

  return (
    <div className="grid gap-5 [&>*]:min-w-0 lg:grid-cols-[250px_minmax(0,1fr)]">
      <aside className="space-y-4">
        <div className="subject panel">
          <div className="subject-photo" aria-hidden="true">
            <span>{initials}</span>
            <i />
          </div>
          <p className="mt-3 font-display text-lg leading-tight font-semibold">{view.name}</p>
          {person?.role ? <p className="text-[0.82rem] text-ink-dim">{person.role}</p> : null}
          <p className="mt-2 flex flex-wrap gap-1.5">
            {person?.suspect ? <Chip tone="bad">person of interest</Chip> : <Chip>witness</Chip>}
            <Chip tone="info">
              <Fingerprint className="size-3" /> on record
            </Chip>
          </p>
        </div>
        {/* A meter with nothing to fill is noise: it appears only when this interview has contradictions to expose. */}
        {goal > 0 ? (
          <div className="panel p-4">
            <p className="label-mono mb-2">Pressure</p>
            <div className="pressure" role="meter" aria-valuemin={0} aria-valuemax={goal} aria-valuenow={reached} aria-label="Contradictions exposed">
              {Array.from({ length: Math.max(goal, 1) }, (_, i) => (
                <i key={i} className={i < reached ? "is-on" : ""} />
              ))}
            </div>
            <p className="mt-2 font-mono text-xs text-mute">
              <span className="num text-ink">{reached}</span> of {goal} contradictions exposed
            </p>
            {view.contradictions.length ? (
              <ul className="mt-3 space-y-1.5 text-[0.8rem] text-ink-dim">
                {view.contradictions.map((c) => (
                  <li key={c.id} className="flex gap-2">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-signal-magenta" aria-hidden="true" />
                    {c.label}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </aside>

      <div className="space-y-4">
        <Window variant="sheet" title="Interview record" subtitle={`${view.transcript.length} exchange${view.transcript.length === 1 ? "" : "s"}`} bodyClassName="p-0">
          <ol ref={log} className="transcript" aria-label="Transcript">
            {view.intro ? (
              <li className="bubble-note">
                <p>{view.intro}</p>
              </li>
            ) : null}
            {view.transcript.map((t, i) => {
              const last = i === view.transcript.length - 1;
              return (
                <li key={`${t.kind}-${t.id}-${i}`} className="turn">
                  <div className="bubble bubble-us">
                    <p className="bubble-who">You</p>
                    <p>{t.kind === "confront" ? <>Presented: <b>{title.get(t.id) ?? t.id}</b></> : t.q.replace(/^Q:\s*/, "")}</p>
                  </div>
                  <Answer who={view.name} text={t.a} fresh={i >= opened && last} contradicted={t.contradicted} />
                </li>
              );
            })}
            {!view.transcript.length ? <li className="bubble-note">No questions asked yet. Start with what they were doing.</li> : null}
          </ol>
        </Window>

        <div className="grid gap-4 [&>*]:min-w-0 md:grid-cols-2">
          <section className="panel p-4" aria-label="Ask">
            <p className="label-mono mb-2">Ask</p>
            <ul className="space-y-1.5">
              {view.available.map((q) => (
                <li key={q.id}>
                  <button type="button" className="topic" disabled={busy} onClick={() => run({ type: "ask", topic: q.id })}>
                    {q.question}
                  </button>
                </li>
              ))}
              {!view.available.length ? <li className="text-xs text-mute">No open lines of questioning. New evidence may open more.</li> : null}
            </ul>
          </section>
          <section className="panel p-4" aria-label="Present evidence">
            <p className="label-mono mb-2">Present evidence</p>
            {ctx.evidence.length ? (
              <ul className="exhibit-strip">
                {ctx.evidence.map((e) => (
                  <li key={e.id}>
                    <button type="button" aria-pressed={present === e.id} onClick={() => setPresent(present === e.id ? null : e.id)} className={cn("exhibit-chip", present === e.id && "is-on")}>
                      <Fingerprint className="size-3.5 shrink-0" aria-hidden="true" />
                      <span className="line-clamp-2">{e.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-mute">No exhibits held yet.</p>
            )}
            <button type="button" className="chip-btn is-primary mt-3 !h-9 w-full justify-center" disabled={!present || busy} onClick={() => present && run({ type: "confront", evidence: present }).then(() => setPresent(null))}>
              <Scale className="size-3.5" /> Confront
            </button>
          </section>
        </div>
        <Outcome ui={ui} now={now} />
      </div>
    </div>
  );
}

/* ─────────────────────────── temporal reconstruction ─────────────────────────── */

interface TlCard {
  id: string;
  label: string;
  source: string;
  shown: string;
  confidence: string;
}

export function TimelineStage({ ctx }: { ctx: StageContext }) {
  const view = ctx.view as unknown as { prompt: string; referenceTz: string; events: TlCard[]; missing: number; best: number };
  const [order, setOrder] = useState<string[]>(view.events.map((e) => e.id));
  const [discard, setDiscard] = useState<string[]>([]);
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const { ui, run, now } = useNodeAction(ctx.nodeId);
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
  const drop = (target: string) => {
    if (!drag || drag === target) return;
    setOrder((o) => {
      const n = o.filter((x) => x !== drag);
      n.splice(n.indexOf(target), 0, drag);
      return n;
    });
  };
  const toggle = (id: string) => {
    if (discard.includes(id)) {
      setDiscard((d) => d.filter((x) => x !== id));
      setOrder((o) => [...o, id]);
    } else {
      setDiscard((d) => [...d, id]);
      setOrder((o) => o.filter((x) => x !== id));
    }
  };
  return (
    <div className="space-y-5">
      <div className="max-w-3xl space-y-2">
        <p className="text-sm text-ink-dim">
          {view.prompt} Reference clock: <span className="font-mono text-ink">{view.referenceTz}</span>. Clocks disagree; sources vary in how far to trust them.
        </p>
        {view.missing ? (
          <p className="flex items-center gap-2 font-mono text-xs text-signal-amber">
            <AlertTriangle className="size-3.5" aria-hidden="true" /> {view.missing} event(s) are still missing from your reconstruction. Find the evidence that reveals them.
          </p>
        ) : null}
      </div>
      <div className="grid gap-5 [&>*]:min-w-0 lg:grid-cols-[minmax(0,1fr)_280px]">
        <ol className="rail" aria-label="Your timeline, earliest first">
          {order.map((id, i) => {
            const e = byId.get(id)!;
            return (
              <li
                key={id}
                draggable
                onDragStart={() => setDrag(id)}
                onDragEnd={() => (setDrag(null), setOver(null))}
                onDragOver={(ev) => (ev.preventDefault(), setOver(id))}
                onDrop={() => (drop(id), setDrag(null), setOver(null))}
                className={cn("rail-item", drag === id && "is-drag", over === id && drag !== id && "is-over")}
              >
                <span className="rail-node num">{i + 1}</span>
                <div className="rail-card panel">
                  <GripVertical className="size-4 shrink-0 cursor-grab text-faint" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[0.92rem] leading-snug">{e.label}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[0.68rem] text-mute">
                      <span className="rail-time">{e.shown}</span>
                      <span>{e.source}</span>
                      <Chip tone={e.confidence === "high" ? "ok" : e.confidence === "low" ? "warn" : "mute"}>{e.confidence} confidence</Chip>
                    </p>
                  </div>
                  <span className="flex flex-col">
                    <button type="button" className="icon-btn" aria-label={`Move ${e.label} earlier`} onClick={() => move(id, -1)}>
                      <ArrowUp className="size-3.5" />
                    </button>
                    <button type="button" className="icon-btn" aria-label={`Move ${e.label} later`} onClick={() => move(id, 1)}>
                      <ArrowDown className="size-3.5" />
                    </button>
                  </span>
                  <button type="button" className="chip-btn" onClick={() => toggle(id)}>
                    discard
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
        <aside className="space-y-4">
          <div className="panel p-4">
            <p className="label-mono mb-2 flex items-center gap-2">
              <Ban className="size-3.5" aria-hidden="true" /> Discarded claims
            </p>
            {discard.length ? (
              <ul className="space-y-2">
                {discard.map((id) => (
                  <li key={id} className="flex items-start gap-2 text-[0.82rem] text-ink-dim">
                    <span className="min-w-0 flex-1 line-through decoration-signal-magenta/60">{byId.get(id)?.label}</span>
                    <button type="button" className="chip-btn" onClick={() => toggle(id)}>
                      <Undo2 className="size-3" /> restore
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-mute">Anything you think is false, mistimed or planted goes here.</p>
            )}
          </div>
          <div className="panel p-4">
            <button type="button" className="chip-btn is-primary !h-10 w-full justify-center" disabled={ui.kind === "pending" || Boolean(ctx.disabledReason)} onClick={() => run({ type: "order", order, discard })}>
              <Lock className="size-3.5" /> Lock in timeline
            </button>
            {view.best ? <p className="mt-2 font-mono text-xs text-mute">best so far: {view.best}% of pairs in order</p> : null}
          </div>
          <Outcome ui={ui} now={now} />
        </aside>
      </div>
    </div>
  );
}

/* ─────────────────────────── deduction desk ─────────────────────────── */

export function BoardStage({ ctx }: { ctx: StageContext }) {
  const view = ctx.view as unknown as { prompt: string; required: number; maxUnsupported: number; vocabulary: readonly string[] };
  const { ui, run, now } = useNodeAction(ctx.nodeId);
  const drawn = ctx.board.strings;
  return (
    <div className="space-y-5">
      <p className="max-w-3xl text-sm text-ink-dim">{view.prompt}</p>
      <div className="grid gap-4 [&>*]:min-w-0 md:grid-cols-3">
        <div className="dial panel">
          <p className="label-mono">Theory needs</p>
          <p className="num text-4xl leading-none font-semibold text-signal">{view.required}</p>
          <p className="text-xs text-mute">supported relationships</p>
        </div>
        <div className="dial panel">
          <p className="label-mono">On your board</p>
          <p className="num text-4xl leading-none font-semibold">{drawn}</p>
          <p className="text-xs text-mute">strings · {ctx.board.placed} items pinned</p>
        </div>
        <div className="dial panel">
          <p className="label-mono">Tolerated slack</p>
          <p className="num text-4xl leading-none font-semibold text-mute">{view.maxUnsupported}</p>
          <p className="text-xs text-mute">unsupported assertions</p>
        </div>
      </div>
      <div className="panel p-4">
        <p className="label-mono mb-3">Relationships the case can check</p>
        <ul className="flex flex-wrap gap-2">
          {RELATION_KINDS.filter((k) => view.vocabulary.includes(k)).map((k) => (
            <li key={k} className={cn("rel-chip", `tone-${RELATION_STYLE[k].tone}`)}>
              <svg width="30" height="8" viewBox="0 0 30 8" aria-hidden="true">
                <path d="M1 4 H29" stroke="currentColor" strokeWidth={RELATION_STYLE[k].width} strokeDasharray={RELATION_STYLE[k].dash} fill="none" />
                {RELATION_STYLE[k].arrow ? <path d="M23 1 L29 4 L23 7" fill="none" stroke="currentColor" strokeWidth="1.6" /> : null}
              </svg>
              {RELATION_STYLE[k].label}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-mute">The board never tells you which strings are right — only a submitted theory is reviewed, and only as a whole.</p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Link href="/play/board" className="chip-btn !h-11 !px-5">
          <Network className="size-4" /> Open the evidence board
        </Link>
        <button type="button" className="chip-btn is-primary !h-11 !px-5" onClick={() => run({ type: "evaluate" })} disabled={ui.kind === "pending" || Boolean(ctx.disabledReason)}>
          Submit theory for review
        </button>
      </div>
      <Outcome ui={ui} now={now} />
    </div>
  );
}

/* ─────────────────────────── reconstruction room ─────────────────────────── */

export function FinalStage({ ctx }: { ctx: StageContext }) {
  const view = ctx.view as unknown as {
    prompt: string;
    fields: { id: string; label: string; type: string; points: number; options: { id: string; label: string }[] }[];
    maxAttempts: number;
    attemptsUsed: number;
    bestCredit: number;
    solved: boolean;
    nextPenalty: number;
    coherenceBonus: number;
  };
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const { ui, run, now } = useNodeAction(ctx.nodeId);
  const left = view.maxAttempts - view.attemptsUsed;
  const options = (f: (typeof view.fields)[number]) => {
    if (f.options.length) return f.options;
    if (f.type === "suspect") return ctx.characters.filter((c) => c.suspect).map((c) => ({ id: c.id, label: c.name }));
    if (f.type === "location") return ctx.locations.map((l) => ({ id: l.id, label: l.name }));
    if (f.type === "evidence") return ctx.evidence.map((e) => ({ id: e.id, label: e.title }));
    return [];
  };
  if (view.solved)
    return (
      <div className="closed panel">
        <Stamp className="size-8 text-signal-green" aria-hidden="true" />
        <p className="font-display text-2xl font-semibold text-signal-green">CASE CLOSED</p>
        <p className="text-sm text-ink-dim">Your reconstruction is locked in.</p>
      </div>
    );
  const filled = view.fields.filter((f) => answers[f.id]).length;
  return (
    <div className="space-y-5">
      <p className="max-w-3xl text-sm text-ink-dim">{view.prompt}</p>
      <div className="grid gap-5 [&>*]:min-w-0 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="case-wall">
          <div className="grid gap-3 sm:grid-cols-2">
            {view.fields.map((f) => {
              const Icon = f.type === "evidence" ? Fingerprint : null;
              const opts = options(f);
              return (
                <label key={f.id} className={cn("slot", answers[f.id] && "is-filled")}>
                  <span className="label-mono flex justify-between">
                    <span className="flex items-center gap-1.5">
                      {Icon ? <Icon className="size-3" /> : null}
                      {f.label}
                    </span>
                    <span className="text-faint">{f.points} pts</span>
                  </span>
                  {f.type === "time" ? (
                    <input type="time" value={answers[f.id] ?? ""} onChange={(e) => setAnswers((a) => ({ ...a, [f.id]: e.target.value }))} className="slot-input" />
                  ) : f.type === "code" ? (
                    <input value={answers[f.id] ?? ""} onChange={(e) => setAnswers((a) => ({ ...a, [f.id]: e.target.value }))} autoComplete="off" spellCheck={false} placeholder="code" className="slot-input" />
                  ) : (
                    <select value={answers[f.id] ?? ""} onChange={(e) => setAnswers((a) => ({ ...a, [f.id]: e.target.value }))} className="slot-input">
                      <option value="">— undecided —</option>
                      {opts.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  )}
                </label>
              );
            })}
          </div>
        </div>
        <aside className="stakes panel">
          <p className="label-mono">The stakes</p>
          <dl className="mt-3 space-y-3 font-mono text-xs">
            <div className="flex justify-between">
              <dt className="text-mute">attempts left</dt>
              <dd className="num text-lg text-ink">{left}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-mute">a wrong filing costs</dt>
              <dd className="num text-signal-magenta">−{view.nextPenalty}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-mute">coherence bonus</dt>
              <dd className="num text-signal-green">+{view.coherenceBonus}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-mute">best so far</dt>
              <dd className="num text-ink">{view.bestCredit}</dd>
            </div>
          </dl>
          <div className="mt-4">
            <HoldButton
              size="lg"
              disabled={ui.kind === "pending" || Boolean(ctx.disabledReason) || left <= 0 || filled < view.fields.length}
              holdTime={1300}
              backgroundColor="var(--color-raised)"
              fillColor="var(--accent)"
              textColor="var(--color-ink)"
              fillTextColor="var(--accent-ink)"
              className="w-full"
              doneLabel="Filed"
              onHold={() => void run({ type: "accuse", answers })}
            >
              Hold to file
            </HoldButton>
            <p className="mt-2 text-center font-mono text-[0.62rem] text-faint">{filled < view.fields.length ? `${view.fields.length - filled} finding(s) undecided` : "Filing is final. Hold the button."}</p>
          </div>
        </aside>
      </div>
      <Outcome ui={ui} now={now} />
    </div>
  );
}
