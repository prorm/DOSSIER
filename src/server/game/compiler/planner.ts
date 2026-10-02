import { Blueprint, type BlueprintInput, type BlueprintT, type FamilyId, type HintLevel } from "../core/blueprint";
import { TIER_TARGETS, tierFor, type Curve, type Tier } from "../core/difficulty";
import type { Gate } from "../core/gates";
import { CODEWORDS } from "../core/pools";
import { getPrimitive } from "../primitives/registry";
import { familyAffinity, mapConcepts, type MechanicSuggestion } from "./mapper";
import { slug, type ExtractedStory } from "./story";

/**
 * Event planner: story model + rounds + curve → a complete blueprint.
 *
 * Deterministic. Every node is a trusted primitive with a schema-valid config;
 * cross-round multi-hop chains are expressed as fact exports; difficulty is
 * raised structurally (more channels, decoys, dependency depth, harden()
 * transforms), never by making strings longer.
 */

export interface PlanOptions {
  eventId: string;
  title: string;
  university?: string;
  description?: string;
  durationMinutes: number;
  teamSize?: { min: number; max: number };
  mode?: "online" | "hybrid" | "onsite";
  rounds: FamilyId[];
  curve: Curve;
  customTiers?: Tier[];
  startsAt?: string;
  endsAt?: string;
  /** Local time zone offset of the story's clocks (minutes east of UTC). */
  utcOffsetMinutes?: number;
  timezone?: string;
}

export interface PlanResult {
  blueprint: BlueprintInput;
  notes: string[];
  suggestions: MechanicSuggestion[];
  targetNodes: number;
}

type NodeIn = NonNullable<BlueprintInput["nodes"]>[number];
type EvidenceIn = NonNullable<BlueprintInput["evidence"]>[number];

const FAMILY_TITLE: Record<FamilyId, string> = {
  cryptic: "The Message",
  browser: "The Terminal",
  forensics: "The Evidence",
  ctf: "The Machine",
  osint: "The Public Trail",
  inquest: "The Inquest",
  physical: "The Field",
  final: "The Reconstruction",
  custom: "Special Operations",
};

const FAMILY_WEIGHT: Record<FamilyId, number> = { cryptic: 2, browser: 3, forensics: 4, ctf: 3, osint: 2, inquest: 4, physical: 2, final: 1, custom: 1 };

function hints(tier: Tier, items: [HintLevel, string][]): { level: HintLevel; text: string; cost?: number }[] {
  const mult = TIER_TARGETS[tier].hintCostMultiplier;
  const base: Record<HintLevel, number> = { nudge: 20, partial: 40, artifact: 50, technique: 60, "partial-answer": 100, explicit: 150 };
  let last = 0;
  return items.map(([level, text]) => {
    const cost = Math.max(last, Math.round((base[level] * mult) / 5) * 5);
    last = cost;
    return { level, text, cost };
  });
}

interface Cast {
  culprit: { id: string; name: string };
  decoys: { id: string; name: string }[];
  victim: { id: string; name: string };
  scene: { id: string; name: string };
  field: { id: string; name: string; geo?: { lat: number; lon: number } };
  org: string;
  incidentTime: string;
  motive: string;
  method: string;
}

function resolveCast(ex: ExtractedStory, notes: string[]): { cast: Cast; story: ExtractedStory["story"] } {
  const story = structuredClone(ex.story);
  let suspects = story.characters.filter((c) => c.suspect);
  if (suspects.length < 2) {
    for (const c of story.characters) if (!c.suspect && suspects.length < 2 && c.id !== story.characters[0]?.id) {
      c.suspect = true;
      suspects = story.characters.filter((x) => x.suspect);
    }
    while (suspects.length < 2) {
      const name = suspects.length === 0 ? "Alex Mercer" : "Sam Okoro";
      story.characters.push({ id: slug(name), name, role: "Person with access", bio: "Added by the planner: the story named fewer than two suspects.", suspect: true, traits: [], relationships: [] });
      suspects = story.characters.filter((x) => x.suspect);
      notes.push(`Added placeholder suspect "${name}" (fewer than two suspects in the story).`);
    }
  }
  const culpritId = story.truth.culprit && suspects.some((s) => s.id === story.truth.culprit) ? story.truth.culprit : suspects[0]!.id;
  if (!story.truth.culprit) notes.push(`No culprit declared; planner chose ${suspects.find((s) => s.id === culpritId)!.name}.`);
  story.truth.culprit = culpritId;
  let victim = story.characters.find((c) => !c.suspect);
  if (!victim) {
    victim = { id: "victim", name: "The victim", role: "Missing person", bio: "", suspect: false, traits: [], relationships: [] };
    story.characters.unshift(victim);
  }
  if (!story.locations.length) story.locations.push({ id: "scene", name: "The scene", description: "Where it happened." });
  const scene = story.locations.find((l) => l.id === story.truth.location) ?? story.locations[0]!;
  story.truth.location = scene.id;
  let field = story.locations.find((l) => l.geo && l.id !== scene.id) ?? story.locations.find((l) => l.id !== scene.id);
  if (!field) {
    field = { id: "meeting-point", name: "Meeting point", description: "A public place on campus chosen by the organisers." };
    story.locations.push(field);
  }
  const time = /^\d{2}:\d{2}$/.test(story.truth.time) ? story.truth.time : (story.timeline.find((t) => t.actors.includes(culpritId))?.at ?? "02:47");
  story.truth.time = time;
  const culprit = story.characters.find((c) => c.id === culpritId)!;
  return {
    story,
    cast: {
      culprit: { id: culprit.id, name: culprit.name },
      decoys: suspects.filter((s) => s.id !== culpritId).map((s) => ({ id: s.id, name: s.name })),
      victim: { id: victim.id, name: victim.name },
      scene: { id: scene.id, name: scene.name },
      field: { id: field.id, name: field.name, geo: field.geo },
      org: story.organizations[0]?.name ?? "an outside buyer",
      incidentTime: time,
      motive: story.truth.motive || story.motives.find((m) => m.character === culpritId)?.text || `Profit from a deal with ${story.organizations[0]?.name ?? "an outside buyer"}`,
      method: story.truth.method || `Entered ${scene.name} on someone else's access during the incident window and destroyed the records.`,
    },
  };
}

interface Ctx {
  cast: Cast;
  nodes: NodeIn[];
  evidence: EvidenceIn[];
  relations: NonNullable<BlueprintInput["relations"]>;
  redHerrings: NonNullable<BlueprintInput["redHerrings"]>;
  sites: NonNullable<BlueprintInput["sites"]>;
  checkpoints: NonNullable<BlueprintInput["checkpoints"]>;
  exports: Set<string>;
  /** Evidence produced so far, by role. */
  roles: Partial<Record<"place" | "motive" | "record" | "photo" | "log" | "capture" | "alibi", string>>;
  tz: number;
  notes: string[];
}

function ev(ctx: Ctx, e: EvidenceIn): string {
  if (!ctx.evidence.some((x) => x.id === e.id)) ctx.evidence.push(e);
  return e.id;
}

/* ─────────────────────────── family generators ─────────────────────────── */

type Gen = (ctx: Ctx, round: { id: string; tier: Tier }, entry: Gate | undefined, budget: number) => { key: string[] };

