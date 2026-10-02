"use client";

import { Droplet, Gavel, Timer } from "lucide-react";
import { useState } from "react";

import CountUp from "@/components/reactbits/CountUp";
import DecryptedText from "@/components/reactbits/DecryptedText";
import GlitchText from "@/components/reactbits/GlitchText";
import HoldButton from "@/components/reactbits/HoldButton";
import LatticeLoader from "@/components/reactbits/LatticeLoader";
import SplitFlapText from "@/components/reactbits/SplitFlapText";
import SwipeToast from "@/components/reactbits/SwipeToast";
import TextType from "@/components/reactbits/TextType";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { AmbientTerminal } from "./ambient";
import { EvidenceCard, SuspectDossier, Timeline } from "./case-components";
import { CheckpointMark } from "./live-client";
import { PhaseBanner, PhaseChip } from "./phase";
import { EmptyState, ErrorState, LockedState, SkeletonCards, StandbyState, Stat } from "./primitives";

const TOKENS = [
  ["bg", "#05070A"],
  ["surface", "#0B1017"],
  ["raised", "#111A24"],
  ["line", "#1C2A38"],
  ["ink", "#D7E4F0"],
  ["mute", "#7F93A8"],
  ["green", "#39FF88"],
  ["cyan", "#00E5FF"],
  ["magenta", "#FF2E88"],
  ["amber", "#FFB020"],
] as const;

function Section({ id, title, children, note }: { id: string; title: string; children: React.ReactNode; note?: string }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-20 space-y-4 border-t border-line pt-8">
      <div>
        <h2 id={`${id}-h`} className="font-mono text-sm font-semibold uppercase tracking-[0.14em]">
          {title}
        </h2>
        {note ? <p className="mt-1 max-w-3xl text-sm text-mute">{note}</p> : null}
      </div>
      {children}
    </section>
  );
}

