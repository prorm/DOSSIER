import { z } from "zod";
import { profile } from "../core/difficulty";
import { render } from "../core/template";
import { Raster, type RGB } from "../artifacts/raster";
import { encodePng } from "../artifacts/png";
import { ascii0, buildExif, dms, encodeJpeg, type ExifTag } from "../artifacts/jpeg";
import { dtmfAudio, encodeWav, join, morseAudio, mix, noise, normalizePeak, reverse, silence, spectrogramText, type Samples } from "../artifacts/wav";
import { buildEmail, buildPdf } from "../artifacts/documents";
import { buildZip } from "../artifacts/zip";
import { utf8 } from "../artifacts/bytes";
import { Rng } from "../core/rng";
import type { ArtifactSpec, ChallengePrimitive } from "./types";
import { AnswerAction, AnswerBlock, answerOutputs, checkAnswerTransition, resolveAnswer, type AnswerActionT, type AnswerSecret } from "./common";


/* ═══════════════════════════ IMAGE ═══════════════════════════ */

const ImageConfig = z
  .object({
    ...AnswerBlock,
    filename: z.string().regex(/^[A-Za-z0-9._-]{1,60}$/).default("evidence.jpg"),
    format: z.enum(["jpeg", "png"]).default("jpeg"),
    scene: z.enum(["whiteboard", "cctv", "note"]).default("whiteboard"),
    width: z.number().int().min(160).max(1600).default(640),
    height: z.number().int().min(120).max(1200).default(400),
    lines: z.array(z.string().max(80)).max(12).default([]),
    exif: z
      .object({
        make: z.string().max(60).optional(),
        model: z.string().max(60).optional(),
        artist: z.string().max(80).optional(),
        software: z.string().max(80).optional(),
        description: z.string().max(200).optional(),
        dateTimeOriginal: z.string().max(120).optional(),
        offsetTimeOriginal: z.string().max(40).optional(),
        serial: z.string().max(120).optional(),
        userComment: z.string().max(300).optional(),
        ownerName: z.string().max(120).optional(),
        gps: z.object({ lat: z.union([z.number(), z.string()]), lon: z.union([z.number(), z.string()]) }).strict().optional(),
      })
      .strict()
      .default({}),
    png: z
      .object({
        text: z.array(z.object({ keyword: z.string().max(79), text: z.string().max(2000) }).strict()).default([]),
        ztext: z.array(z.object({ keyword: z.string().max(79), text: z.string().max(2000) }).strict()).default([]),
        lsb: z.string().max(400).optional(),
        trailer: z.string().max(400).optional(),
      })
      .strict()
      .default({ text: [], ztext: [] }),
  })
  .strict();
type ImageC = z.infer<typeof ImageConfig>;