const cryptic: Gen = (ctx, r, entry, budget) => {
  const { cast } = ctx;
  const t = TIER_TARGETS[r.tier];
  const id = `${r.id}-signal`;
  const steps = [
    { prompt: "The message opens with a word mirrored end to end of the alphabet: **`{{codeword | atbash}}`**", answer: "{{codeword}}", reveal: "The word is a key." },
    { prompt: "A second word follows, enciphered with that key (Vigenère): **`{{portalWord | vigenere:@codeword}}`**", answer: "{{portalWord}}", reveal: `${cast.victim.name} wanted someone to look at the {{portalWord}} system.` },
  ];
  if (t.statefulSteps >= 3) steps.push({ prompt: "The last line is the same key, reversed and mirrored: **`{{codeword | reverse | atbash}}`** — restore it and add the second word after a dash.", answer: "{{codeword}}-{{portalWord}}", reveal: "Confirmed." });
  ctx.nodes.push({
    id,
    round: r.id,
    title: "The first message",
    primitive: "cryptic",
    briefing: `A short message connected to ${cast.victim.name}'s disappearance was intercepted. Work through it clue by clue.`,
    config: { steps, intentional: ["atbash"] },
    gate: entry,
    rewards: { evidence: [ev(ctx, { id: "ev-message", title: "The decoded message", kind: "message", body: "Key **{{codeword}}**. System **{{portalWord}}**.", about: { characters: [cast.victim.id], locations: [], timeline: [] } })], flags: {}, resources: {}, timeline: [], locations: [] },
    scoring: { points: 100 },
    estimatedMinutes: t.minutes,
    hints: hints(r.tier, [["nudge", "Atbash: A↔Z, B↔Y…"], ["technique", "The second clue is Vigenère keyed with the first answer."]]),
  });
  const key = [id];
  if (budget >= 2) {
    const names = [cast.culprit, ...cast.decoys].map((p) => p.name.split(" ").at(-1)!.toUpperCase().replace(/[^A-Z]/g, "")).slice(0, 3);
    const plain = names.join("");
    const railed = (() => {
      const rows: string[][] = [[], [], []];
      let i = 0;
      let d = 1;
      for (const ch of plain) {
        rows[i]!.push(ch);
        if (i === 0) d = 1;
        else if (i === 2) d = -1;
        i += d;
      }
      return rows.map((x) => x.join("")).join("");
    })();
    ctx.nodes.push({
      id: `${r.id}-roster`,
      round: r.id,
      title: "Who had access?",
      primitive: "cryptic",
      briefing: `The access list for ${cast.scene.name} arrived scrambled.`,
      config: { steps: [{ prompt: `Surnames, no spaces, written in a zig-zag over three rails and read row by row: **\`${railed}\`**`, answer: plain, reveal: `Only ${names.length} people could get in.` }] },
      gate: entry,
      optional: true,
      rewards: { evidence: [ev(ctx, { id: "ev-roster", title: "Access roster", kind: "record", body: `Access to ${cast.scene.name}: ${[cast.culprit, ...cast.decoys].map((p) => p.name).join(", ")}.`, about: { characters: [cast.culprit.id, ...cast.decoys.map((d) => d.id)], locations: [cast.scene.id], timeline: [] } })], flags: {}, resources: { intel: 1 }, timeline: [], locations: [] },
      scoring: { points: 40 },
      estimatedMinutes: 6,
    });
  }
  return { key };
};

const browser: Gen = (ctx, r, entry, budget) => {
  const { cast } = ctx;
  const t = TIER_TARGETS[r.tier];
  const site = "portal";
  if (!ctx.sites.some((s) => s.id === site))
    ctx.sites.push({
      id: site,
      template: "intranet",
      title: `${cast.scene.name.split(" ").slice(-2).join(" ")} Portal`,
      org: cast.scene.name,
      tagline: "Internal services. Authorised users only.",
      news: [
        { title: "Maintenance window", date: "yesterday", body: "Credentials rotated for the audit. Report failures to the admins." },
        { title: "Outage advisory", date: "today", body: "Expect outages tonight. The portal may run in offline mode." },
      ],
      people: [cast.victim, cast.culprit, ...cast.decoys].map((p, i) => ({ name: p.name, title: i === 0 ? "Lead" : "Staff", email: `${slug(p.name)}@portal.example.edu`, ext: String(4100 + i) })),
    });
  const channels = ["response-header", "indexeddb", "html-comment", "server-timing", "session-storage", "query-param"].slice(0, Math.min(6, 2 + Math.ceil(t.depth / 2)));
  const portal = `${r.id}-portal`;
  ctx.nodes.push({
    id: portal,
    round: r.id,
    title: "The portal remembers",
    primitive: "web-investigation",
    gate: entry,
    briefing: `The internal portal looks ordinary. ${cast.victim.name}'s notes mention a **maintenance passphrase** the portal client assembles. Nothing on the page shows it — everything is in what the page *does*.`,
    config: { site, mode: "fragments", channels, orderChannel: "sourcemap", decoys: t.redHerrings + 1, secretName: "maintenance passphrase" },
    exports: { maintPass: "answer" },
    rewards: { evidence: [ev(ctx, { id: "ev-portal", title: "Portal maintenance passphrase", kind: "record", body: "Recovered from the portal client.", about: { characters: [], locations: [cast.scene.id], timeline: [] } })], flags: {}, resources: {}, timeline: [], locations: [] },
    scoring: { points: 200 },
    estimatedMinutes: t.minutes + 4,
    hints: hints(r.tier, [["nudge", "Open DevTools before reloading. Watch Network."], ["technique", "Fragments hide in headers, storage, comments and timing; the order is in the source map."]]),
  });
  ctx.exports.add("maintPass");
  const key = [portal];
  if (budget >= 2) {
    const rec = `${r.id}-records`;
    ctx.nodes.push({
      id: rec,
      round: r.id,
      title: "The records desk",
      primitive: "session-state",
      gate: { node: portal },
      briefing: `A records page refuses you. Only one of the portal's cookies decides your clearance, and the portal tells you how clearance is granted — if you watch the right response.`,
      config: {
        site,
        code: "{{maintPass}}",
        recordTitle: `Door controller export — ${cast.scene.name}`,
        columns: ["time", "door", "badge", "result"],
        rows: [
          ["01:02:44", "A-101", "KR-2231", "GRANTED"],
          ["{{incidentTime}}:13", cast.scene.name.slice(0, 24), "{{badgeId}}", "GRANTED"],
          ["{{incidentTime | addmin:4}}:02", "A-117", "KR-9043", "DENIED"],
        ],
        answer: "{{badgeId}}",
        question: `Which badge opened ${cast.scene.name} during the incident?`,
        decoyCookies: Math.min(6, 2 + t.redHerrings),
      },
      rewards: { evidence: [ev(ctx, { id: "ev-door", title: "Door controller export", kind: "log", body: `Badge {{badgeId}} opened ${cast.scene.name} during the incident.`, about: { characters: [], locations: [cast.scene.id], timeline: [] } })], flags: {}, resources: {}, timeline: [], locations: [] },
      scoring: { points: 200 },
      estimatedMinutes: t.minutes + 2,
      hints: hints(r.tier, [["nudge", "Read the 403 response headers."], ["technique", "Clearance is a POST carrying a header; the code is the passphrase you assembled."]]),
    });
    ctx.roles.record ??= "ev-door";
    key.push(rec);
  }
  if (budget >= 3) {
    ctx.nodes.push({
      id: `${r.id}-offline`,
      round: r.id,
      title: "Offline mode",
      primitive: "web-investigation",
      gate: { node: portal },
      briefing: "Offline mode kept someone's drafts in your browser. One was never sent. Follow the sync machinery to it.",
      config: { site, mode: "chain", decoys: 2 + t.redHerrings, secretName: "note reference", chainNote: `Unsent — from ${cast.victim.name}: "If something happens, look at ${cast.culprit.name.split(" ")[0]}. Ref %ANSWER%."` },
      rewards: { evidence: [ev(ctx, { id: "ev-unsent", title: "The unsent note", kind: "message", body: `${cast.victim.name} suspected ${cast.culprit.name}.`, about: { characters: [cast.victim.id, cast.culprit.id], locations: [], timeline: [] } })], flags: {}, resources: {}, timeline: [], locations: [] },
      scoring: { points: 150 },
      estimatedMinutes: t.minutes,
    });
  }
  return { key };
};

