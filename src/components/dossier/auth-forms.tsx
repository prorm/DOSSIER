"use client";

import { ArrowRight, Minus, Plus, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, type ReactNode } from "react";

import { FrontBackdrop } from "@/components/experience/front/front-backdrop";
import LatticeLoader from "@/components/reactbits/LatticeLoader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError, formatDuration } from "@/lib/api";
import type { UniverseInput } from "@/lib/experience/universe";

function Field({ label, children, hint, error, id }: { label: string; children: ReactNode; hint?: ReactNode; error?: string | null; id: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? (
        <p id={`${id}-err`} className="font-mono text-[0.7rem] text-signal-magenta">
          {error}
        </p>
      ) : hint ? (
        <p className="font-mono text-[0.68rem] text-faint">{hint}</p>
      ) : null}
    </div>
  );
}

function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="flex items-start gap-2 rounded-sm border border-[color-mix(in_srgb,var(--color-signal-magenta)_45%,transparent)] bg-[color-mix(in_srgb,var(--color-signal-magenta)_8%,transparent)] px-3 py-2 font-mono text-xs text-signal-magenta">
      <TriangleAlert className="mt-px size-4 shrink-0" aria-hidden="true" /> {message}
    </p>
  );
}

function Submit({ busy, children }: { busy: boolean; children: ReactNode }) {
  return (
    <Button type="submit" size="lg" disabled={busy} className="w-full">
      {busy ? <LatticeLoader label="Authenticating" status="working" grid={3} cellSize={4} gap={2} fontSize={11} color="var(--accent-ink)" showTimer={false} /> : children}
    </Button>
  );
}

function errMessage(e: unknown) {
  if (e instanceof ApiError) return e.code === "rate_limited" && e.retryAfterMs ? `${e.message} (${formatDuration(e.retryAfterMs)})` : e.message;
  return "Something went wrong. Try again.";
}

export function TeamLoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/play";

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setBusy(true);
        setError(null);
        try {
          await api("/api/auth/login", { body: { teamName: String(f.get("teamName") ?? ""), password: String(f.get("password") ?? "") } });
          router.push(safeNext);
          router.refresh();
        } catch (err) {
          setError(errMessage(err));
          setBusy(false);
        }
      }}
    >
      <FormError message={error} />
      <Field label="Team name" id={`${id}-t`}>
        <Input id={`${id}-t`} name="teamName" autoComplete="username" required maxLength={64} autoCapitalize="off" />
      </Field>
      <Field label="Password" id={`${id}-p`}>
        <Input id={`${id}-p`} name="password" type="password" autoComplete="current-password" required maxLength={128} />
      </Field>
      <Submit busy={busy}>
        Sign in <ArrowRight />
      </Submit>
      <p className="text-center font-mono text-xs text-mute">
        New team?{" "}
        <Link className="text-signal-2 underline underline-offset-4" href="/register">
          Register
        </Link>
      </p>
    </form>
  );
}