function drawScene(c: ImageC, lines: string[], rng: Rng): Raster {
  const r = new Raster(c.width, c.height);
  if (c.scene === "cctv") {
    r.gradient([48, 56, 52], [18, 22, 20]);
    r.rect(Math.round(c.width * 0.3), Math.round(c.height * 0.25), Math.round(c.width * 0.4), Math.round(c.height * 0.6), [34, 40, 38]);
    r.line(0, c.height - 1, Math.round(c.width * 0.3), Math.round(c.height * 0.85), [70, 80, 74], 2);
    r.line(c.width - 1, c.height - 1, Math.round(c.width * 0.7), Math.round(c.height * 0.85), [70, 80, 74], 2);
    r.rect(Math.round(c.width * 0.45), Math.round(c.height * 0.45), 18, 60, [20, 22, 22]);
    lines.forEach((l, i) => r.text(10, 10 + i * 22, l, 2, [230, 235, 225]));
    r.scanlines(3, 10);
    r.noise(rng, 14);
    r.vignette(0.5);
  } else if (c.scene === "note") {
    r.gradient([120, 86, 58], [92, 64, 42]);
    const w = Math.round(c.width * 0.7);
    const h = Math.round(c.height * 0.7);
    r.rect(Math.round((c.width - w) / 2) + 6, Math.round((c.height - h) / 2) + 6, w, h, [60, 44, 30]);
    r.rect(Math.round((c.width - w) / 2), Math.round((c.height - h) / 2), w, h, [248, 230, 120]);
    lines.forEach((l, i) => r.text(Math.round((c.width - w) / 2) + 14, Math.round((c.height - h) / 2) + 16 + i * 26, l, 3, [40, 40, 120], rng));
    r.noise(rng, 5);
  } else {
    r.gradient([236, 238, 236], [214, 218, 216]);
    r.rect(0, 0, c.width, 8, [150, 150, 155]);
    r.rect(0, c.height - 12, c.width, 12, [150, 150, 155]);
    const colors: RGB[] = [[28, 60, 170], [180, 30, 40], [30, 110, 60]];
    lines.forEach((l, i) => r.text(24, 30 + i * 30, l, 3, colors[i % colors.length]!, rng));
    for (let k = 0; k < 6; k++) {
      const x = rng.int(20, c.width - 120);
      const y = rng.int(c.height - 90, c.height - 30);
      r.line(x, y, x + rng.int(40, 110), y + rng.int(-12, 12), [150, 160, 175], 2);
    }
    r.noise(rng, 7);
    r.vignette(0.25);
  }
  return r;
}

function exifFor(e: ImageC["exif"]): Uint8Array | undefined {
  const ifd0: ExifTag[] = [];
  const ex: ExifTag[] = [];
  const gps: ExifTag[] = [];
  if (e.description) ifd0.push(ascii0(0x010e, e.description));
  if (e.make) ifd0.push(ascii0(0x010f, e.make));
  if (e.model) ifd0.push(ascii0(0x0110, e.model));
  if (e.software) ifd0.push(ascii0(0x0131, e.software));
  if (e.dateTimeOriginal) ifd0.push(ascii0(0x0132, e.dateTimeOriginal));
  if (e.artist) ifd0.push(ascii0(0x013b, e.artist));
  if (e.dateTimeOriginal || e.serial || e.userComment || e.ownerName) ex.push({ tag: 0x9000, type: 7, value: new Uint8Array(Buffer.from("0232")) });
  if (e.dateTimeOriginal) ex.push(ascii0(0x9003, e.dateTimeOriginal), ascii0(0x9004, e.dateTimeOriginal));
  if (e.offsetTimeOriginal) ex.push(ascii0(0x9011, e.offsetTimeOriginal));
  if (e.userComment) ex.push({ tag: 0x9286, type: 7, value: new Uint8Array(Buffer.concat([Buffer.from("ASCII\0\0\0"), Buffer.from(e.userComment, "latin1")])) });
  if (e.ownerName) ex.push(ascii0(0xa430, e.ownerName));
  if (e.serial) ex.push(ascii0(0xa431, e.serial));
  if (e.gps) {
    const lat = Number(e.gps.lat);
    const lon = Number(e.gps.lon);
    gps.push({ tag: 0, type: 1, value: Uint8Array.of(2, 3, 0, 0) }, ascii0(1, lat >= 0 ? "N" : "S"), { tag: 2, type: 5, value: dms(lat) }, ascii0(3, lon >= 0 ? "E" : "W"), { tag: 4, type: 5, value: dms(lon) });
  }
  if (!ifd0.length && !ex.length && !gps.length) return undefined;
  return buildExif(ifd0, ex, gps);
}

interface ImgSec extends AnswerSecret {
  rendered: ImageC;
  seed: string;
}