const forensics: Gen = (ctx, r, entry, budget) => {
  const { cast, tz } = ctx;
  const t = TIER_TARGETS[r.tier];
  const key: string[] = [];
  const all: (() => void)[] = [];
  all.push(() => {
    const id = `${r.id}-recording`;
    ctx.nodes.push({
      id,
      round: r.id,
      title: "The recording",
      primitive: "audio-forensics",
      gate: entry,
      briefing: "A raw recording from the night. Two channels, and they are not the same.",
      config: {
        question: "What is the key? (Morse word and DTMF digits, joined with a dash)",
        answer: "{{txWord}}-{{txDigits}}",
        answerFormat: "WORD-####",
        filename: "recording_raw.wav",
        left: [{ kind: "silence", seconds: 0.6 }, { kind: t.depth >= 5 ? "reversed-morse" : "morse", text: "{{txWord}}", wpm: 14 }],
        right: [{ kind: "dtmf", text: "{{txDigits}}" }, { kind: "silence", seconds: 0.3 }, { kind: "spectrogram", text: "L THEN R" }],
      },
      exports: { txKey: "answer" },
      rewards: { evidence: [ev(ctx, { id: "ev-recording", title: "The recording", kind: "audio", body: "Morse left, tones and a spectrogram right.", about: { characters: [cast.victim.id], locations: [], timeline: [] } })], flags: {}, resources: {}, timeline: [], locations: [] },
      scoring: { points: 200 },
      estimatedMinutes: t.minutes,
      hints: hints(r.tier, [["nudge", "Split the stereo channels."], ["technique", "Left: Morse. Right: DTMF and a spectrogram."]]),
    });
    ctx.exports.add("txKey");
    key.push(id);
  });
  all.push(() => {
    const id = `${r.id}-logs`;
    ctx.nodes.push({
      id,
      round: r.id,
      title: "The logs",
      primitive: "file-forensics",
      gate: entry,
      briefing: "What was left of the machine's logs, plus the power log. The host clock was never set to local time.",
      config: {
        question: `At what local time did the wipe begin?`,
        answer: "{{incidentTime}}",
        answerFormat: "HH:MM",
        files: [
          {
            kind: "log",
            name: "syslog.txt",
            date: "2026-03-13",
            host: "ws-01",
            header: "# clock: UTC",
            entries: [
              { time: `{{incidentTime | addmin:${-tz - 2}}}:51`, text: `sshd[3312]: Accepted password for ${slug(cast.culprit.name).split("-")[0]} from 10.14.3.{{hostOctet}}` },
              { time: `{{incidentTime | addmin:${-tz}}}:41`, text: "maint[4121]: secure-erase started on /dev/nvme0n1" },
            ],
            noise: { count: 60 + 40 * t.redHerrings, from: "18:00", to: "23:00", messages: ["CRON[%PID%]: (root) CMD (run-parts /etc/cron.hourly)", "sshd[%PID%]: Connection closed by %IP% port %N%", "systemd[1]: Started session %N%."] },
          },
        ],
      },
      rewards: { evidence: [ev(ctx, { id: "ev-logs", title: "Workstation logs", kind: "log", body: `A login for ${cast.culprit.name}'s account, then a secure erase.`, about: { characters: [cast.culprit.id], locations: [cast.scene.id], timeline: [] } })], flags: {}, resources: {}, timeline: [], locations: [] },
      scoring: { points: 150 },
      estimatedMinutes: t.minutes,
      hints: hints(r.tier, [["nudge", "grep for erase."], ["technique", `The host clock is UTC; convert to local (UTC${tz >= 0 ? "+" : "-"}${String(Math.floor(Math.abs(tz) / 60)).padStart(2, "0")}:${String(Math.abs(tz) % 60).padStart(2, "0")}).`]]),
    });
    ctx.roles.log ??= "ev-logs";
    key.push(id);
  });
  all.push(() => {
    const id = `${r.id}-photo`;
    ctx.nodes.push({
      id,
      round: r.id,
      title: "The photograph",
      primitive: "image-forensics",
      gate: entry,
      briefing: "A photo uploaded from a phone during the night.",
      config: {
        question: "At what local time was the photo taken?",
        answer: "{{incidentTime | addmin:6}}",
        answerFormat: "HH:MM",
        filename: "IMG_night.jpg",
        lines: [`CALL ${cast.org.split(" ")[0]!.toUpperCase().slice(0, 12)} FRI`, `MEET -> ${cast.field.name.toUpperCase().slice(0, 18)}`],
        exif: { make: "Google", model: "Pixel 7", dateTimeOriginal: `2026:03:13 {{incidentTime | addmin:${6 - tz}}}:42`, offsetTimeOriginal: "+00:00", ownerName: slug(cast.culprit.name).replace("-", ".") },
      },
      rewards: { evidence: [ev(ctx, { id: "ev-photo", title: "The photograph", kind: "photo", body: `Taken on ${cast.culprit.name}'s phone.`, about: { characters: [cast.culprit.id], locations: [cast.scene.id], timeline: [] } })], flags: {}, resources: {}, timeline: [], locations: [] },
      scoring: { points: 150 },
      estimatedMinutes: t.minutes - 2,
      hints: hints(r.tier, [["nudge", "Look at the metadata."], ["technique", "exiftool: DateTimeOriginal is UTC."]]),
    });
    ctx.roles.photo ??= "ev-photo";
    key.push(id);
  });
  all.push(() => {
    const id = `${r.id}-archive`;
    const recording = ctx.nodes.find((n) => n.primitive === "audio-forensics" && n.round === r.id);
    const password = ctx.exports.has("txKey") ? "{{txKey}}" : ctx.exports.has("maintPass") ? "{{maintPass}}" : "{{dealRef}}";
    ctx.nodes.push({
      id,
      round: r.id,
      title: "The locked archive",
      primitive: "file-forensics",
      gate: recording ? { node: recording.id } : entry,
      briefing: "An encrypted archive, uploaded minutes before everything went dark. Its comment says the key is something you already recovered.",
      config: {
        question: `What deal reference did ${cast.org} quote?`,
        answer: "{{dealRef}}",
        answerFormat: "CA-####-XX",
        files: [
          {
            kind: "email",
            name: "offer.eml",
            from: `Partnerships <partnerships@${slug(cast.org).slice(0, 20) || "buyer"}.example>`,
            to: `${cast.culprit.name} <${slug(cast.culprit.name)}@portal.example.edu>`,
            subject: "Re: terms",
            date: "2026-03-10T16:42:00Z",
            tz: "+0000",
            received: ["from mx.portal.example.edu (10.14.0.25) by imap.portal.example.edu; Tue, 10 Mar 2026 16:42:09 +0000"],
            headers: { "X-Deal-Reference": "{{dealRef}}" },
            body: "As discussed: we settle on handover. Reference in the header.",
          },
        ],
        zip: { name: "backup.zip", password, comment: "the key is something you already have" },
      },
      rewards: { evidence: [ev(ctx, { id: "ev-offer", title: `${cast.org} offer`, kind: "message", body: `${cast.org} offered ${cast.culprit.name} a deal. Reference {{dealRef}}.`, about: { characters: [cast.culprit.id], locations: [], timeline: [] } })], flags: {}, resources: {}, timeline: [], locations: [] },
      scoring: { points: 200 },
      estimatedMinutes: t.minutes - 2,
      hints: hints(r.tier, [["nudge", "unzip -P / 7-Zip."], ["technique", "Read the X- headers."]]),
    });
    ctx.roles.motive ??= "ev-offer";
    key.push(id);
  });
  all.push(() => {
    const id = `${r.id}-notebook`;
    ctx.nodes.push({
      id,
      round: r.id,
      title: "The notebook",
      primitive: "pdf-forensics",
      gate: entry,
      briefing: `${cast.victim.name}'s notebook, exported as a PDF. Some lines were "redacted".`,
      config: {
        question: `Which locker at ${cast.field.name} holds the spare kit?`,
        answer: "{{lockerNo}}",
        answerFormat: "number",
        filename: "notebook.pdf",
        title: "Lab notebook",
        author: cast.victim.name.slice(0, 80),
        keywords: ["audit", "kit"],
        pages: [
          { heading: "Day 1", lines: ["Credentials rotated for the audit.", `${cast.culprit.name} offered to take over. Declined.`] },
          { heading: "Day 2", lines: ["Rotation was reverted overnight.", "If tonight goes wrong:"], redacted: [{ text: `Spare kit: ${cast.field.name.slice(0, 40)} locker {{lockerNo}}.`, afterLine: 1 }] },
        ],
      },
      exports: { lockerCode: "answer" },
      rewards: { evidence: [ev(ctx, { id: "ev-notebook", title: "The notebook", kind: "document", body: `The rotation was reverted. Spare kit at ${cast.field.name}.`, about: { characters: [cast.victim.id, cast.culprit.id], locations: [cast.field.id], timeline: [] } })], flags: {}, resources: {}, timeline: [], locations: [] },
      scoring: { points: 150 },
      estimatedMinutes: t.minutes - 2,
      hints: hints(r.tier, [["nudge", "A black box over text does not remove it."]]),
    });
    ctx.exports.add("lockerCode");
    key.push(id);
  });
  const n = Math.max(1, Math.min(all.length, budget));
  for (const f of all.slice(0, n)) f();
  return { key };
};

