"use client";

import { Loader2, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { api, ApiError } from "@/lib/api";

export interface StudioMetaForm {
  title: string;
  university: string;
  description: string;
  tagline: string;
  accent: "green" | "cyan" | "magenta" | "amber";
  logoText: string;
  teamMin: number;
  teamMax: number;
  mode: "online" | "hybrid" | "onsite";
  durationMinutes: number;
  startsAt?: string;
  endsAt?: string;
  registrationOpen: boolean;
  registrationCode?: string;
  timezone: string;
}

export const EMPTY_META: StudioMetaForm = {
  title: "",
  university: "",
  description: "",
  tagline: "",
  accent: "cyan",
  logoText: "",
  teamMin: 2,
  teamMax: 4,
  mode: "hybrid",
  durationMinutes: 300,
  registrationOpen: true,
  timezone: "Asia/Kolkata",
};

const toLocal = (iso?: string) => (iso ? new Date(iso).toISOString().slice(0, 16) : "");
const fromLocal = (v: string) => (v ? new Date(v).toISOString() : "");

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="label-mono">{label}</span>
      {children}
      {hint ? <span className="text-xs text-faint">{hint}</span> : null}
    </label>
  );
}

/** Event setup form, used by "Create new event" and the Setup tab. */
export function MetaForm({ initial, onSave, submitLabel }: { initial: StudioMetaForm; onSave: (m: StudioMetaForm) => Promise<void>; submitLabel: string }) {
  const [m, setM] = useState<StudioMetaForm>(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = <K extends keyof StudioMetaForm>(k: K, v: StudioMetaForm[K]) => setM((x) => ({ ...x, [k]: v }));
  return (
    <form
      className="grid gap-4 md:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr(null);
        try {
          await onSave({ ...m, startsAt: m.startsAt || undefined, endsAt: m.endsAt || undefined, registrationCode: m.registrationCode || undefined });
        } catch (x) {
          setErr(x instanceof ApiError ? x.message : "Could not save.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <Field label="Title">
        <Input value={m.title} onChange={(e) => set("title", e.target.value)} required minLength={3} maxLength={100} placeholder="CASE 018 — The Midnight Gallery" />
      </Field>
      <Field label="University / organiser">
        <Input value={m.university} onChange={(e) => set("university", e.target.value)} maxLength={120} placeholder="Halvorsen Institute of Technology" />
      </Field>
      <div className="md:col-span-2">
        <Field label="Description">
          <Textarea value={m.description} onChange={(e) => set("description", e.target.value)} maxLength={4000} className="min-h-20" />
        </Field>
      </div>
      <Field label="Tagline">
        <Input value={m.tagline} onChange={(e) => set("tagline", e.target.value)} maxLength={160} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Brand accent">
          <select className="h-9 rounded-xs border border-line bg-bg px-2 text-sm" value={m.accent} onChange={(e) => set("accent", e.target.value as StudioMetaForm["accent"])}>
            {["green", "cyan", "magenta", "amber"].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Logo mark" hint="Up to 4 letters">
          <Input value={m.logoText} onChange={(e) => set("logoText", e.target.value.toUpperCase())} maxLength={4} />
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Mode">
          <select className="h-9 rounded-xs border border-line bg-bg px-2 text-sm" value={m.mode} onChange={(e) => set("mode", e.target.value as StudioMetaForm["mode"])}>
            <option value="online">online</option>
            <option value="hybrid">hybrid</option>
            <option value="onsite">onsite</option>
          </select>
        </Field>
        <Field label="Team min">
          <Input type="number" min={1} max={12} value={m.teamMin} onChange={(e) => set("teamMin", Number(e.target.value))} />
        </Field>
        <Field label="Team max">
          <Input type="number" min={1} max={12} value={m.teamMax} onChange={(e) => set("teamMax", Number(e.target.value))} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Duration (minutes)">
          <Input type="number" min={30} max={10080} step={15} value={m.durationMinutes} onChange={(e) => set("durationMinutes", Number(e.target.value))} />
        </Field>
        <Field label="Time zone">
          <Input value={m.timezone} onChange={(e) => set("timezone", e.target.value)} maxLength={60} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Starts">
          <Input type="datetime-local" value={toLocal(m.startsAt)} onChange={(e) => set("startsAt", fromLocal(e.target.value))} />
        </Field>
        <Field label="Ends">
          <Input type="datetime-local" value={toLocal(m.endsAt)} onChange={(e) => set("endsAt", fromLocal(e.target.value))} />
        </Field>
      </div>
      <div className="flex items-end gap-4">
        <label className="flex items-center gap-2 pb-2 text-sm">
          <Switch checked={m.registrationOpen} onCheckedChange={(v) => set("registrationOpen", v)} /> Registration open
        </label>
        <div className="flex-1">
          <Field label="Registration code (optional)">
            <Input value={m.registrationCode ?? ""} onChange={(e) => set("registrationCode", e.target.value)} maxLength={64} />
          </Field>
        </div>
      </div>
      <div className="flex items-center gap-3 md:col-span-2">
        <Button type="submit" disabled={busy || m.title.trim().length < 3}>
          {busy ? <Loader2 className="animate-spin" /> : <Save />} {submitLabel}
        </Button>
        {err ? <span className="text-sm text-signal-magenta">{err}</span> : null}
      </div>
    </form>
  );
}

export function CreateEventForm() {
  const router = useRouter();
  return (
    <MetaForm
      initial={EMPTY_META}
      submitLabel="Create event"
      onSave={async (meta) => {
        const r = await api<{ id: string }>("/api/studio", { body: meta });
        router.push(`/studio/${r.id}?tab=story`);
      }}
    />
  );
}