export const imageForensics: ChallengePrimitive<ImageC, { question: string; answerFormat: string; format: string; filename: string }, ImgSec, AnswerActionT> = {
  id: "image-forensics",
  version: "1.0.0",
  family: "forensics",
  label: "Image forensics",
  summary: "A generated JPEG/PNG whose clues live in pixels, EXIF, PNG text chunks, trailing bytes or LSB steganography.",
  schema: ImageConfig,
  actionSchema: AnswerAction,
  example: () => ({
    question: "When was this photo taken, in lab local time (UTC+05:30)? Answer HH:MM.",
    answer: "{{photoTime | addmin:330}}",
    filename: "whiteboard.jpg",
    lines: ["SYNC -> 03:14", "ASK ILSE"],
    exif: { make: "Google", model: "Pixel 7", dateTimeOriginal: "2026:03:13 {{photoTime}}:07", offsetTimeOriginal: "+00:00" },
  }),
  createInstance(config, ctx) {
    const rendered = render(config, ctx.facts);
    const secret = { ...resolveAnswer(config, ctx.facts), rendered, seed: ctx.rng.seed };
    return { public: { question: rendered.question, answerFormat: rendered.answerFormat, format: config.format, filename: config.filename }, secret, ...answerOutputs(secret) };
  },
  view: (inst) => ({ kind: "artifact", question: inst.public.question, answerFormat: inst.public.answerFormat }),
  validateAction: () => ({ ok: true }),
  applyAction: (a, inst, node) => checkAnswerTransition(a.value, inst.secret, node),
  intendedSolution: (inst) => [{ type: "answer", value: inst.secret.accept[0]! }],
  isAttempt: () => true,
  artifacts(inst): ArtifactSpec[] {
    const c = inst.secret.rendered;
    return [
      {
        name: c.filename,
        mime: c.format === "png" ? "image/png" : "image/jpeg",
        description: "Recovered image",
        build: () => {
          const rng = new Rng(`${inst.secret.seed}/pixels`);
          const r = drawScene(c, c.lines, rng);
          if (c.format === "png")
            return encodePng(r, { text: c.png.text, ztext: c.png.ztext, lsb: c.png.lsb, trailer: c.png.trailer ? utf8(c.png.trailer) : undefined });
          return encodeJpeg(r, { exif: exifFor(c.exif), quality: 88 });
        },
      },
    ];
  },
  difficulty: (c) =>
    profile({
      knowledgeDifficulty: c.png.lsb ? 6 : 4,
      reasoningDifficulty: 4,
      toolRequirement: c.png.lsb ? 8 : 5,
      interactionDepth: 3,
      crossModalComplexity: c.lines.length ? 6 : 4,
      instanceUniqueness: 8,
    }),
  describe: (c) => ({
    skills: ["image metadata", ...(c.png.lsb ? ["steganography"] : []), ...(c.exif.offsetTimeOriginal ? ["timezone reasoning"] : [])],
    tools: [c.format === "png" ? "pngcheck / zsteg / exiftool" : "exiftool", ...(c.lines.length ? ["an image viewer"] : [])],
    interaction: { channels: ["file", "image"], textExposure: 0.05 },
  }),
  harden(c) {
    if (c.format === "png" && c.png.lsb) return null;
    const moved = c.lines.find((l) => l.includes("{{")) ?? c.answer;
    return {
      config: { ...c, format: "png", filename: c.filename.replace(/\.jpe?g$/i, ".png"), png: { ...c.png, lsb: moved } },
      changes: ["JPEG with EXIF → PNG with the key clue hidden in least-significant-bit steganography", "Players now need a stego tool (zsteg/stegsolve) instead of a metadata viewer"],
    };
  },
};

/* ═══════════════════════════ AUDIO ═══════════════════════════ */

const Segment = z
  .object({
    kind: z.enum(["morse", "reversed-morse", "dtmf", "spectrogram", "noise", "silence"]),
    text: z.string().max(80).default(""),
    seconds: z.number().min(0).max(30).default(1),
    wpm: z.number().int().min(5).max(30).default(14),
    freq: z.number().min(200).max(3000).default(650),
  })
  .strict();