const ctf: Gen = (ctx, r, entry, budget) => {
  const { cast } = ctx;
  const t = TIER_TARGETS[r.tier];
  const key: string[] = [];
  const gens: (() => void)[] = [
    () => {
      const id = `${r.id}-repo`;
      ctx.nodes.push({
        id,
        round: r.id,
        title: "The repository remembers",
        primitive: "git-forensics",
        gate: entry,
        briefing: "A snapshot of the project repository. A key was 'rotated for the audit'. Find the key ID that was deleted.",
        config: {
          question: "What key ID was removed before the audit?",
          answer: "{{keyFragment}}",
          answerFormat: "xxxx-xxxx",
          repo: "project",
          people: [
            { name: cast.victim.name, email: `${slug(cast.victim.name)}@portal.example.edu` },
            { name: cast.culprit.name, email: `${slug(cast.culprit.name)}@portal.example.edu` },
          ],
          history: [
            { op: "commit", label: "init", author: 0, message: "Initial import", date: "2026-02-20T05:12:00Z", changes: { "README.md": "# project\n", "config/uplink.key": "KEY-ID {{keyFragment}}\n" } },
            { op: "tag", name: "v0.9-pre-audit", at: "init", message: "Before the audit", author: 0, date: "2026-02-21T06:00:00Z" },
            { op: "commit", label: "docs", author: 0, message: "Document field beacons", date: "2026-03-02T09:30:00Z", changes: { "docs/beacons.md": "Field units report as DNS lookups: `NN-<chunk>.status.field.example`. Sort by NN, concatenate, base32-decode.\n" } },
            { op: "commit", label: "clean", author: 1, message: "Remove debug credentials before audit", date: "2026-03-10T17:05:00Z", changes: { "config/uplink.key": null } },
            ...(t.depth >= 4 ? [{ op: "branch", name: "handover", at: "clean" }, { op: "commit", label: "handover", branch: "handover", author: 1, message: "wip: export key material for partner", date: "2026-03-11T20:40:00Z", changes: { "tools/notes.txt": "ref {{dealRef}}\n" } }, { op: "checkout", branch: "main" }] : []),
          ],
        },
        exports: { recoveredKey: "answer" },
        rewards: { evidence: [ev(ctx, { id: "ev-repo", title: "Repository history", kind: "repository", body: `${cast.culprit.name} deleted key {{keyFragment}} before the audit.`, about: { characters: [cast.culprit.id], locations: [], timeline: [] } })], flags: {}, resources: {}, timeline: [], locations: [] },
        scoring: { points: 250 },
        estimatedMinutes: t.minutes,
        hints: hints(r.tier, [["nudge", "git log --all"], ["technique", "git show <commit>:<path>"]]),
      });
      ctx.exports.add("recoveredKey");
      key.push(id);
    },
    () => {
      const id = `${r.id}-capture`;
      const repo = ctx.nodes.find((n) => n.primitive === "git-forensics" && n.round === r.id);
      ctx.nodes.push({
        id,
        round: r.id,
        title: "What the gateway heard",
        primitive: "network-capture",
        gate: repo ? { node: repo.id } : entry,
        briefing: `A capture from the gateway during the incident. ${cast.victim.name}'s field unit was supposed to report from somewhere.`,
        config: {
          question: "What fix code did the field unit report?",
          answer: "{{beaconFix}}",
          answerFormat: "6 hex characters",
          filename: "gateway.pcap",
          beacon: { host: "10.14.9.{{hostOctet}}", domain: "status.field.example", message: `UNIT OK POS ${slug(cast.field.name).toUpperCase().slice(0, 16)} FIX {{beaconFix}}` },
          decoys: Array.from({ length: Math.max(1, t.redHerrings) }, (_, i) => ({ host: `10.14.5.${20 + i}`, domain: `metrics.device-${i + 1}.example`, count: 8 })),
          resolverLog: t.depth >= 4 ? undefined : { filename: "resolver.log" },
        },
        exports: { beaconCode: "answer" },
        rewards: { evidence: [ev(ctx, { id: "ev-capture", title: "Gateway capture", kind: "capture", body: `The field unit reported from ${cast.field.name}. FIX {{beaconFix}}.`, about: { characters: [cast.victim.id], locations: [cast.field.id], timeline: [] } })], flags: {}, resources: {}, timeline: [], locations: [cast.field.id] },
        scoring: { points: 250 },
        estimatedMinutes: t.minutes + 5,
        hints: hints(r.tier, [["nudge", "Filter dns."], ["technique", "Order labels by their NN prefix, then base32-decode."]]),
      });
      ctx.roles.capture ??= "ev-capture";
      ctx.exports.add("beaconCode");
      key.push(id);
    },
    () => {
      const id = `${r.id}-records`;
      const decoy = cast.decoys[0]!;
      ctx.nodes.push({
        id,
        round: r.id,
        title: "The facilities database",
        primitive: "sql-investigation",
        gate: entry,
        briefing: `Facilities records: badges, door logs, Wi-Fi sessions, devices, vehicles. A badge opened ${cast.scene.name}. Whose phone was actually there?`,
        config: {
          question: `Whose phone was on the room's access point when the door opened? Give the employee id.`,
          answerFormat: "E####",
          staff: 40 + 20 * t.redHerrings,
          people: [
            { key: "culprit", name: cast.culprit.name.slice(0, 80), title: "Staff" },
            { key: "badge", name: decoy.name.slice(0, 80), title: "Technician", badge: "{{badgeId}}" },
            ...cast.decoys.slice(1, 3).map((d, i) => ({ key: `decoy${i}`, name: d.name.slice(0, 80), title: "Staff" })),
          ],
          incident: { room: "B-114", time: "{{incidentTime}}", badgeOf: "badge", present: "culprit", alibi: { person: "badge", leftAt: "01:10" }, ...(cast.decoys[1] ? { decoy: "decoy0" } : {}) },
        },
        rewards: { evidence: [ev(ctx, { id: "ev-correlation", title: "Records correlation", kind: "database", body: `${cast.culprit.name}'s phone was in the room when ${decoy.name}'s badge opened the door; ${decoy.name}'s car had left at 01:10.`, about: { characters: [cast.culprit.id, decoy.id], locations: [cast.scene.id], timeline: [] } })], flags: {}, resources: {}, timeline: [], locations: [] },
        scoring: { points: 250 },
        estimatedMinutes: t.minutes + 5,
        hints: hints(r.tier, [["nudge", "access_points maps rooms to APs."], ["technique", "Join access_logs → access_points → wifi_sessions → devices → employees."]]),
      });
      ctx.roles.place = "ev-correlation";
      ctx.roles.alibi = "ev-correlation";
      key.push(id);
    },
  ];
  for (const g of gens.slice(0, Math.max(1, Math.min(gens.length, budget)))) g();
  return { key };
};