export function RegisterForm({ minMembers, maxMembers, requiresCode }: { minMembers: number; maxMembers: number; requiresCode: boolean }) {
  const router = useRouter();
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [members, setMembers] = useState<{ name: string; email: string }[]>(Array.from({ length: Math.max(1, minMembers) }, () => ({ name: "", email: "" })));
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const mismatch = pw2.length > 0 && pw !== pw2;

  return (
    <form
      className="space-y-5"
      onSubmit={async (e) => {
        e.preventDefault();
        if (pw !== pw2) return setError("Passwords do not match.");
        const f = new FormData(e.currentTarget);
        setBusy(true);
        setError(null);
        try {
          await api("/api/auth/register", {
            body: {
              teamName: String(f.get("teamName") ?? ""),
              password: pw,
              affiliation: String(f.get("affiliation") ?? ""),
              code: String(f.get("code") ?? ""),
              members: members.map((m) => ({ name: m.name, email: m.email })),
            },
          });
          router.push("/play");
          router.refresh();
        } catch (err) {
          setError(errMessage(err));
          setBusy(false);
        }
      }}
    >
      <FormError message={error} />
      <Field label="Team name" id={`${id}-t`} hint="3–32 characters. Shown on the public leaderboard.">
        <Input id={`${id}-t`} name="teamName" required minLength={3} maxLength={32} autoComplete="username" autoCapitalize="off" />
      </Field>
      <Field label="College / affiliation (optional)" id={`${id}-a`}>
        <Input id={`${id}-a`} name="affiliation" maxLength={60} autoComplete="organization" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Password" id={`${id}-p`} hint="At least 8 characters. Share it with your teammates.">
          <Input id={`${id}-p`} type="password" value={pw} onChange={(e) => setPw(e.target.value)} required minLength={8} maxLength={128} autoComplete="new-password" />
        </Field>
        <Field label="Confirm password" id={`${id}-p2`} error={mismatch ? "Passwords do not match" : null}>
          <Input
            id={`${id}-p2`}
            type="password"
            value={pw2}
            onChange={(e) => setPw2(e.target.value)}
            required
            autoComplete="new-password"
            aria-invalid={mismatch || undefined}
            aria-describedby={mismatch ? `${id}-p2-err` : undefined}
          />
        </Field>
      </div>
      {requiresCode ? (
        <Field label="Registration code" id={`${id}-c`} hint="Given to you by the organisers.">
          <Input id={`${id}-c`} name="code" required maxLength={64} autoCapitalize="characters" />
        </Field>
      ) : null}

      <fieldset className="space-y-2">
        <legend className="label-mono mb-2 flex w-full items-center justify-between">
          <span>
            Members ({members.length}/{maxMembers})
          </span>
          <span className="flex gap-1">
            <Button type="button" size="icon-xs" variant="outline" aria-label="Remove member" disabled={members.length <= minMembers} onClick={() => setMembers((m) => m.slice(0, -1))}>
              <Minus />
            </Button>
            <Button type="button" size="icon-xs" variant="outline" aria-label="Add member" disabled={members.length >= maxMembers} onClick={() => setMembers((m) => [...m, { name: "", email: "" }])}>
              <Plus />
            </Button>
          </span>
        </legend>
        {members.map((m, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-2">
            <Input
              aria-label={`Member ${i + 1} name`}
              placeholder={`Member ${i + 1} name`}
              value={m.name}
              required
              maxLength={60}
              onChange={(e) => setMembers((all) => all.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
            />
            <Input
              aria-label={`Member ${i + 1} email (optional)`}
              placeholder="email (optional)"
              type="email"
              value={m.email}
              maxLength={120}
              onChange={(e) => setMembers((all) => all.map((x, j) => (j === i ? { ...x, email: e.target.value } : x)))}
            />
          </div>
        ))}
      </fieldset>
      <Submit busy={busy}>
        Create team <ArrowRight />
      </Submit>
      <p className="text-center font-mono text-xs text-mute">
        Already registered?{" "}
        <Link className="text-signal-2 underline underline-offset-4" href="/login">
          Sign in
        </Link>
      </p>
    </form>
  );
}

export function StaffLoginForm() {
  const router = useRouter();
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setBusy(true);
        setError(null);
        try {
          const r = await api<{ redirect: string }>("/api/staff/login", { body: { email: String(f.get("email") ?? ""), password: String(f.get("password") ?? "") } });
          router.push(r.redirect);
          router.refresh();
        } catch (err) {
          setError(errMessage(err));
          setBusy(false);
        }
      }}
    >
      <FormError message={error} />
      <Field label="Email" id={`${id}-e`}>
        <Input id={`${id}-e`} name="email" type="email" autoComplete="username" required />
      </Field>
      <Field label="Password" id={`${id}-p`}>
        <Input id={`${id}-p`} name="password" type="password" autoComplete="current-password" required />
      </Field>
      <Submit busy={busy}>
        Sign in <ArrowRight />
      </Submit>
    </form>
  );
}

export interface FrontTeaser {
  input: UniverseInput;
  fingerprint: string;
  layoutSeed: string;
  accent: string;
}

/** The sign-in and registration frame. With a teaser it sits in front of the event's own universe. */
export function AuthFrame({ title, eyebrow, children, aside, teaser }: { title: string; eyebrow: string; children: ReactNode; aside?: ReactNode; teaser?: FrontTeaser | null }) {
  return (
    <main id="main" className="relative grid min-h-dvh place-items-center px-4 py-10">
      {teaser ? <FrontBackdrop {...teaser} veil="centre" /> : <div aria-hidden="true" className="grid-bg absolute inset-0 opacity-40 [mask-image:radial-gradient(60%_60%_at_50%_40%,#000,transparent)]" />}
      <div className="relative z-10 w-full max-w-md">
        <Link href="/" className="mb-6 inline-block font-mono text-[0.7rem] uppercase tracking-[0.18em] text-mute hover:text-ink">
          ‹ DOSSIER
        </Link>
        <div className="panel brackets bg-[color-mix(in_srgb,var(--color-surface)_84%,transparent)] p-5 backdrop-blur-md sm:p-7">
          <p className="label-mono">{eyebrow}</p>
          <h1 className="mt-1 mb-6 text-xl font-semibold uppercase tracking-[0.04em]">{title}</h1>
          {children}
        </div>
        {aside ? <div className="mt-4">{aside}</div> : null}
      </div>
    </main>
  );
}