const AudioConfig = z
  .object({
    ...AnswerBlock,
    filename: z.string().regex(/^[A-Za-z0-9._-]{1,60}$/).default("recording.wav"),
    rate: z.number().int().min(8000).max(48000).default(22050),
    left: z.array(Segment).min(1).max(12),
    right: z.array(Segment).max(12).default([]),
    noise: z.number().min(0).max(0.5).default(0.05),
    info: z.record(z.string().regex(/^[A-Z]{4}$/), z.string().max(200)).default({}),
  })
  .strict();
type AudioC = z.infer<typeof AudioConfig>;

function synth(segs: z.infer<typeof Segment>[], rate: number, rng: Rng): Samples {
  return join(
    segs.map((s) => {
      switch (s.kind) {
        case "morse":
          return morseAudio(rate, s.text, { wpm: s.wpm, freq: s.freq });
        case "reversed-morse":
          return reverse(morseAudio(rate, s.text, { wpm: s.wpm, freq: s.freq }));
        case "dtmf":
          return dtmfAudio(rate, s.text);
        case "spectrogram":
          return spectrogramText(rate, s.text);
        case "noise":
          return noise(rng, rate, s.seconds, 0.3);
        case "silence":
          return silence(rate, s.seconds);
      }
    }),
  );
}

interface AudioSec extends AnswerSecret {
  rendered: AudioC;
  seed: string;
}

export const audioForensics: ChallengePrimitive<AudioC, { question: string; answerFormat: string }, AudioSec, AnswerActionT> = {
  id: "audio-forensics",
  version: "1.0.0",
  family: "forensics",
  label: "Audio forensics",
  summary: "A generated WAV: Morse (forward or reversed), DTMF, text painted into the spectrogram, split across stereo channels.",
  schema: AudioConfig,
  actionSchema: AnswerAction,
  example: () => ({
    question: "What word does the transmission carry?",
    answer: "{{codeword}}",
    left: [{ kind: "silence", seconds: 1 }, { kind: "morse", text: "{{codeword}}" }],
    right: [{ kind: "spectrogram", text: "LOOK HERE" }],
  }),
  createInstance(config, ctx) {
    const rendered = render(config, ctx.facts);
    const secret = { ...resolveAnswer(config, ctx.facts), rendered, seed: ctx.rng.seed };
    return { public: { question: rendered.question, answerFormat: rendered.answerFormat }, secret, ...answerOutputs(secret) };
  },
  view: (inst) => ({ kind: "artifact", question: inst.public.question, answerFormat: inst.public.answerFormat }),
  validateAction: () => ({ ok: true }),
  applyAction: (a, inst, node) => checkAnswerTransition(a.value, inst.secret, node),
  intendedSolution: (inst) => [{ type: "answer", value: inst.secret.accept[0]! }],
  isAttempt: () => true,
  artifacts(inst) {
    const c = inst.secret.rendered;
    return [
      {
        name: c.filename,
        mime: "audio/wav",
        description: "Audio recording",
        build: () => {
          const rng = new Rng(`${inst.secret.seed}/audio`);
          const L = synth(c.left, c.rate, rng);
          const R = c.right.length ? synth(c.right, c.rate, rng) : null;
          const len = Math.max(L.length, R?.length ?? 0) + Math.round(c.rate * 0.5);
          const bed = (seed: string) => noise(new Rng(seed), c.rate, len / c.rate, c.noise);
          const chans = [normalizePeak(mix(bed(`${inst.secret.seed}/bedL`), L))];
          if (R) chans.push(normalizePeak(mix(bed(`${inst.secret.seed}/bedR`), R)));
          return encodeWav(c.rate, chans, { info: c.info });
        },
      },
    ];
  },
  difficulty: (c) => {
    const kinds = new Set([...c.left, ...c.right].map((s) => s.kind));
    return profile({
      knowledgeDifficulty: 5,
      reasoningDifficulty: 3 + kinds.size,
      toolRequirement: kinds.has("spectrogram") || kinds.has("reversed-morse") ? 8 : 6,
      interactionDepth: 3,
      crossModalComplexity: 3 + (c.right.length ? 3 : 0),
      instanceUniqueness: 8,
    });
  },
  describe: (c) => {
    const kinds = new Set([...c.left, ...c.right].map((s) => s.kind));
    return {
      skills: [...(kinds.has("morse") || kinds.has("reversed-morse") ? ["Morse code"] : []), ...(kinds.has("dtmf") ? ["DTMF"] : []), ...(kinds.has("spectrogram") ? ["spectrogram analysis"] : []), ...(c.right.length ? ["channel separation"] : [])],
      tools: ["Audacity / Sonic Visualiser"],
      interaction: { channels: ["file", "audio"], textExposure: 0.02 },
    };
  },
  harden(c) {
    const i = c.left.findIndex((s) => s.kind === "morse");
    if (i < 0) return null;
    const left = c.left.map((s, k) => (k === i ? { ...s, kind: "reversed-morse" as const } : s));
    return { config: { ...c, left }, changes: ["Morse segment is now time-reversed: players must reverse the audio before decoding"] };
  },
};