const osint: Gen = (ctx, r, entry) => {
  const { cast } = ctx;
  const id = `${r.id}-trail`;
  const site = "forum";
  if (!ctx.sites.some((s) => s.id === site)) ctx.sites.push({ id: site, template: "forum", title: "OpenBench Forums", org: "Community forum (fictional)", tagline: "Build logs and gossip." });
  ctx.nodes.push({
    id,
    round: r.id,
    title: "The public trail",
    primitive: "osint-trail",
    gate: entry,
    briefing: `${cast.org} does not only send e-mail. Someone on a public forum answered them.`,
    config: {
      site,
      start: "t/offer",
      question: `Which alias replied to ${cast.org}'s post?`,
      answer: "{{forumAlias}}",
      pages: [
        { path: "t/offer", title: "Paid work: access wanted", kind: "post", author: "partnerships", nav: true, body: "Looking for discreet help with access to a university system.\n\n[Replies](t/offer-2)" },
        { path: "t/offer-2", title: "Re: Paid work", kind: "post", body: "**{{forumAlias}}:** Depends what you pay. See my [profile](u/member-17).\n\n**partnerships:** Check your inbox." },
        { path: "u/member-17", title: "{{forumAlias}}", kind: "profile", body: `Works at a university lab. Gave a talk at [Campus Day](events/campus-day).` },
        { path: "events/campus-day", title: "Campus Day programme", kind: "page", nav: true, body: `14:00 — talk by ${cast.culprit.name}` },
      ],
    },
    rewards: { evidence: [ev(ctx, { id: "ev-forum", title: "Forum thread", kind: "message", body: `An alias tied to ${cast.culprit.name} answered ${cast.org}.`, about: { characters: [cast.culprit.id], locations: [], timeline: [] } })], flags: {}, resources: { intel: 2 }, timeline: [], locations: [] },
    scoring: { points: 120 },
    estimatedMinutes: 12,
  });
  ctx.roles.motive ??= "ev-forum";
  return { key: [id] };
};

