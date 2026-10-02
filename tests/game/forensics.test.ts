import { inflateSync } from "node:zlib";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { readExif } from "../../src/server/game/artifacts/jpeg";
import { decodePngPixels, extractLsb, pngTextChunks } from "../../src/server/game/artifacts/png";
import { decodeMorse, decodeWav, reverse } from "../../src/server/game/artifacts/wav";
import { readZip } from "../../src/server/game/artifacts/zip";
import { shiftTime } from "../../src/server/game/core/template";
import { audioForensics, fileBundle, imageForensics, pdfForensics } from "../../src/server/game/primitives/forensics";
import type { ChallengePrimitive } from "../../src/server/game/primitives/types";
import { buildAll, instantiate, RT, sha, solveWithIntended, state, teamFacts } from "./harness";

/* ─── Configs used across the suite (all synthetic, all fact-templated) ─── */

const IMAGE_JPEG = {
  question: "When was the whiteboard photographed, in lab time (UTC+05:30)?",
  answer: "{{photoTime | addmin:330}}",
  answerFormat: "HH:MM",
  filename: "whiteboard.jpg",
  lines: ["STANDUP MOVED", "ASK ABOUT {{codeword}}"],
  exif: { make: "Google", model: "Pixel 7", artist: "field-cam", dateTimeOriginal: "2026:03:13 {{photoTime}}:07", offsetTimeOriginal: "+00:00", gps: { lat: 12.9716, lon: 77.5946 } },
};

const IMAGE_PNG = {
  question: "What word is hidden in the image data?",
  answer: "{{codeword}}",
  format: "png",
  filename: "badge-scan.png",
  scene: "note",
  lines: ["NOTHING TO SEE"],
  png: { text: [{ keyword: "Comment", text: "scanner v2.1" }], lsb: "relay={{codeword}}", trailer: "EOF-MARKER" },
};

const AUDIO = {
  question: "Which word does the burst carry?",
  answer: "{{codeword}}",
  filename: "burst.wav",
  left: [{ kind: "silence", seconds: 0.4 }, { kind: "morse", text: "{{codeword}}", wpm: 16 }],
  right: [{ kind: "spectrogram", text: "DOME 2" }, { kind: "dtmf", text: "0314" }],
  noise: 0.02,
  info: { INAM: "relay capture" },
};

const PDF = {
  question: "What key fragment is hidden in the notebook?",
  answer: "{{keyFragment}}",
  filename: "notebook.pdf",
  title: "LODESTAR lab notebook",
  author: "I. Varga",
  keywords: ["lodestar", "ground-station"],
  pages: [
    { heading: "Day 11", lines: ["Antenna alignment within tolerance.", "Next: rotate uplink key."], redacted: [{ text: "KEY FRAGMENT {{keyFragment}}", afterLine: 1 }] },
    { heading: "Day 12", lines: ["Nothing unusual."], invisible: ["see attachment"] },
  ],
  attachments: [{ name: "groundstation.cfg", content: "fingerprint={{keyFragment}}\n" }],
  customInfo: { LabRef: "KRL-017" },
};

const BUNDLE = {
  question: "When did the wipe begin (local time, HH:MM)?",
  answer: "{{wipeTime}}",
  files: [
    {
      kind: "log",
      name: "logs/syslog.txt",
      date: "2026-03-14",
      host: "ws-lab01",
      entries: [{ time: "{{wipeTime}}:41", text: "maintenance[4121]: secure-erase started on /dev/nvme0n1" }],
      noise: { count: 120, from: "01:00", to: "04:00", messages: ["CRON[%PID%]: (root) CMD (run-parts /etc/cron.hourly)", "kernel: usb 1-2: new device %N%"] },
    },
    { kind: "email", name: "mail/notice.eml", from: "Facilities <ops@example.edu>", to: "lab@example.edu", subject: "Power maintenance", date: "2026-03-13T12:00:00Z", received: ["from relay.example.edu by mx.example.edu"], headers: { "X-Ticket": "FAC-{{badgeId}}" }, body: "Planned outage tonight." },
  ],
  zip: { name: "evidence.zip", password: "{{zipPassword}}" },
};

/** Text of every `<hex> Tj` operator in every Flate stream of a PDF. */
function pdfText(pdf: Uint8Array): string {
  const raw = Buffer.from(pdf).toString("latin1");
  const out: string[] = [];
  for (const m of raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    let body: string;
    try {
      body = inflateSync(Buffer.from(m[1]!, "latin1")).toString("latin1");
    } catch {
      body = m[1]!;
    }
    for (const t of body.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)) out.push(Buffer.from(t[1]!, "hex").toString("latin1"));
    for (const t of body.matchAll(/\(([^)]*)\)\s*Tj/g)) out.push(t[1]!);
  }
  return out.join("\n");
}