/* ═══════════════════════════ PDF ═══════════════════════════ */

const PdfConfig = z
  .object({
    ...AnswerBlock,
    filename: z.string().regex(/^[A-Za-z0-9._-]{1,60}$/).default("document.pdf"),
    title: z.string().max(120),
    author: z.string().max(80),
    subject: z.string().max(200).optional(),
    keywords: z.array(z.string().max(60)).max(12).default([]),
    created: z.string().max(40).default("2026-03-01T09:00:00Z"),
    modified: z.string().max(40).default("2026-03-13T22:10:00Z"),
    pages: z
      .array(
        z
          .object({
            heading: z.string().max(120).optional(),
            lines: z.array(z.string().max(160)).max(40).default([]),
            redacted: z.array(z.object({ text: z.string().max(160), afterLine: z.number().int().min(0) }).strict()).default([]),
            invisible: z.array(z.string().max(200)).default([]),
            footer: z.string().max(120).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(12),
    attachments: z.array(z.object({ name: z.string().regex(/^[A-Za-z0-9._-]{1,60}$/), content: z.string().max(8000), mime: z.string().max(60).default("text/plain") }).strict()).max(4).default([]),
    customInfo: z.record(z.string().regex(/^[A-Za-z][A-Za-z0-9]{0,30}$/), z.string().max(200)).default({}),
  })
  .strict();
type PdfC = z.infer<typeof PdfConfig>;

export const pdfForensics: ChallengePrimitive<PdfC, { question: string; answerFormat: string }, AnswerSecret & { rendered: PdfC }, AnswerActionT> = {
  id: "pdf-forensics",
  version: "1.0.0",
  family: "forensics",
  label: "PDF forensics",
  summary: "A generated PDF with metadata, redactions that only cover text, invisible text and embedded attachments.",
  schema: PdfConfig,
  actionSchema: AnswerAction,
  example: () => ({
    question: "What does the redacted line say?",
    answer: "{{codeword}}",
    title: "Lab notebook",
    author: "I. Varga",
    pages: [{ heading: "Day 12", lines: ["Calibration done."], redacted: [{ text: "Key: {{codeword}}", afterLine: 0 }] }],
  }),
  createInstance(config, ctx) {
    const rendered = render(config, ctx.facts);
    const secret = { ...resolveAnswer(config, ctx.facts), rendered };
    return { public: { question: rendered.question, answerFormat: rendered.answerFormat }, secret, ...answerOutputs(secret) };
  },
  view: (inst) => ({ kind: "artifact", question: inst.public.question, answerFormat: inst.public.answerFormat }),
  validateAction: () => ({ ok: true }),
  applyAction: (a, inst, node) => checkAnswerTransition(a.value, inst.secret, node),
  intendedSolution: (inst) => [{ type: "answer", value: inst.secret.accept[0]! }],
  isAttempt: () => true,
  artifacts(inst) {
    const c = inst.secret.rendered;
    return [
      {
        name: c.filename,
        mime: "application/pdf",
        description: "Document",
        build: () =>
          buildPdf({
            title: c.title,
            author: c.author,
            subject: c.subject,
            keywords: c.keywords,
            created: new Date(c.created),
            modified: new Date(c.modified),
            pages: c.pages,
            attachments: c.attachments.map((a) => ({ name: a.name, data: utf8(a.content), mime: a.mime })),
            customInfo: c.customInfo,
          }),
      },
    ];
  },
  difficulty: (c) =>
    profile({
      knowledgeDifficulty: 5,
      reasoningDifficulty: 4 + (c.attachments.length ? 1 : 0),
      toolRequirement: 6,
      interactionDepth: 3 + c.pages.length * 0.3,
      crossModalComplexity: 3,
      instanceUniqueness: 8,
    }),
  describe: (c) => ({
    skills: ["PDF structure", ...(c.pages.some((p) => p.redacted.length) ? ["recovering improperly redacted text"] : []), ...(c.attachments.length ? ["embedded files"] : [])],
    tools: ["pdftotext / pdfdetach / exiftool", "a PDF reader"],
    interaction: { channels: ["file", "binary"], textExposure: 0.03 },
  }),
};

/* ═══════════════════════════ FILE BUNDLE ═══════════════════════════ */

/** `time` may be a template (e.g. "{{wipeTime}}:41"); it must render to HH:MM[:SS]. */
const LogEntry = z.object({ time: z.string().max(80), text: z.string().max(400) }).strict();
const CLOCK = /^\d{1,2}:\d{2}(:\d{2})?$/;

const FileItem = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("text"), name: z.string().regex(/^[A-Za-z0-9._/-]{1,80}$/), content: z.string().max(40_000) }).strict(),
  z
    .object({
      kind: z.literal("log"),
      name: z.string().regex(/^[A-Za-z0-9._/-]{1,80}$/),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      format: z.enum(["syslog", "iso", "csv"]).default("syslog"),
      host: z.string().max(40).default("host"),
      tzLabel: z.string().max(10).default(""),
      header: z.string().max(300).optional(),
      entries: z.array(LogEntry).max(80),
      noise: z
        .object({ count: z.number().int().min(0).max(1500).default(80), from: z.string().default("00:00"), to: z.string().default("06:00"), messages: z.array(z.string().max(200)).min(1).max(40) })
        .strict()
        .optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("email"),
      name: z.string().regex(/^[A-Za-z0-9._/-]{1,80}$/),
      from: z.string().max(200),
      to: z.string().max(200),
      subject: z.string().max(200),
      date: z.string().max(40),
      tz: z.string().regex(/^[+-]\d{4}$/).default("+0530"),
      received: z.array(z.string().max(400)).max(8).default([]),
      headers: z.record(z.string().regex(/^[A-Za-z-]{1,40}$/), z.string().max(300)).default({}),
      body: z.string().max(8000),
      attachments: z.array(z.object({ name: z.string().max(60), content: z.string().max(8000), mime: z.string().default("text/plain") }).strict()).default([]),
    })
    .strict(),
]);