const inquest: Gen = (ctx, r, entry, budget) => {
  const { cast } = ctx;
  const t = TIER_TARGETS[r.tier];
  const key: string[] = [];
  // Guarantee a placing exhibit and a motive exhibit exist.
  if (!ctx.roles.place) {
    const id = `${r.id}-witness-log`;
    ctx.nodes.push({
      id,
      round: r.id,
      title: "The visitor log",
      primitive: "file-forensics",
      gate: entry,
      briefing: `The front desk's visitor log for ${cast.scene.name}.`,
      config: {
        question: `Who signed in to ${cast.scene.name} during the incident? (surname)`,
        answer: cast.culprit.name.split(" ").at(-1)!,
        files: [{ kind: "log", name: "visitors.csv", date: "2026-03-13", format: "csv", host: "front-desk", entries: [{ time: "{{incidentTime}}", text: `SIGN-IN ${cast.culprit.name}` }], noise: { count: 30, from: "18:00", to: "23:59", messages: [`SIGN-IN ${cast.decoys[0]!.name}`, "SIGN-OUT visitor %N%"] } }],
      },
      rewards: { evidence: [ev(ctx, { id: "ev-visitors", title: "Visitor log", kind: "log", body: `${cast.culprit.name} signed in during the incident.`, about: { characters: [cast.culprit.id], locations: [cast.scene.id], timeline: [] } })], flags: {}, resources: {}, timeline: [], locations: [] },
      scoring: { points: 100 },
      estimatedMinutes: 8,
    });
    ctx.roles.place = "ev-visitors";
    key.push(id);
  }
  const place = ctx.roles.place;
  const motive = ctx.roles.motive;
  const placeNode = ctx.nodes.find((n) => n.rewards?.evidence?.includes(place!));
  // Culprit interview.
  const culpritId = `${r.id}-interview-${slug(cast.culprit.name)}`.slice(0, 63);
  const contradictions = [`${cast.culprit.id}-alibi`, ...(motive ? [`${cast.culprit.id}-motive`] : [])];
  ctx.nodes.push({
    id: culpritId,
    round: r.id,
    title: `Interview — ${cast.culprit.name}`,
    primitive: "interview",
    gate: placeNode ? { node: placeNode.id } : entry,
    briefing: `${cast.culprit.name} is helpful and very sure of their story. Break it with evidence.`,
    config: {
      suspect: cast.culprit.id,
      name: cast.culprit.name.slice(0, 80),
      intro: '"Happy to help. Whatever you need."',
      topics: [
        { id: "where", question: "Where were you during the incident?", answer: "At home. Asleep.", kind: "lie" },
        { id: "deal", question: `What is ${cast.org} to you?`, answer: "Never heard of them.", kind: "lie", ...(motive ? { requires: { evidence: motive } } : {}) },
        { id: "victim", question: `When did you last see ${cast.victim.name}?`, answer: "Days ago. We weren't close.", kind: "evasive" },
      ],
      confrontations: [
        { evidence: place, response: "...Fine. I was there. Ten minutes.", contradiction: { id: `${cast.culprit.id}-alibi`, label: `${cast.culprit.name}'s alibi vs. the evidence`, breaks: "where" }, reveals: { evidence: [ev(ctx, { id: "ev-admission", title: `${cast.culprit.name}'s admission`, kind: "testimony", body: '"I was there. Ten minutes."', about: { characters: [cast.culprit.id], locations: [cast.scene.id], timeline: [] } })] } },
        ...(motive ? [{ evidence: motive, requires: { asked: "deal" }, response: "That offer was never accepted.", contradiction: { id: `${cast.culprit.id}-motive`, label: `${cast.culprit.name} knew ${cast.org}`, breaks: "deal" } }] : []),
      ],
      goal: { contradictions, flags: [] },
    },
    scoring: { points: 250 },
    estimatedMinutes: t.minutes - 4,
    hints: hints(r.tier, [["nudge", "Ask first; then present what contradicts the answer."]]),
  });
  key.push(culpritId);
  // Timeline.
  const tlId = `${r.id}-timeline`;
  const tz = ctx.tz;
  const events = [
    { id: "e-outage", label: "The outage begins", source: "Power log", shown: `{{incidentTime | addmin:${-16 - tz}}}:05 UTC`, trueTime: "{{incidentTime | addmin:-16}}", confidence: "high" },
    { id: "e-entry", label: `${cast.scene.name} is entered`, source: "Door controller", shown: "{{incidentTime | addmin:3}}:13 (runs 3 min fast)", trueTime: "{{incidentTime}}", confidence: "medium" },
    { id: "e-wipe", label: "The records are destroyed", source: "Workstation", shown: `{{incidentTime | addmin:${1 - tz}}}:41 UTC`, trueTime: "{{incidentTime | addmin:1}}", confidence: "high" },
    { id: "e-after", label: "The last message is sent", source: "Radio log", shown: "{{incidentTime | addmin:27}} local", trueTime: "{{incidentTime | addmin:27}}", confidence: "high" },
    { id: "e-claim", label: `${cast.culprit.name}: 'asleep at home'`, source: "Interview", shown: "all night (claimed)", trueTime: "00:30", confidence: "low", contradictory: true, requiresEvidence: "ev-admission" },
  ];
  ctx.nodes.push({
    id: tlId,
    round: r.id,
    title: "Reconstruct the night",
    primitive: "timeline",
    gate: entry,
    briefing: "Every source kept its own clock. Put the events in order in local time, and set aside the claim the evidence contradicts.",
    config: { referenceTz: "local time", events },
    rewards: { evidence: [], flags: { "timeline-fixed": true }, resources: {}, timeline: [], locations: [] },
    scoring: { points: 250 },
    estimatedMinutes: t.minutes - 2,
  });
  key.push(tlId);
  // Decoy interviews with falsifiable red herrings.
  cast.decoys.slice(0, Math.max(1, Math.min(3, budget - 3))).forEach((d, i) => {
    const alibi = ev(ctx, { id: `ev-alibi-${slug(d.name)}`.slice(0, 63), title: `${d.name}'s alibi`, kind: "record", body: `${d.name} was elsewhere at the time.`, about: { characters: [d.id], locations: [], timeline: [] } });
    const herring = `herring-${slug(d.name)}`.slice(0, 63);
    ctx.redHerrings.push({ id: herring, description: `${d.name} looks responsible at first.`, plausibility: 0.7 - i * 0.1, disprovedBy: [alibi] });
    ctx.relations.push({ from: `ev:${alibi}`, to: `sus:${d.id}`, kind: "alibi-for" });
    ctx.nodes.push({
      id: `${r.id}-interview-${slug(d.name)}`.slice(0, 63),
      round: r.id,
      title: `Interview — ${d.name}`,
      primitive: "interview",
      gate: entry,
      optional: i > 0,
      redHerring: herring,
      briefing: `${d.name} knows how this looks.`,
      config: {
        suspect: d.id,
        name: d.name.slice(0, 80),
        intro: '"Ask whatever you want."',
        topics: [
          { id: "where", question: "Where were you during the incident?", answer: "Somewhere else, with witnesses. It's on record.", kind: "truth", reveals: { evidence: [alibi], flags: { [`${d.id}-cleared`]: true } } },
          { id: "who", question: "Who do you think did it?", answer: `...Ask ${cast.culprit.name.split(" ")[0]} where they were.`, kind: "evasive", requires: { asked: "where" } },
        ],
        goal: { contradictions: [], flags: [`${d.id}-cleared`] },
      },
      scoring: { points: 100 },
      estimatedMinutes: 6,
    });
  });
  // Board.
  ctx.relations.push({ from: `ev:${place}`, to: `sus:${cast.culprit.id}`, kind: "implicates" });
  if (motive) ctx.relations.push({ from: `ev:${motive}`, to: `sus:${cast.culprit.id}`, kind: "motive-for" });
  if (ctx.roles.record) ctx.relations.push({ from: `ev:${ctx.roles.record}`, to: `loc:${cast.scene.id}`, kind: "places-at" });
  if (ctx.roles.photo) ctx.relations.push({ from: `ev:${ctx.roles.photo}`, to: `sus:${cast.culprit.id}`, kind: "implicates" });
  if (ctx.roles.log) ctx.relations.push({ from: `ev:${ctx.roles.log}`, to: `sus:${cast.culprit.id}`, kind: "implicates" });
  const boardId = `${r.id}-board`;
  ctx.nodes.push({
    id: boardId,
    round: r.id,
    title: "Wire the board",
    primitive: "board-deduction",
    gate: { node: culpritId },
    briefing: "Connect exhibits to people and places with labelled string, then submit your theory.",
    config: { required: Math.max(2, Math.min(ctx.relations.length, 2 + Math.ceil(t.depth / 2))), maxUnsupported: 3 },
    scoring: { points: 250 },
    estimatedMinutes: 12,
  });
  key.push(boardId);
  return { key };
};

const physical: Gen = (ctx, r, entry) => {
  const { cast } = ctx;
  const cpId = `cp-${slug(cast.field.name)}`.slice(0, 63);
  ctx.checkpoints.push({ id: cpId, name: cast.field.name.slice(0, 80), kind: "qr", location: cast.field.name.slice(0, 160), instructions: "Find the DOSSIER sign. Scan it while signed in. Stay on public paths.", points: 0, requiresApproval: false });
  const id = `${r.id}-checkpoint`;
  ctx.nodes.push({
    id,
    round: r.id,
    title: `Go to ${cast.field.name}`,
    primitive: "qr-checkpoint",
    gate: entry,
    briefing: `The evidence points to **${cast.field.name}**. Go there and scan the station's code.`,
    config: { checkpoint: cpId },
    rewards: { evidence: [ev(ctx, { id: "ev-field-kit", title: "The field kit", kind: "object", body: `A sealed card from ${cast.victim.name}: **"My final code is the pieces you recovered, joined with dashes, in the order you found them."**`, about: { characters: [cast.victim.id], locations: [cast.field.id], timeline: [] } })], flags: {}, resources: {}, timeline: [], locations: [cast.field.id] },
    scoring: { points: 150 },
    estimatedMinutes: 15,
  });
  if (cast.field.geo) {
    ctx.checkpoints.push({ id: `${cpId}-geo`.slice(0, 63), name: `${cast.field.name} (GPS)`.slice(0, 80), kind: "gps", location: cast.field.name.slice(0, 160), geo: { ...cast.field.geo, radiusM: 40 }, points: 0, requiresApproval: false });
    ctx.nodes.push({ id: `${r.id}-gps`, round: r.id, title: `Check in near ${cast.field.name}`, primitive: "gps-checkpoint", gate: { node: id }, optional: true, config: { checkpoint: `${cpId}-geo`.slice(0, 63) }, rewards: { evidence: [], flags: {}, resources: { intel: 1 }, timeline: [], locations: [] }, scoring: { points: 60 }, estimatedMinutes: 6 });
  }
  return { key: [id] };
};

