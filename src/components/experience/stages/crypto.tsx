"use client";

import { ArrowDown, ArrowRight, ArrowUp, Check, Copy, Eraser, Lightbulb, Plus, Send, X } from "lucide-react";
import { useMemo, useState } from "react";

import { AnswerForm } from "@/components/dossier/answer-form";
import { Markdown } from "@/components/dossier/markdown-client";
import { OPS, OP_BY_ID, extractFragments, runRecipe, type RecipeStep } from "@/lib/experience/cipher-tools";
import { cn } from "@/lib/utils";
import type { StageContext } from "./types";
import { Chip, TileRow, Window } from "./window";

interface Step {
  index: number;
  prompt: string;
  reveal: string | null;
  solved: boolean;
}

let uid = 0;
type KeyedStep = RecipeStep & { key: number };

/** A CyberChef-shaped bench: input → recipe → output, with every intermediate state visible. */
function CipherLab({ seed, nodeId }: { seed: string; nodeId: string }) {
  const [input, setInput] = useState(seed);
  const [steps, setSteps] = useState<KeyedStep[]>([]);
  const [copied, setCopied] = useState(false);
  const states = useMemo(() => runRecipe(input, steps), [input, steps]);
  const output = steps.length ? states[states.length - 1]! : input;

  const add = (id: string) => {
    const op = OP_BY_ID.get(id)!;
    setSteps((s) => [...s, { key: ++uid, op: id, param: op.param ? op.param.def : "" }]);
  };
  const move = (i: number, d: -1 | 1) =>
    setSteps((s) => {
      const j = i + d;
      if (j < 0 || j >= s.length) return s;
      const n = [...s];
      [n[i], n[j]] = [n[j]!, n[i]!];
      return n;
    });

  return (
    <Window variant="term" title="Decoding desk" subtitle={`${steps.length} step${steps.length === 1 ? "" : "s"}`} className="cipher-lab">
      <div className="space-y-4 p-4">
        <label className="block">
          <span className="label-mono mb-1.5 flex items-center justify-between">
            <span>Input</span>
            <button type="button" className="hover:text-ink" onClick={() => (setInput(""), setSteps([]))}>
              <Eraser className="mr-1 inline size-3" aria-hidden="true" /> clear
            </button>
          </span>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            spellCheck={false}
            rows={2}
            placeholder="Paste or send a fragment from a clue…"
            className="w-full resize-y rounded-[var(--r-ctl)] border border-line-strong bg-bg px-3 py-2 font-mono text-sm text-ink outline-none placeholder:text-faint focus:border-[var(--accent)]"
          />
        </label>

        <div>
          <p className="label-mono mb-1.5">Operations</p>
          <ul className="flex flex-wrap gap-1.5">
            {OPS.map((o) => (
              <li key={o.id}>
                <button type="button" onClick={() => add(o.id)} title={o.hint} className="chip-btn">
                  <Plus className="size-3" aria-hidden="true" /> {o.label}
                </button>
              </li>
            ))}
          </ul>
        </div>

        {steps.length ? (
          <ol className="recipe space-y-2" aria-label="Recipe">
            {steps.map((s, i) => {
              const op = OP_BY_ID.get(s.op)!;
              return (
                <li key={s.key} className="recipe-step">
                  <div className="flex items-center gap-2">
                    <span className="num w-5 text-xs text-faint">{i + 1}</span>
                    <span className="font-display text-[0.8rem] font-semibold">{op.label}</span>
                    {op.param?.kind === "int" ? (
                      <input
                        type="number"
                        aria-label={op.param.label}
                        min={op.param.min}
                        max={op.param.max}
                        value={Number(s.param)}
                        onChange={(e) => setSteps((all) => all.map((x) => (x.key === s.key ? { ...x, param: Number(e.target.value) } : x)))}
                        className="recipe-param w-16"
                      />
                    ) : null}
                    {op.param?.kind === "text" ? (
                      <input
                        type="text"
                        aria-label={op.param.label}
                        placeholder={op.param.placeholder}
                        value={String(s.param)}
                        onChange={(e) => setSteps((all) => all.map((x) => (x.key === s.key ? { ...x, param: e.target.value } : x)))}
                        className="recipe-param w-32 uppercase"
                        spellCheck={false}
                      />
                    ) : null}
                    <span className="ml-auto flex items-center">
                      <button type="button" className="icon-btn" aria-label="Move up" onClick={() => move(i, -1)}>
                        <ArrowUp className="size-3" />
                      </button>
                      <button type="button" className="icon-btn" aria-label="Move down" onClick={() => move(i, 1)}>
                        <ArrowDown className="size-3" />
                      </button>
                      <button type="button" className="icon-btn" aria-label={`Remove ${op.label}`} onClick={() => setSteps((all) => all.filter((x) => x.key !== s.key))}>
                        <X className="size-3" />
                      </button>
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2 pl-7">
                    <ArrowRight className="size-3 shrink-0 text-faint" aria-hidden="true" />
                    <TileRow text={states[i] ?? ""} max={40} className="tile-row-sm" />
                  </div>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="font-mono text-xs text-faint">Add an operation. Each step keeps its result visible so you can see where a guess stops making sense.</p>
        )}

        <div className="rounded-[var(--r-ctl)] border border-line bg-bg p-3">
          <p className="label-mono mb-2">Output</p>
          <div className="overflow-x-auto pb-1">
            <TileRow text={output || " "} max={80} />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="chip-btn"
              onClick={() => {
                void navigator.clipboard?.writeText(output);
                setCopied(true);
                setTimeout(() => setCopied(false), 1200);
              }}
            >
              {copied ? <Check className="size-3" /> : <Copy className="size-3" />} {copied ? "Copied" : "Copy"}
            </button>
            <button type="button" className="chip-btn is-primary" onClick={() => window.dispatchEvent(new CustomEvent("dossier:fill", { detail: { nodeId, value: output.trim() } }))} disabled={!output.trim()}>
              <Send className="size-3" /> Send to answer
            </button>
          </div>
        </div>
      </div>
    </Window>
  );
}

export function CrypticStage({ ctx }: { ctx: StageContext }) {
  const view = ctx.view as unknown as { total: number; solvedSteps: number; steps: Step[] };
  const current = view.steps.find((s) => !s.solved) ?? view.steps.at(-1);
  const [seed, setSeed] = useState(() => extractFragments(current?.prompt ?? "")[0] ?? "");
  const [labKey, setLabKey] = useState(0);

  return (
    <div className="grid gap-5 [&>*]:min-w-0 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <div className="space-y-4">
        <ol className="space-y-3" aria-label="Clues">
          {view.steps.map((s) => {
            const frags = extractFragments(s.prompt);
            const isCurrent = current?.index === s.index && !s.solved;
            return (
              <li key={s.index} className={cn("slip panel", isCurrent && "is-current", s.solved && "is-solved")}>
                <p className="label-mono mb-2 flex items-center gap-2">
                  Clue {s.index + 1} / {view.total}
                  {s.solved ? <Chip tone="ok"><Check className="size-3" /> resolved</Chip> : isCurrent ? <Chip tone="accent">on the desk</Chip> : <Chip>queued</Chip>}
                </p>
                <Markdown>{s.prompt}</Markdown>
                {frags.length && !s.solved ? (
                  <div className="mt-3 space-y-2">
                    {frags.slice(0, 2).map((f) => (
                      <div key={f} className="flex items-center gap-2">
                        <div className="min-w-0 flex-1 overflow-x-auto">
                          <TileRow text={f} max={48} />
                        </div>
                        <button
                          type="button"
                          className="chip-btn shrink-0"
                          onClick={() => {
                            setSeed(f);
                            setLabKey((k) => k + 1);
                          }}
                        >
                          <ArrowRight className="size-3" /> to desk
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
                {s.reveal ? <p className="mt-3 border-t border-line pt-2 font-mono text-xs text-signal-2">↳ {s.reveal}</p> : null}
              </li>
            );
          })}
        </ol>
        <AnswerForm nodeId={ctx.nodeId} disabledReason={ctx.disabledReason} label={`Resolve clue ${Math.min(view.total, view.solvedSteps + 1)}`} />
        <p className="flex items-start gap-2 font-mono text-[0.7rem] text-faint">
          <Lightbulb className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
          The desk only transforms text. Which transform a clue needs, and what key it uses, is still yours to work out.
        </p>
      </div>
      <CipherLab key={labKey} seed={seed} nodeId={ctx.nodeId} />
    </div>
  );
}