describe("image forensics", () => {
  it("writes a real JPEG whose EXIF carries the per-team timestamp; answer requires the timezone shift", async () => {
    const { inst, ctx } = await instantiate(imageForensics, "team-a", IMAGE_JPEG);
    const [file] = await buildAll(imageForensics as ChallengePrimitive, inst, ctx);
    expect(file!.mime).toBe("image/jpeg");
    expect([file!.data[0], file!.data[1]]).toEqual([0xff, 0xd8]);
    expect([file!.data.at(-2), file!.data.at(-1)]).toEqual([0xff, 0xd9]);
    const exif = readExif(file!.data);
    const f = teamFacts("team-a");
    expect(exif.DateTimeOriginal).toBe(`2026:03:13 ${f.photoTime}:07`);
    expect(exif.OffsetTimeOriginal).toBe("+00:00");
    expect(exif.GPSLatitudeRef).toBe("N");
    expect(inst.outputs.answer).toBe(shiftTime(f.photoTime!, 330));
    // The answer is a derived value: it appears nowhere in the file.
    expect(Buffer.from(file!.data).toString("latin1")).not.toContain(inst.outputs.answer);
  });

  it("hides the clue in PNG LSB bits, keeps tEXt chunks and trailing bytes", async () => {
    const { inst, ctx } = await instantiate(imageForensics, "team-a", IMAGE_PNG);
    const [file] = await buildAll(imageForensics as ChallengePrimitive, inst, ctx);
    expect(pngTextChunks(file!.data).Comment).toBe("scanner v2.1");
    expect(extractLsb(decodePngPixels(file!.data).pixels)).toBe(`relay=${teamFacts("team-a").codeword}`);
    expect(Buffer.from(file!.data.subarray(-10)).toString()).toBe("EOF-MARKER");
    // Not recoverable with `strings`: the payload only exists as pixel LSBs.
    expect(Buffer.from(file!.data).toString("latin1")).not.toContain(`relay=${teamFacts("team-a").codeword}`);
  });

  it("make-it-harder moves the clue from EXIF into steganography", () => {
    const parsed = imageForensics.schema.parse(IMAGE_JPEG);
    const h = imageForensics.harden!(parsed)!;
    expect(h.config.format).toBe("png");
    expect(h.config.png.lsb).toBeTruthy();
    expect(h.changes.join(" ")).toMatch(/steganography/i);
    expect(imageForensics.harden!(h.config)).toBeNull();
  });
});

describe("audio forensics", () => {
  it("produces a stereo WAV: Morse on the left decodes to the team's codeword", async () => {
    const { inst, ctx } = await instantiate(audioForensics, "team-b", AUDIO);
    const [file] = await buildAll(audioForensics as ChallengePrimitive, inst, ctx);
    const wav = decodeWav(file!.data);
    expect(wav.rate).toBe(22050);
    expect(wav.channels).toHaveLength(2);
    expect(wav.info.INAM).toBe("relay capture");
    expect(decodeMorse(wav.channels[0]!, wav.rate)).toBe(teamFacts("team-b").codeword);
  });

  it("reversed Morse only decodes after reversing the audio", async () => {
    const harder = audioForensics.harden!(audioForensics.schema.parse(AUDIO))!;
    expect(harder.config.left.some((s) => s.kind === "reversed-morse")).toBe(true);
    const { inst, ctx } = await instantiate(audioForensics, "team-b", harder.config as unknown as Record<string, unknown>);
    const [file] = await buildAll(audioForensics as ChallengePrimitive, inst, ctx);
    const left = decodeWav(file!.data).channels[0]!;
    const word = teamFacts("team-b").codeword!;
    expect(decodeMorse(reverse(left), 22050)).toBe(word);
    expect(decodeMorse(left, 22050)).not.toBe(word);
  });
});

describe("pdf forensics", () => {
  it("builds a PDF with metadata, a covered-but-present line and an embedded attachment", async () => {
    const { inst, ctx } = await instantiate(pdfForensics, "team-c", PDF);
    const [file] = await buildAll(pdfForensics as ChallengePrimitive, inst, ctx);
    const doc = await PDFDocument.load(file!.data);
    expect(doc.getTitle()).toBe("LODESTAR lab notebook");
    expect(doc.getAuthor()).toBe("I. Varga");
    expect(doc.getPageCount()).toBe(2);
    const raw = Buffer.from(file!.data).toString("latin1");
    expect(raw).toContain("/EmbeddedFiles");
    expect(raw).toContain("groundstation.cfg");
    expect(raw).toContain("KRL-017");
    const frag = teamFacts("team-c").keyFragment!;
    expect(pdfText(file!.data)).toContain(`KEY FRAGMENT ${frag}`);
  });
});