const finalGen: Gen = (ctx, r, entry) => {
  const { cast } = ctx;
  const code = ["recoveredKey", "beaconCode", "lockerCode", "maintPass"].filter((k) => ctx.exports.has(k)).slice(0, 3);
  const codeAnswer = code.length ? code.map((k) => `{{${k}}}`).join("-") : "{{badgeId}}-{{dealRef}}";
  const keyEvidence = [ctx.roles.place, ctx.roles.photo, ctx.roles.log, "ev-admission"].filter((x): x is string => Boolean(x) && ctx.evidence.some((e) => e.id === x));
  ctx.nodes.push({
    id: `${r.id}-reconstruction`,
    round: r.id,
    title: "The reconstruction",
    primitive: "final-reconstruction",
    gate: entry,
    briefing: "File your reconstruction. You learn how many findings held, never which. Only a coherent reconstruction earns the full outcome.",
    config: {
      maxAttempts: 3,
      penalties: [0, 75, 150],
      coherenceBonus: 300,
      fields: [
        { id: "culprit", label: "Culprit", type: "suspect", options: [cast.culprit, ...cast.decoys].map((p) => ({ id: p.id, label: p.name.slice(0, 80) })), answer: [cast.culprit.id], points: 250 },
        {
          id: "motive",
          label: "Motive",
          type: "choice",
          options: [
            { id: "true", label: cast.motive.slice(0, 120) },
            { id: "credit", label: "Wanted the credit for the work" },
            { id: "grudge", label: "A personal grudge" },
            { id: "accident", label: "An accident covered up in panic" },
          ],
          answer: ["true"],
          points: 150,
        },
        {
          id: "method",
          label: "Method",
          type: "choice",
          options: [
            { id: "true", label: cast.method.slice(0, 120) },
            { id: "remote", label: "Did it remotely over the network" },
            { id: "own", label: "Used their own access openly" },
            { id: "outsider", label: "Paid an outsider to do it" },
          ],
          answer: ["true"],
          points: 150,
        },
        { id: "location", label: "Where", type: "location", options: [], answer: [cast.scene.id], points: 100 },
        { id: "time", label: "When (local)", type: "time", answer: ["{{incidentTime}}"], points: 150, toleranceMinutes: 2 },
        ...(keyEvidence.length ? [{ id: "evidence", label: "Key evidence", type: "evidence", answer: keyEvidence, points: 100 }] : []),
        { id: "code", label: "Final code", type: "code", answer: [codeAnswer], points: 200 },
      ],
    },
    scoring: { points: 0 },
    estimatedMinutes: 20,
  });
  return { key: [`${r.id}-reconstruction`] };
};

const GENERATORS: Record<FamilyId, Gen> = { cryptic, browser, forensics, ctf, osint, inquest, physical, final: finalGen, custom: cryptic };

/* ─────────────────────────── entry point ─────────────────────────── */

export function planEvent(ex: ExtractedStory, opts: PlanOptions): PlanResult {
  const notes: string[] = [];
  const { cast, story } = resolveCast(ex, notes);
  const suggestions = mapConcepts(ex);
  const rounds = opts.rounds.length ? [...opts.rounds] : (["cryptic", "browser", "forensics", "ctf", "inquest", "physical", "final"] as FamilyId[]);
  if (!rounds.includes("final")) {
    rounds.push("final");
    notes.push("Added a final reconstruction round: every event needs a closing accusation.");
  }
  // Final always last; inquest after anything that produces evidence.
  rounds.sort((a, b) => (a === "final" ? 1 : b === "final" ? -1 : 0));
  const target = Math.max(20, Math.min(40, Math.round(opts.durationMinutes / 13)));
  const weights = rounds.map((f) => FAMILY_WEIGHT[f]);
  const total = weights.reduce((a, b) => a + b, 0);
  const budgets = weights.map((w) => Math.max(1, Math.round((w / total) * target)));
  const ctx: Ctx = { cast, nodes: [], evidence: [], relations: [], redHerrings: [], sites: [], checkpoints: [], exports: new Set(), roles: {}, tz: opts.utcOffsetMinutes ?? 330, notes };
  const acts: NonNullable<BlueprintInput["acts"]> = [];
  const roundDefs: NonNullable<BlueprintInput["rounds"]> = [];
  let entry: Gate | undefined = undefined;
  const counts = new Map<FamilyId, number>();
  rounds.forEach((family, i) => {
    const tier = tierFor(opts.curve, i, rounds.length, opts.customTiers);
    const n = (counts.get(family) ?? 0) + 1;
    counts.set(family, n);
    const rid = `r${i + 1}-${family}${n > 1 ? `-${n}` : ""}`;
    const actTitle = ex.acts[i]?.title || FAMILY_TITLE[family];
    acts.push({ id: `act${i + 1}`, title: actTitle.slice(0, 100), summary: (ex.acts[i]?.summary ?? "").slice(0, 400) });
    roundDefs.push({ id: rid, act: `act${i + 1}`, title: FAMILY_TITLE[family], family, tier, intro: "" });
    const before = ctx.nodes.length;
    const aff = familyAffinity(suggestions, family);
    if (aff.size) notes.push(`${FAMILY_TITLE[family]}: story concepts favour ${[...aff.entries()].sort((a, b) => b[1] - a[1]).map(([p]) => p).slice(0, 3).join(", ")}.`);
    // The final needs the previous round, every physical checkpoint, and the inquest's board and timeline.
    let gate: Gate | undefined = entry;
    if (family === "final") {
      const parts: Gate[] = [
        ...(entry ? [entry] : []),
        ...ctx.checkpoints.filter((c) => c.kind === "qr").map((c) => ({ checkpoint: c.id })),
        ...ctx.nodes.filter((x) => (x.primitive === "board-deduction" || x.primitive === "timeline") && !x.optional).map((x) => ({ node: x.id })),
      ];
      gate = parts.length === 0 ? undefined : parts.length === 1 ? parts[0] : { all: parts };
    }
    const { key } = GENERATORS[family](ctx, { id: rid, tier }, gate, budgets[i]!);
    const produced = ctx.nodes.length - before;
    if (produced === 0) notes.push(`Round ${rid} produced no nodes.`);
    // Next round opens when this round's key files are solved (all-of for depth, any-of for gentle curves).
    const keys = key.filter((k) => !ctx.nodes.find((x) => x.id === k)?.optional);
    entry = keys.length === 0 ? entry : keys.length === 1 ? { node: keys[0]! } : TIER_TARGETS[tier].depth >= 3 ? { all: keys.map((k) => ({ node: k })) } : { any: keys.map((k) => ({ node: k })) };
  });

  // A family used twice exports its facts once (the first round's node wins).
  const seen = new Set<string>();
  for (const n of ctx.nodes) {
    if (!n.exports) continue;
    for (const k of Object.keys(n.exports)) {
      if (seen.has(k)) delete n.exports[k];
      seen.add(k);
    }
  }

  // Structural hardening for the top tiers (never "longer strings").
  for (const n of ctx.nodes) {
    const tier = roundDefs.find((r) => r.id === n.round)!.tier;
    const passes = tier === "nightmare" ? 2 : tier === "expert" ? 1 : 0;
    const p = getPrimitive(n.primitive);
    for (let i = 0; i < passes && p?.harden; i++) {
      const parsed = p.schema.safeParse(n.config);
      if (!parsed.success) break;
      const h = p.harden(parsed.data);
      if (!h) break;
      n.config = h.config as Record<string, unknown>;
      notes.push(`${n.id}: ${h.changes.join("; ")}`);
    }
  }

  const words = (xs: string[]) => ({ gen: "word" as const, from: xs, secret: true, description: "" });
  const blueprint: BlueprintInput = {
    schema: "dossier/v2",
    event: {
      id: opts.eventId,
      title: opts.title.slice(0, 100),
      university: opts.university ?? "",
      description: opts.description ?? "",
      tagline: story.premise.slice(0, 160),
      codename: story.codename,
      mode: opts.mode ?? "hybrid",
      durationMinutes: opts.durationMinutes,
      teamSize: opts.teamSize ?? { min: 1, max: 4 },
      startsAt: opts.startsAt,
      endsAt: opts.endsAt,
      timezone: opts.timezone ?? "UTC",
    },
    story,
    world: {
      facts: {
        codeword: words(CODEWORDS.slice(0, 20)),
        portalWord: words(["ATRIUM", "HANGAR", "TRELLIS", "GANTRY", "BULKHEAD", "CUPOLA", "PYLON", "KEYSTONE"]),
        txWord: words(["APOGEE", "PERIGEE", "ZENITH", "NADIR", "WARDEN", "HARBOR", "THISTLE", "JUNIPER"]),
        txDigits: { gen: "code", pattern: "####" },
        badgeId: { gen: "code", pattern: "KR-####" },
        keyFragment: { gen: "code", pattern: "xxxx-xxxx" },
        beaconFix: { gen: "hex", bytes: 3 },
        lockerNo: { gen: "int", min: 11, max: 58 },
        dealRef: { gen: "code", pattern: "CA-####-??" },
        incidentTime: { gen: "time", base: cast.incidentTime, jitterMinutes: 9 },
        hostOctet: { gen: "int", min: 20, max: 199, secret: false },
        forumAlias: { gen: "pick", options: ["stackrider", "quietcarrier", "lowearthlou", "nightbus", "downlinkdev"] },
      },
    },
    acts,
    rounds: roundDefs,
    nodes: ctx.nodes,
    evidence: [{ id: "ev-briefing", title: "Case briefing", kind: "document", body: story.briefing || story.premise, gate: { always: true }, about: { characters: [cast.victim.id], locations: [cast.scene.id], timeline: [] } }, ...ctx.evidence],
    sites: ctx.sites,
    checkpoints: ctx.checkpoints,
    relations: ctx.relations.filter((r, i, a) => a.findIndex((x) => x.from === r.from && x.to === r.to) === i),
    redHerrings: ctx.redHerrings,
    difficulty: { curve: opts.curve, custom: opts.customTiers },
  };
  return { blueprint, notes, suggestions, targetNodes: target };
}

