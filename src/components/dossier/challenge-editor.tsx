"use client";

import { Eye, Plus, Save, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ActionFeedback, useAction } from "./admin-client";
import { Markdown } from "./markdown-client";

export interface EditableChallenge {
  id: string;
  mode: string;
  title: string;
  bodyMd: string;
  category: string | null;
  points: number;
  firstBloodBonus: number;
  hidden: boolean;
  hints: { cost: number; text: string }[];
  /** ISO from the server; a datetime-local string once edited in the browser. */
  availableFrom: string | null;
  answerType: string;
  normalize: string;
  answerCount: number;
  dynamic: boolean;
}

/**
 * Live challenge editor with side-by-side preview (same sanitised renderer
 * players see). Answers are write-only: existing answers are never shown,
 * only replaced.
 */
export function ChallengeEditor({ initial }: { initial: EditableChallenge }) {
  const [c, setC] = useState(initial);
  const [answers, setAnswers] = useState("");
  const [preview, setPreview] = useState(false);
  // datetime-local is in the *browser* timezone: convert from the stored ISO after mount.
  useEffect(() => {
    if (!initial.availableFrom) return;
    const d = new Date(initial.availableFrom);
    const pad = (n: number) => String(n).padStart(2, "0");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser timezone is only known after hydration
    setC((x) => ({ ...x, availableFrom: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}` }));
  }, [initial.availableFrom]);
  const { run, busy, error, message } = useAction();
  const set = <K extends keyof EditableChallenge>(k: K, v: EditableChallenge[K]) => setC((x) => ({ ...x, [k]: v }));

  const save = () =>
    run(
      `/api/admin/challenges/${encodeURIComponent(c.id)}`,
      {
        title: c.title,
        bodyMd: c.bodyMd,
        category: c.category,
        points: c.points,
        firstBloodBonus: c.firstBloodBonus,
        hidden: c.hidden,
        hints: c.hints,
        availableFrom: c.availableFrom ? new Date(c.availableFrom).toISOString() : null,
        ...(answers.trim() ? { newAnswers: answers.split("\n").map((a) => a.trim()).filter(Boolean) } : {}),
      },
      { method: "PUT", success: answers.trim() ? "Saved. Answers replaced and re-hashed." : "Saved and live." },
    ).then((r) => r && setAnswers(""));

  return (
    <div className="grid gap-6 [&>*]:min-w-0 xl:grid-cols-2">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-[1fr_120px_120px]">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ce-title">Title</Label>
            <Input id="ce-title" value={c.title} onChange={(e) => set("title", e.target.value)} required maxLength={100} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ce-points">{c.dynamic ? "Initial pts" : "Points"}</Label>
            <Input id="ce-points" type="number" min={0} value={c.points} onChange={(e) => set("points", Number(e.target.value))} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ce-fb">First blood</Label>
            <Input id="ce-fb" type="number" min={0} value={c.firstBloodBonus} onChange={(e) => set("firstBloodBonus", Number(e.target.value))} />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="ce-body">Briefing (markdown, no raw HTML)</Label>
            <Button type="button" size="xs" variant="ghost" className="xl:hidden" onClick={() => setPreview((p) => !p)}>
              <Eye /> {preview ? "Edit" : "Preview"}
            </Button>
          </div>
          <Textarea id="ce-body" value={c.bodyMd} onChange={(e) => set("bodyMd", e.target.value)} className="min-h-56 font-mono text-sm" maxLength={20000} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ce-from">Time gate (opens at)</Label>
            <Input id="ce-from" type="datetime-local" value={c.availableFrom ?? ""} onChange={(e) => set("availableFrom", e.target.value || null)} />
          </div>
          <label className="flex items-center gap-3 self-end rounded-sm border border-line px-3 py-2.5 font-mono text-[0.7rem] uppercase tracking-[0.1em] text-mute">
            <Switch checked={c.hidden} onCheckedChange={(v) => set("hidden", v)} /> Hidden from teams
          </label>
        </div>

        <fieldset className="space-y-2">
          <legend className="label-mono mb-1 flex w-full items-center justify-between">
            Hints ({c.hints.length}/10)
            <Button type="button" size="xs" variant="outline" disabled={c.hints.length >= 10} onClick={() => set("hints", [...c.hints, { cost: 10, text: "" }])}>
              <Plus /> Hint
            </Button>
          </legend>
          {c.hints.map((h, i) => (
            <div key={i} className="grid grid-cols-[80px_1fr_auto] gap-2">
              <Input type="number" min={0} aria-label={`Hint ${i + 1} cost`} value={h.cost} onChange={(e) => set("hints", c.hints.map((x, j) => (j === i ? { ...x, cost: Number(e.target.value) } : x)))} />
              <Input aria-label={`Hint ${i + 1} text`} value={h.text} onChange={(e) => set("hints", c.hints.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} />
              <Button type="button" size="icon" variant="ghost" aria-label={`Delete hint ${i + 1}`} onClick={() => set("hints", c.hints.filter((_, j) => j !== i))}>
                <Trash2 />
              </Button>
            </div>
          ))}
        </fieldset>

        <div className="flex flex-col gap-1.5 rounded-sm border border-dashed border-line-strong p-3">
          <Label htmlFor="ce-ans">Replace accepted answers (one per line)</Label>
          <Textarea id="ce-ans" value={answers} onChange={(e) => setAnswers(e.target.value)} placeholder={`${c.answerCount} answer(s) on file — hidden. Leave empty to keep them.`} autoComplete="off" spellCheck={false} className="font-mono text-sm" />
          <p className="font-mono text-[0.65rem] text-faint">
            Type {c.answerType} · normalisation {c.normalize}. Stored only as salted HMACs; never displayed again.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={busy}>
            <Save /> Save changes
          </Button>
          <ActionFeedback error={error} message={message} />
        </div>
      </form>

      <section aria-label="Live preview" className={preview ? "" : "hidden xl:block"}>
        <p className="label-mono mb-2">Live preview — as teams see it</p>
        <div className="panel p-5">
          <p className="label-mono mb-1">
            {c.mode}
            {c.category ? ` / ${c.category}` : ""}
          </p>
          <h2 className="mb-4 font-mono text-xl font-semibold">{c.title || "Untitled"}</h2>
          <Markdown>{c.bodyMd || "_No briefing._"}</Markdown>
        </div>
      </section>
    </div>
  );
}
