import { Check, Clock, Wrench } from "lucide-react";
import type { ReactNode } from "react";

import { Markdown } from "@/components/dossier/markdown";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** A file's header: where it sits in the case, what it is called, how it stands. */
export function RoomHeader({
  crumbs,
  title,
  code,
  points,
  minutes,
  optional,
  state,
  solvedAt,
  stageTitle,
}: {
  crumbs: string[];
  title: string;
  code: string;
  points: number;
  minutes: number;
  optional: boolean;
  state: "open" | "solved" | "failed";
  solvedAt?: ReactNode;
  stageTitle: string;
}) {
  return (
    <header className="room-head">
      <p className="label-mono mb-3 flex flex-wrap items-center gap-x-2 gap-y-1">
        {crumbs.map((c, i) => (
          <span key={i} className="flex items-center gap-2">
            {i > 0 ? <span className="text-faint">/</span> : null}
            {c}
          </span>
        ))}
        <span className="ml-auto font-mono text-[0.6rem] tracking-[0.18em] text-faint">{code}</span>
      </p>
      <h1 className="room-title text-balance">{title}</h1>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Badge variant={state === "solved" ? "success" : state === "failed" ? "danger" : "accent"}>
          {state === "solved" ? <Check /> : null}
          {points} pts
        </Badge>
        <Badge variant="outline">
          <Clock /> ~{minutes} min
        </Badge>
        {optional ? <Badge variant="secondary">side path</Badge> : null}
        <Badge variant="info">{stageTitle}</Badge>
        {state === "solved" && solvedAt ? <Badge variant="success">solved {solvedAt}</Badge> : null}
        {state === "failed" ? <Badge variant="danger">attempts exhausted</Badge> : null}
      </div>
    </header>
  );
}

/** The briefing, set apart as a case note rather than page prose. */
export function CaseNote({ children, className }: { children: string; className?: string }) {
  if (!children) return null;
  return (
    <aside className={cn("case-note", className)} aria-label="Briefing">
      <p className="label-mono mb-2">Briefing</p>
      <Markdown>{children}</Markdown>
    </aside>
  );
}

export function WhatItTakes({ skills, tools }: { skills: string[]; tools: string[] }) {
  if (!skills.length && !tools.length) return null;
  return (
    <section className="panel p-4">
      <h2 className="label-mono mb-2 flex items-center gap-2">
        <Wrench className="size-3.5" aria-hidden="true" /> What this takes
      </h2>
      {skills.length ? <p className="text-sm text-ink-dim">{skills.join(" · ")}</p> : null}
      {tools.length ? <p className="mt-1 font-mono text-xs text-mute">Tools: {tools.join(", ")}</p> : null}
    </section>
  );
}