const BundleConfig = z
  .object({
    ...AnswerBlock,
    files: z.array(FileItem).min(1).max(12),
    /** Package every file into one zip (optionally encrypted with a password found elsewhere). */
    zip: z.object({ name: z.string().regex(/^[A-Za-z0-9._-]{1,60}$/), password: z.string().max(120).optional(), comment: z.string().max(200).optional() }).strict().optional(),
  })
  .strict();
type BundleC = z.infer<typeof BundleConfig>;

function fmtLogLine(f: Extract<z.infer<typeof FileItem>, { kind: "log" }>, time: string, text: string) {
  const t = /^\d{1,2}:\d{2}$/.test(time) ? `${time}:00` : time;
  if (f.format === "csv") return `${f.date}T${t}${f.tzLabel},${f.host},"${text.replace(/"/g, '""')}"`;
  if (f.format === "iso") return `${f.date}T${t}${f.tzLabel} ${f.host} ${text}`;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const [, m, d] = f.date.split("-");
  return `${months[Number(m) - 1]} ${String(Number(d)).padStart(2, " ")} ${t} ${f.host} ${text}`;
}

function toSeconds(t: string) {
  const [h, m, s] = t.split(":").map(Number);
  return (h ?? 0) * 3600 + (m ?? 0) * 60 + (s ?? 0);
}