/** /dev/ui — the DOSSIER visual laboratory: tokens, primitives, composites and every React Bits integration in its real states. */
export function UiLab() {
  const [grantedKey, setGrantedKey] = useState(0);
  const [deniedKey, setDeniedKey] = useState(0);
  const [score, setScore] = useState(1240);
  const [toast, setToast] = useState(0);
  const [ambient, setAmbient] = useState(false);

  return (
    <div className="space-y-10">
      <nav aria-label="Lab sections" className="flex flex-wrap gap-2 font-mono text-[0.68rem] uppercase tracking-[0.1em]">
        {["tokens", "type", "controls", "states", "cards", "feedback", "inquest", "live", "motion", "ambient"].map((s) => (
          <a key={s} href={`#${s}`} className="rounded-xs border border-line px-2 py-1 text-mute hover:border-line-strong hover:text-ink">
            {s}
          </a>
        ))}
      </nav>

      <Section id="tokens" title="Tokens" note="Dark-first surfaces; four signal colours with fixed meanings. Accent/secondary are chosen per pack from the four signals.">
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {TOKENS.map(([n, hex]) => (
            <li key={n} className="panel overflow-hidden">
              <div className="h-14 border-b border-line" style={{ background: hex }} />
              <p className="px-2 py-1.5 font-mono text-[0.68rem]">
                {n} <span className="text-faint">{hex}</span>
              </p>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          <PhaseChip phase="standby" />
          <PhaseChip phase="live" />
          <PhaseChip phase="live" frozen />
          <PhaseChip phase="paused" />
          <PhaseChip phase="ended" />
        </div>
      </Section>

      <Section id="type" title="Typography" note="JetBrains Mono for headings, labels and numbers; IBM Plex Sans for long-form reading.">
        <div className="space-y-2">
          <p className="font-mono text-3xl font-bold uppercase tracking-[0.04em]">Operation Nightglass</p>
          <p className="font-mono text-xl font-semibold uppercase">Section heading</p>
          <p className="label-mono">Micro label / eyebrow</p>
          <p className="max-w-2xl text-base text-ink-dim">
            Long-form briefing text is set in a clean sans at a comfortable measure so a 400-word evidence file stays readable on a phone in a noisy corridor.
          </p>
          <p className="num text-2xl text-signal">1,776 · 12:04:33</p>
        </div>
      </Section>

      <Section id="controls" title="Controls" note="Customised shadcn primitives: hairline borders, mono labels, 1px physical press, accent focus ring.">
        <div className="flex flex-wrap gap-2">
          <Button>Primary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="signal">Signal</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
          <Button disabled>Disabled</Button>
          <Button variant="link">Link</Button>
        </div>
        <div className="grid max-w-3xl gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="lab-in">Input</Label>
            <Input id="lab-in" placeholder="DOSSIER{...}" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="lab-bad">Invalid</Label>
            <Input id="lab-bad" aria-invalid defaultValue="wrong" />
          </div>
          <Textarea placeholder="Textarea" />
          <label className="flex items-center gap-3 font-mono text-xs uppercase text-mute">
            <Switch defaultChecked /> Switch
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          {(["default", "outline", "success", "info", "warning", "danger", "accent", "secondary"] as const).map((v) => (
            <Badge key={v} variant={v}>
              {v}
            </Badge>
          ))}
        </div>
        <Tabs defaultValue="a" className="max-w-xl">
          <TabsList>
            <TabsTrigger value="a">Briefing</TabsTrigger>
            <TabsTrigger value="b">Evidence</TabsTrigger>
            <TabsTrigger value="c">Suspects</TabsTrigger>
          </TabsList>
          <TabsContent value="a" className="text-sm text-mute">
            Line tabs scroll horizontally on narrow screens.
          </TabsContent>
          <TabsContent value="b" className="text-sm text-mute">
            Evidence panel
          </TabsContent>
          <TabsContent value="c" className="text-sm text-mute">
            Suspects panel
          </TabsContent>
        </Tabs>
      </Section>

      <Section id="states" title="States" note="Loading, empty, error, locked and standby are designed surfaces, never a bare spinner.">
        <div className="grid gap-3 [&>*]:min-w-0 lg:grid-cols-2">
          <EmptyState compact title="Channel quiet">Nothing here yet.</EmptyState>
          <ErrorState compact title="Signal lost">The request failed.</ErrorState>
          <LockedState compact title="Classified">Solve linked challenges first.</LockedState>
          <StandbyState compact title="Board sealed">Opens at start.</StandbyState>
        </div>
        <SkeletonCards count={3} />
        <PhaseBanner phase="paused" frozen={false} />
        <PhaseBanner phase="live" frozen />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Teams" value={128} hint="registered" />
          <Stat label="Online" value={97} tone="info" />
          <Stat label="Subs / min" value={42.5} tone="accent" />
          <Stat label="Stuck" value={6} tone="warn" />
        </div>
      </Section>

      <Section id="feedback" title="Submission feedback" note="ACCESS GRANTED (DecryptedText mount), ACCESS DENIED (GlitchText 650ms burst), cooldown, verifying (LatticeLoader), score count-up (CountUp).">
        <div className="grid gap-3 [&>*]:min-w-0 lg:grid-cols-2">
          <div className="panel glow p-5 [--glow:var(--color-signal-green)]">
            <p className="label-mono !text-signal-green">{"// verified"}</p>
            <p className="mt-1 font-mono text-2xl font-bold tracking-[0.08em] text-signal-green text-glow">
              <DecryptedText key={grantedKey} text="ACCESS GRANTED" animateOn="mount" sequential speed={32} encryptedClassName="text-signal-green/50" />
            </p>
            <p className="mt-2 font-mono text-sm">
              <CountUp key={grantedKey} to={475} from={0} signed className="text-lg font-semibold text-signal-green" /> points
              <span className="ml-4 inline-flex items-center gap-1 text-signal-magenta">
                <Droplet className="size-4" /> First blood
              </span>
            </p>
            <Button size="xs" variant="ghost" className="mt-3" onClick={() => setGrantedKey((k) => k + 1)}>
              Replay
            </Button>
          </div>
          <div className="panel space-y-3 p-5">
            <p className="flex items-center gap-3 font-mono text-sm text-signal-magenta">
              <GlitchText burst burstKey={deniedKey} className="font-bold tracking-[0.12em]">
                ACCESS DENIED
              </GlitchText>
              <span className="text-ink-dim">2 more misses before a cooldown.</span>
            </p>
            <p className="flex items-center gap-2 font-mono text-sm text-signal-amber">
              <Timer className="size-4" /> Cooldown engaged. Retry in 20s.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Button size="xs" variant="ghost" onClick={() => setDeniedKey((k) => k + 1)}>
                Replay glitch
              </Button>
              <Button disabled className="min-w-36">
                <LatticeLoader label="Verifying" status="working" grid={3} cellSize={4} gap={2} fontSize={11} color="var(--accent-ink)" showTimer={false} />
              </Button>
            </div>
          </div>
        </div>
        <div className="panel flex flex-wrap items-center gap-4 p-5">
          <span className="label-mono">HUD score</span>
          <CountUp to={score} className="text-3xl font-semibold text-signal" />
          <Button size="sm" variant="outline" onClick={() => setScore((s) => s + 150)}>
            +150
          </Button>
          <Button size="sm" variant="outline" onClick={() => setScore((s) => s - 40)}>
            −40 (hint)
          </Button>
        </div>
      </Section>

      <Section id="inquest" title="Inquest surfaces" note="Evidence card, suspect dossier, timeline, typewriter reveal (TextType, ≤1.8s, tap to complete), hold-to-confirm accusation (HoldButton).">
        <div className="grid gap-3 [&>*]:min-w-0 lg:grid-cols-3">
          <EvidenceCard
            index={2}
            e={{ id: "x", title: "Keycard Access Log", kind: "record", summary: "Lab 3B door log for the night.", isNew: true, about: { characters: [{ id: "s", name: "Nisha Pillai" }], locations: [{ id: "l", name: "Robotics Lab 3B" }] } }}
          />
          <div className="lg:col-span-2">
            <SuspectDossier code="SUS-01" p={{ id: "s", name: "Arjun Rao", role: "PhD student", bio: "Wrote most of the navigation stack.", suspect: true, relationships: [{ to: "Nisha Pillai", kind: "co-author" }] }} />
          </div>
        </div>
        <div className="grid gap-3 [&>*]:min-w-0 lg:grid-cols-2">
          <div className="panel p-5">
            <Timeline items={[{ at: "22:58", title: "Victim enters lab", body: "Badge swipe." }, { at: "23:36", title: "Card swiped", body: "N. Pillai's card." }]} hidden={3} />
          </div>
          <div className="panel space-y-4 p-5">
            <TextType text="A robotics professor found sedated in her lab. Her prototype drive — gone." as="p" className="font-mono text-sm" />
            <HoldButton size="md" holdTime={1500} resetAfter={1200} backgroundColor="var(--color-raised)" fillColor="var(--color-signal-magenta)" textColor="var(--color-ink)" fillTextColor="var(--color-bg)" radius={3} icon={<Gavel className="size-4" />} doneLabel="Filed" className="w-full font-mono text-[0.78rem] uppercase tracking-[0.1em]">
              Hold to accuse
            </HoldButton>
          </div>
        </div>
      </Section>

      <Section id="live" title="Live checkpoints" note="StatusMark (React Bits) with the state always written out.">
        <div className="panel flex flex-wrap gap-6 p-5">
          <CheckpointMark status="open" />
          <CheckpointMark status="pending" />
          <CheckpointMark status="confirmed" />
          <CheckpointMark status="rejected" />
        </div>
      </Section>

      <Section id="motion" title="Motion moments" note="SplitFlapText departure clock (projector); SwipeToast announcements (swipe down or Esc to dismiss).">
        <div className="panel flex flex-wrap items-center gap-6 p-5">
          <SplitFlapText text="02:41" charset="0123456789:" fontSize={28} tileColor="#111A24" textColor="#39FF88" loop={false} />
          <Button variant="outline" onClick={() => setToast((t) => t + 1)}>
            Show announcement toast
          </Button>
        </div>
        {toast ? (
          <div className="max-w-sm">
            <SwipeToast key={toast} inline title={<span className="font-mono text-[0.78rem] uppercase">Hint drop in 5 min</span>} description="Every team gets a free hint for the Vault." duration={6000} background="var(--color-raised)" fuseColor="var(--color-signal-cyan)" closeButton width={360} radius={4} />
          </div>
        ) : null}
      </Section>

      <Section id="ambient" title="Ambient layer" note="FaultyTerminal (React Bits, WebGL) — landing hero and projector only; never behind gameplay. Off for reduced motion, weak devices and effects-off.">
        <Button variant="outline" onClick={() => setAmbient((a) => !a)}>
          {ambient ? "Hide" : "Preview"} ambient background
        </Button>
        {ambient ? (
          <div className="panel relative h-64 overflow-hidden">
            <AmbientTerminal />
            <p className="relative grid h-full place-items-center font-mono text-2xl font-bold uppercase">Legibility check</p>
          </div>
        ) : null}
      </Section>
    </div>
  );
}