describe("file bundle forensics", () => {
  it("packages logs and e-mail into a ZipCrypto archive that needs the upstream password", async () => {
    const { inst, ctx } = await instantiate(fileBundle, "team-d", BUNDLE);
    const [zip] = await buildAll(fileBundle as ChallengePrimitive, inst, ctx);
    const f = teamFacts("team-d");
    expect(readZip(zip!.data).every((e) => e.encrypted && e.data === null)).toBe(true);
    const files = readZip(zip!.data, f.zipPassword);
    const log = Buffer.from(files.find((e) => e.name === "logs/syslog.txt")!.data!).toString();
    const lines = log.trim().split("\n");
    expect(lines).toHaveLength(121);
    expect(lines.filter((l) => l.includes("secure-erase"))).toEqual([`Mar 14 ${f.wipeTime}:41 ws-lab01 maintenance[4121]: secure-erase started on /dev/nvme0n1`]);
    // chronological order
    const times = lines.map((l) => l.slice(7, 15));
    expect([...times].sort()).toEqual(times);
    const eml = Buffer.from(files.find((e) => e.name === "mail/notice.eml")!.data!).toString();
    expect(eml).toMatch(/^Received: from relay\.example\.edu/m);
    expect(eml).toContain(`X-Ticket: FAC-${f.badgeId}`);
    expect(inst.outputs.answer).toBe(f.wipeTime);
  });

  it("serves files individually when no archive is configured", async () => {
    const { zip: _zip, ...plain } = BUNDLE;
    void _zip;
    const { inst, ctx } = await instantiate(fileBundle, "team-d", plain);
    const files = await buildAll(fileBundle as ChallengePrimitive, inst, ctx);
    expect(files.map((f) => f.name)).toEqual(["syslog.txt", "notice.eml"]);
    expect(files[1]!.mime).toBe("message/rfc822");
  });
});

describe("shared primitive contract (all four forensic primitives)", () => {
  const cases: [string, ChallengePrimitive, Record<string, unknown>][] = [
    ["image-jpeg", imageForensics as ChallengePrimitive, IMAGE_JPEG],
    ["image-png", imageForensics as ChallengePrimitive, IMAGE_PNG],
    ["audio", audioForensics as ChallengePrimitive, AUDIO],
    ["pdf", pdfForensics as ChallengePrimitive, PDF],
    ["bundle", fileBundle as ChallengePrimitive, BUNDLE],
  ];

  for (const [name, p, config] of cases) {
    describe(name, () => {
      it("is deterministic per team (byte-identical artifacts)", async () => {
        const a = await instantiate(p, "team-x", config);
        const b = await instantiate(p, "team-x", config);
        const fa = await buildAll(p, a.inst, a.ctx);
        const fb = await buildAll(p, b.inst, b.ctx);
        expect(fa.map((f) => sha(f.data))).toEqual(fb.map((f) => sha(f.data)));
        expect(a.inst.outputs).toEqual(b.inst.outputs);
      });

      it("varies answers and artifacts across teams", async () => {
        const teams = ["t1", "t2", "t3", "t4"];
        const insts = await Promise.all(teams.map((t) => instantiate(p, t, config)));
        expect(new Set(insts.map((i) => i.inst.outputs.answer)).size).toBeGreaterThan(1);
        const files = await Promise.all(insts.map((i) => buildAll(p, i.inst, i.ctx)));
        expect(new Set(files.map((f) => sha(f[0]!.data))).size).toBe(teams.length);
      });

      it("solves with the intended answer and rejects a wrong one (counting the attempt)", async () => {
        const { inst } = await instantiate(p, "team-y", config);
        expect(await solveWithIntended(p, inst)).toBe(true);
        const wrong = await p.applyAction({ type: "answer", value: "definitely-not-it" }, inst, undefined, state(), RT);
        expect(wrong.correct).toBe(false);
        expect(wrong.solved).toBeFalsy();
        expect(wrong.events).toContainEqual({ type: "node.step", node: "", key: "attempts", value: 1 });
      });

      it("never ships the answer in its public view", async () => {
        const { inst } = await instantiate(p, "team-z", config);
        const view = JSON.stringify(p.view(inst, undefined, state()));
        for (const g of inst.guarded) expect(view).not.toContain(g);
        expect(view).not.toContain("secret");
      });

      it("reports a multidimensional difficulty profile and tooling", () => {
        const parsed = p.schema.parse(config);
        const d = p.difficulty(parsed);
        expect(d.toolRequirement).toBeGreaterThan(0);
        expect(d.instanceUniqueness).toBeGreaterThan(0);
        const desc = p.describe(parsed);
        expect(desc.tools.length).toBeGreaterThan(0);
        expect(desc.interaction.channels).toContain("file");
        expect(desc.interaction.textExposure).toBeLessThan(0.2);
      });
    });
  }

  it("rejects configs that fail schema validation", () => {
    expect(imageForensics.schema.safeParse({ question: "q", answer: "a", filename: "../etc/passwd" }).success).toBe(false);
    expect(fileBundle.schema.safeParse({ question: "q", answer: "a", files: [] }).success).toBe(false);
    expect(audioForensics.schema.safeParse({ question: "q", answer: "a", left: [{ kind: "shell", text: "x" }] }).success).toBe(false);
  });
});

describe("template safety", () => {
  it("fails loudly when a log time does not render to a clock value", async () => {
    const bad = { ...BUNDLE, files: [{ ...BUNDLE.files[0], entries: [{ time: "{{codeword}}", text: "x" }] }] };
    await expect(instantiate(fileBundle, "team-q", bad)).rejects.toThrow(/HH:MM/);
  });
});
