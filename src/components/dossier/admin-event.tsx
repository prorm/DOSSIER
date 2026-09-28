"use client";

import { Copy, Monitor, Pause, Play, RotateCcw, Snowflake, Square, Sun } from "lucide-react";
import { useState } from "react";

import HoldButton from "@/components/reactbits/HoldButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { ActionFeedback, useAction } from "./admin-client";
import type { Phase } from "./phase";

/** Event state machine controls. Irreversible "End" requires a hold-to-confirm. */
export function EventControls({ phase, frozen }: { phase: Phase; frozen: boolean }) {
  const { run, busy, error, message } = useAction<{ status: string }>();
  const act = (action: string, label: string) => run("/api/admin/event", { action }, { success: `${label}.` });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {phase === "standby" ? (
          <Button onClick={() => act("start", "Event started")} disabled={busy}>
            <Play /> Start event
          </Button>
        ) : null}
        {phase === "live" ? (
          <Button variant="outline" onClick={() => act("pause", "Paused")} disabled={busy}>
            <Pause /> Pause
          </Button>
        ) : null}
        {phase === "paused" ? (
          <Button onClick={() => act("resume", "Resumed")} disabled={busy}>
            <Play /> Resume
          </Button>
        ) : null}
        {(phase === "live" || phase === "paused") && !frozen ? (
          <Button variant="signal" onClick={() => act("freeze", "Scoreboard frozen")} disabled={busy}>
            <Snowflake /> Freeze scoreboard
          </Button>
        ) : null}
        {frozen ? (
          <Button variant="outline" onClick={() => act("unfreeze", "Scoreboard unfrozen")} disabled={busy}>
            <Sun /> Unfreeze
          </Button>
        ) : null}
        {phase === "ended" ? (
          <Button variant="outline" onClick={() => act("reopen", "Reopened (paused)")} disabled={busy}>
            <RotateCcw /> Reopen (paused)
          </Button>
        ) : null}
      </div>
      {phase === "live" || phase === "paused" ? (
        <div className="max-w-sm">
          <HoldButton
            size="md"
            holdTime={2200}
            resetAfter={0}
            disabled={busy}
            backgroundColor="var(--color-raised)"
            fillColor="var(--color-signal-magenta)"
            textColor="var(--color-ink)"
            fillTextColor="var(--color-bg)"
            radius={3}
            icon={<Square className="size-4" />}
            doneLabel="Ending…"
            onHold={() => act("end", "Event ended — solutions declassified, scoreboard unfrozen")}
            className="w-full font-mono text-[0.78rem] uppercase tracking-[0.1em]"
          >
            Hold to end event
          </HoldButton>
          <p className="mt-1.5 font-mono text-[0.65rem] text-faint">Ends play, unfreezes the final board and reveals inquest solutions.</p>
        </div>
      ) : null}
      <ActionFeedback error={error} message={message} />
    </div>
  );
}

export function AnnouncementComposer() {
  const { run, busy, error, message } = useAction();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [level, setLevel] = useState<"info" | "warning" | "critical">("info");
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await run("/api/admin/announce", { title, body, level }, { success: "Broadcast sent to every team and the projector." });
        if (r) {
          setTitle("");
          setBody("");
        }
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ann-title">Title</Label>
        <Input id="ann-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} required minLength={2} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ann-body">Message</Label>
        <Textarea id="ann-body" value={body} onChange={(e) => setBody(e.target.value)} maxLength={1000} />
      </div>
      <fieldset className="flex flex-wrap gap-2">
        <legend className="sr-only">Level</legend>
        {(["info", "warning", "critical"] as const).map((l) => (
          <label
            key={l}
            className={cn(
              "flex h-9 cursor-pointer items-center gap-2 rounded-sm border px-3 font-mono text-[0.7rem] uppercase tracking-[0.1em] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--accent)]",
              level === l ? (l === "critical" ? "border-signal-magenta text-signal-magenta" : l === "warning" ? "border-signal-amber text-signal-amber" : "border-signal-cyan text-signal-cyan") : "border-line text-mute",
            )}
          >
            <input type="radio" name="level" value={l} checked={level === l} onChange={() => setLevel(l)} className="sr-only" />
            {l}
          </label>
        ))}
      </fieldset>
      <Button type="submit" disabled={busy || title.trim().length < 2}>
        Broadcast
      </Button>
      <ActionFeedback error={error} message={message} />
    </form>
  );
}

export function DisplayLinkPanel() {
  const { run, busy, error, message } = useAction<{ path: string }>();
  const [link, setLink] = useState<string | null>(null);
  const make = async (action: "link" | "revoke") => {
    const r = await run("/api/admin/display", { action }, { success: action === "revoke" ? "All previous display links revoked. New link below." : "Link ready.", refresh: false });
    if (r) setLink(`${window.location.origin}${r.path}`);
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => make("link")} disabled={busy}>
          <Monitor /> Generate projector link
        </Button>
        <Button variant="destructive" onClick={() => make("revoke")} disabled={busy}>
          Revoke all links
        </Button>
      </div>
      {link ? (
        <div className="flex items-center gap-2">
          <Input readOnly value={link} aria-label="Projector link" className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
          <Button size="icon" variant="outline" aria-label="Copy link" onClick={() => navigator.clipboard?.writeText(link)}>
            <Copy />
          </Button>
        </div>
      ) : null}
      <ActionFeedback error={error} message={message} />
    </div>
  );
}