/* ─────────────────────────── regeneration on an existing blueprint ─────────────────────────── */


/**
 * Regenerates the nodes of one round in an existing blueprint with the given
 * family generators (used by the copilot). Existing exports and evidence roles
 * are respected so cross-round chains stay intact; downstream gates that
 * pointed at removed nodes are re-pointed at the new round's key nodes.
 */
export function regenerateRound(bp: BlueprintT, roundId: string, families: FamilyId[], opts: { tier?: Tier; budget?: number } = {}): { blueprint: BlueprintT; added: string[]; removed: string[] } {
  const out = structuredClone(bp);
  const round = out.rounds.find((r) => r.id === roundId);
  if (!round) throw new Error(`unknown round "${roundId}"`);
  const old = out.nodes.filter((n) => n.round === roundId);
  const entry = old[0]?.gate;
  const notes: string[] = [];
  const ex = { story: out.story, acts: [], dates: [], times: [], relationships: [], potentialClues: [], potentialRedHerrings: [], concepts: [], warnings: [] } as ExtractedStory;
  const { cast } = resolveCast(ex, notes);
  const keep = out.nodes.filter((n) => n.round !== roundId);
  const ctx: Ctx = {
    cast,
    nodes: [],
    evidence: [...out.evidence] as EvidenceIn[],
    relations: out.relations,
    redHerrings: out.redHerrings,
    sites: out.sites,
    checkpoints: out.checkpoints,
    exports: new Set(keep.flatMap((n) => Object.keys(n.exports))),
    roles: {},
    tz: 330,
    notes,
  };
  for (const e of out.evidence) {
    if (e.kind === "database" || e.id === "ev-visitors") ctx.roles.place ??= e.id;
    if (e.kind === "message" && /offer|deal/i.test(e.title)) ctx.roles.motive ??= e.id;
    if (e.kind === "photo") ctx.roles.photo ??= e.id;
    if (e.kind === "log") ctx.roles.log ??= e.id;
  }
  const tier = opts.tier ?? round.tier;
  const key: string[] = [];
  families.forEach((f, i) => {
    const sub = { id: `${roundId}-v${Date.now().toString(36).slice(-3)}${i}`.slice(0, 40), tier };
    const r = GENERATORS[f](ctx, sub, entry, opts.budget ?? 3);
    key.push(...r.key);
  });
  const existing = new Set(keep.flatMap((n) => Object.keys(n.exports)));
  const titles = new Set(keep.map((n) => n.title.toLowerCase()));
  for (const n of ctx.nodes) {
    n.round = roundId;
    // Generators use stock titles; a second copy of a mechanic gets the round's name so files stay distinguishable.
    if (titles.has(n.title.toLowerCase())) n.title = `${n.title} (${round.title})`.slice(0, 120);
    titles.add(n.title.toLowerCase());
    // Facts already produced elsewhere keep their original producer.
    for (const k of Object.keys(n.exports ?? {})) if (existing.has(k)) delete n.exports![k];
  }
  // Make the world facts the generators rely on available.
  for (const [k, spec] of Object.entries(planEvent({ ...ex, acts: [] }, { eventId: out.event.id, title: out.event.title, durationMinutes: 60, rounds: ["final"], curve: "standard" }).blueprint.world!.facts!))
    if (!(k in out.world.facts)) (out.world.facts as Record<string, unknown>)[k] = spec;
  const removed = old.map((n) => n.id);
  const firstKey = key.find((k) => !ctx.nodes.find((x) => x.id === k)?.optional) ?? key[0];
  const repoint = (g: unknown): unknown => {
    if (!g || typeof g !== "object") return g;
    if ("node" in (g as object) && removed.includes((g as { node: string }).node)) return { ...(g as object), node: firstKey };
    if (Array.isArray(g)) return g.map(repoint);
    return Object.fromEntries(Object.entries(g as object).map(([k, v]) => [k, repoint(v)]));
  };
  out.nodes = [...keep.map((n) => ({ ...n, gate: repoint(n.gate) as typeof n.gate })), ...(ctx.nodes as BlueprintT["nodes"])];
  // Keep original round order for readability.
  out.nodes.sort((a, b) => out.rounds.findIndex((r) => r.id === a.round) - out.rounds.findIndex((r) => r.id === b.round));
  out.evidence = ctx.evidence as BlueprintT["evidence"];
  round.family = families[0] ?? round.family;
  return { blueprint: Blueprint.parse(out), added: ctx.nodes.map((n) => n.id), removed };
}
