import { stringify } from "yaml";
import type { Executor } from "../db/client";
import { loadChallenges } from "../engine/context";
import { listCheckpoints } from "../engine/live";
import { challengeConfig, type EventRow } from "../engine/types";

/**
 * Exports the live database state of an event back into pack files.
 * Answers are exported as `accept_hashes` (salt + HMAC): the export can be
 * re-imported only on a server that shares the same ANSWER_SECRET.
 * Station PINs are never exported.
 */
export async function exportPack(db: Executor, event: EventRow): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  const cfg = { ...(event.config as Record<string, unknown>) };
  const reg = (cfg.registration ?? {}) as Record<string, unknown>;
  delete reg.codeHash;
  delete reg.requiresCode;
  cfg.registration = reg;
  const header = (name: string) => `# ${name} — exported from DOSSIER on ${new Date().toISOString()}\n`;
  files["event.yaml"] = header("event") + stringify({ ...cfg, id: event.id });
  if (event.story) files["story.yaml"] = header("story") + stringify(event.story);

  const chs = await loadChallenges(db, event.id, true);
  const byMode = new Map<string, unknown[]>();
  for (const c of chs) {
    const conf = challengeConfig(c);
    const def: Record<string, unknown> = {
      id: c.id,
      mode: c.mode,
      title: c.title,
      ...(c.category ? { category: c.category } : {}),
      body: c.bodyMd,
      ...(conf.scoring.type === "static" ? { points: conf.points } : {}),
      scoring: conf.scoring,
      ...(conf.first_blood_bonus ? { first_blood_bonus: conf.first_blood_bonus } : {}),
      answer: { type: c.answerType, normalize: c.normalize, accept_hashes: c.answerHashes },
      ...(conf.hints.length ? { hints: conf.hints } : {}),
      ...(conf.requires ? { requires: conf.requires } : {}),
      ...(conf.available_from ? { available_from: conf.available_from } : {}),
      ...(conf.assets.length ? { assets: conf.assets } : {}),
      ...(conf.position ? { position: conf.position } : {}),
      ...(conf.reveals.length ? { reveals: conf.reveals } : {}),
      ...(conf.tags.length ? { tags: conf.tags } : {}),
      ...(conf.difficulty ? { difficulty: conf.difficulty } : {}),
    };
    const list = byMode.get(c.mode) ?? [];
    list.push(def);
    byMode.set(c.mode, list);
  }
  for (const [mode, list] of byMode) files[`challenges/${mode}.yaml`] = header(`${mode} challenges`) + stringify({ challenges: list });

  const cps = await listCheckpoints(db, event.id);
  if (cps.length) {
    files["checkpoints.yaml"] =
      header("checkpoints") +
      "# Station PINs are not exported. Set new `pin` values before re-importing.\n" +
      stringify({
        checkpoints: cps.map((c) => ({
          id: c.id,
          name: c.name,
          location: c.location,
          instructions: c.instructionsMd,
          points: c.points,
          requires_approval: c.requiresApproval,
        })),
      });
  }
  return files;
}

/* ─────────── Minimal ZIP writer (stored, no compression) ─────────── */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function zipFiles(files: Record<string, string | Uint8Array>): Uint8Array {
  const enc = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const data = typeof content === "string" ? enc.encode(content) : content;
    const nameBytes = enc.encode(name);
    const crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // UTF-8 names
    local.setUint16(8, 0, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, nameBytes.length, true);
    locals.push(new Uint8Array(local.buffer), nameBytes, data);
    const central = new DataView(new ArrayBuffer(46));
    central.setUint32(0, 0x02014b50, true);
    central.setUint16(4, 20, true);
    central.setUint16(6, 20, true);
    central.setUint16(8, 0x0800, true);
    central.setUint32(16, crc, true);
    central.setUint32(20, data.length, true);
    central.setUint32(24, data.length, true);
    central.setUint16(28, nameBytes.length, true);
    central.setUint32(42, offset, true);
    centrals.push(new Uint8Array(central.buffer), nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const centralSize = centrals.reduce((s, b) => s + b.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, Object.keys(files).length, true);
  end.setUint16(10, Object.keys(files).length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  const parts = [...locals, ...centrals, new Uint8Array(end.buffer)];
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