export function buildLog(f: Extract<z.infer<typeof FileItem>, { kind: "log" }>, rng: Rng): string {
  const lines: { t: number; line: string }[] = f.entries.map((e) => ({ t: toSeconds(e.time), line: fmtLogLine(f, e.time, e.text) }));
  if (f.noise) {
    const a = toSeconds(f.noise.from);
    const b = toSeconds(f.noise.to);
    for (let i = 0; i < f.noise.count; i++) {
      const t = rng.int(a, b);
      const hh = String(Math.floor(t / 3600)).padStart(2, "0");
      const mm = String(Math.floor((t % 3600) / 60)).padStart(2, "0");
      const ss = String(t % 60).padStart(2, "0");
      const msg = rng.pick(f.noise.messages).replace(/%N%/g, String(rng.int(100, 9999))).replace(/%IP%/g, `10.14.${rng.int(0, 9)}.${rng.int(2, 250)}`).replace(/%PID%/g, String(rng.int(300, 32000)));
      lines.push({ t, line: fmtLogLine(f, `${hh}:${mm}:${ss}`, msg) });
    }
  }
  lines.sort((x, y) => x.t - y.t);
  const header = f.header ? `${f.header}\n` : f.format === "csv" ? "timestamp,host,message\n" : "";
  return header + lines.map((l) => l.line).join("\n") + "\n";
}

export function buildBundleFiles(c: BundleC, seed: string): { name: string; data: Uint8Array; mime: string }[] {
  return c.files.map((f, i) => {
    if (f.kind === "text") return { name: f.name, data: utf8(f.content), mime: f.name.endsWith(".csv") ? "text/csv" : f.name.endsWith(".json") ? "application/json" : "text/plain" };
    if (f.kind === "log") return { name: f.name, data: utf8(buildLog(f, new Rng(`${seed}/log${i}`))), mime: f.format === "csv" ? "text/csv" : "text/plain" };
    return {
      name: f.name,
      mime: "message/rfc822",
      data: buildEmail({
        from: f.from,
        to: f.to,
        subject: f.subject,
        date: new Date(f.date),
        tz: f.tz,
        messageId: `${new Rng(`${seed}/mid${i}`).hex(8)}@${f.from.replace(/.*@/, "").replace(/[>\s]/g, "") || "mail.local"}`,
        received: f.received,
        headers: f.headers,
        body: f.body,
        attachments: f.attachments.map((a) => ({ name: a.name, mime: a.mime, data: utf8(a.content) })),
      }),
    };
  });
}

export const fileBundle: ChallengePrimitive<BundleC, { question: string; answerFormat: string }, AnswerSecret & { rendered: BundleC; seed: string }, AnswerActionT> = {
  id: "file-forensics",
  version: "1.0.0",
  family: "forensics",
  label: "File & log forensics",
  summary: "Logs with realistic noise, CSV exports, e-mails with full headers, packaged individually or in a password-protected ZIP.",
  schema: BundleConfig,
  actionSchema: AnswerAction,
  example: () => ({
    question: "At what time did the workstation begin wiping its disk?",
    answer: "{{wipeTime}}",
    files: [{ kind: "log", name: "syslog.txt", date: "2026-03-14", entries: [{ time: "{{wipeTime}}:12", text: "ws-lab01 sudo: wipe started" }], noise: { count: 60, messages: ["cron[%PID%]: job ok"] } }],
  }),
  createInstance(config, ctx) {
    const rendered = render(config, ctx.facts);
    for (const f of rendered.files) {
      if (f.kind !== "log") continue;
      for (const e of f.entries) if (!CLOCK.test(e.time)) throw new Error(`log ${f.name}: entry time "${e.time}" is not HH:MM[:SS] after templating`);
      if (f.noise && (!CLOCK.test(f.noise.from) || !CLOCK.test(f.noise.to))) throw new Error(`log ${f.name}: noise window must be HH:MM`);
    }
    const secret = { ...resolveAnswer(config, ctx.facts), rendered, seed: ctx.rng.seed };
    return { public: { question: rendered.question, answerFormat: rendered.answerFormat }, secret, ...answerOutputs(secret) };
  },
  view: (inst) => ({ kind: "artifact", question: inst.public.question, answerFormat: inst.public.answerFormat }),
  validateAction: () => ({ ok: true }),
  applyAction: (a, inst, node) => checkAnswerTransition(a.value, inst.secret, node),
  intendedSolution: (inst) => [{ type: "answer", value: inst.secret.accept[0]! }],
  isAttempt: () => true,
  artifacts(inst) {
    const c = inst.secret.rendered;
    if (c.zip) {
      const z = c.zip;
      return [
        {
          name: z.name,
          mime: "application/zip",
          description: z.password ? "Encrypted archive" : "Archive",
          build: () => {
            return buildZip(
              buildBundleFiles(c, inst.secret.seed).map((f) => ({ name: f.name, data: f.data })),
              { password: z.password, rng: new Rng(`${inst.secret.seed}/zip`), comment: z.comment },
            );
          },
        },
      ];
    }
    return c.files.map((f, i) => ({
      name: f.name.split("/").pop()!,
      mime: f.kind === "email" ? "message/rfc822" : f.name.endsWith(".csv") ? "text/csv" : "text/plain",
      description: f.kind === "email" ? "E-mail message" : f.kind === "log" ? "Log file" : "File",
      build: () => buildBundleFiles(c, inst.secret.seed)[i]!.data,
    }));
  },
  difficulty: (c) =>
    profile({
      knowledgeDifficulty: 4,
      reasoningDifficulty: 4 + Math.min(4, c.files.length),
      toolRequirement: c.zip?.password ? 6 : 4,
      interactionDepth: 3 + c.files.length * 0.5,
      dependencyDepth: c.zip?.password?.includes("{{") ? 2 : 0,
      crossModalComplexity: new Set(c.files.map((f) => f.kind)).size * 2,
      redHerringDensity: c.files.some((f) => f.kind === "log" && (f.noise?.count ?? 0) > 100) ? 4 : 2,
      instanceUniqueness: 8,
    }),
  describe: (c) => ({
    skills: ["log analysis", ...(c.files.some((f) => f.kind === "email") ? ["e-mail header analysis"] : []), ...(c.zip?.password ? ["using recovered credentials"] : [])],
    tools: ["grep / a text editor", ...(c.zip ? ["unzip / 7-Zip"] : [])],
    interaction: { channels: ["file", "terminal"], textExposure: 0.03 },
  }),
  harden(c) {
    const log = c.files.findIndex((f) => f.kind === "log");
    if (log < 0) return null;
    const f = c.files[log] as Extract<z.infer<typeof FileItem>, { kind: "log" }>;
    const count = Math.min(1500, (f.noise?.count ?? 0) * 3 + 150);
    if (f.noise && f.noise.count >= 1500) return null;
    const files = c.files.map((x, i) => (i === log ? { ...f, noise: { from: "00:00", to: "06:00", messages: ["systemd[1]: Started session %N%.", "sshd[%PID%]: Accepted publickey for backup from %IP%", "CRON[%PID%]: (root) CMD (run-parts /etc/cron.hourly)"], ...(f.noise ?? {}), count } } : x));
    return { config: { ...c, files }, changes: [`Log noise ${f.noise?.count ?? 0} → ${count} lines: the signal must be filtered, not spotted`] };
  },
};

