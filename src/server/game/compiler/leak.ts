import { atbash, b64, hex, reverse, rot13 } from "../core/ciphers";
import type { BlueprintT } from "../core/blueprint";
import { emptyState } from "../core/state";
import type { SiteRequest } from "../primitives/types";
import { buildSite } from "../sites/runtime";
import { renderText, type TeamWorld } from "../world";

/**
 * Answer-leakage scanner. "Static" payloads are everything a team's browser
 * receives without investigating: node briefings, public views, non-answer
 * hints, synthetic-site HTML, the client bundle and its source map. No
 * node's answer may appear there — plainly or in any cheap encoding — unless
 * the node explicitly declares that encoding as the puzzle (a cipher).
 */

export interface Leak {
  node: string;
  where: string;
  encoding: string;
  /** The leaked answer belongs to another node (warning) rather than to the node it was found in (error). */
  crossNode: boolean;
}

export interface Payload {
  node: string | null;
  where: string;
  text: string;
}

export function variants(answer: string): { encoding: string; value: string }[] {
  const out = [
    { encoding: "plain", value: answer },
    { encoding: "reverse", value: reverse(answer) },
    { encoding: "rot13", value: rot13(answer) },
    { encoding: "atbash", value: atbash(answer) },
    { encoding: "b64", value: b64(answer).replace(/=+$/, "") },
    { encoding: "hex", value: hex(answer) },
  ];
  return out.filter((v, i) => i === 0 || v.value.toLowerCase() !== answer.toLowerCase());
}

const botReq = (path: string, query = ""): SiteRequest => ({ method: "GET", path, query: new URLSearchParams(query), headers: new Headers(), cookies: {}, body: "" });

/** Everything a team's browser gets for free, for one team world (all nodes treated as unlocked). */
export function staticPayloads(bp: BlueprintT, world: TeamWorld): Payload[] {
  const out: Payload[] = [];
  const empty = emptyState(bp.event.id, world.teamId);
  for (const [id, ni] of world.nodes) {
    out.push({ node: id, where: "briefing", text: renderText(ni.node.briefing, world.facts) });
    out.push({ node: id, where: "public view", text: JSON.stringify(ni.primitive.view(ni.instance, undefined, empty) ?? null) });
    ni.node.hints.forEach((h, i) => {
      if (h.level !== "explicit" && h.level !== "partial-answer") out.push({ node: id, where: `hint ${i + 1} (${h.level})`, text: renderText(h.text, world.facts) });
    });
  }
  for (const def of bp.sites) {
    const contribs = [...world.nodes.values()].map((x) => ({ node: x.node.id, item: x.primitive.site?.(x.instance, x.ctx) })).filter((x): x is { node: string; item: NonNullable<typeof x.item> } => Boolean(x.item) && x.item!.site === def.id);
    if (!contribs.length) continue;
    const site = buildSite(def, contribs);
    const pages = new Set(["", "directory", "about", ...def.pages.map((p) => p.path), ...contribs.flatMap((c) => (c.item.pages ?? []).map((p) => p.path))]);
    for (const p of pages) out.push({ node: null, where: `site ${def.id}: /${p} (HTML)`, text: String(site.handle(botReq(p), "/x/scan/").res.body) });
    out.push({ node: null, where: `site ${def.id}: client bundle`, text: String(site.handle(botReq("assets/app.min.js"), "/x/scan/").res.body) });
    out.push({ node: null, where: `site ${def.id}: source map`, text: String(site.handle(botReq("assets/app.min.js.map"), "/x/scan/").res.body) });
  }
  return out;
}

export function scanLeaks(world: TeamWorld, payloads: Payload[]): Leak[] {
  const leaks: Leak[] = [];
  for (const [id, ni] of world.nodes) {
    const allowed = new Set<string>(ni.instance.intentional ?? []);
    // Answers that are, by design, visible somewhere in the evidence are ambiguity puzzles, not leaks.
    if (allowed.has("plain")) continue;
    for (const g of new Set(ni.instance.guarded)) {
      if (!g || g.replace(/\W/g, "").length < 4) continue;
      for (const v of variants(g)) {
        const needle = v.value.toLowerCase();
        for (const p of payloads) {
          if (p.node === id && allowed.has(v.encoding as never)) continue;
          if (!p.text.toLowerCase().includes(needle)) continue;
          // Plain short answers that are ordinary words in someone else's prose are only warnings.
          leaks.push({ node: id, where: `${p.node && p.node !== id ? `node ${p.node} ` : ""}${p.where}`, encoding: v.encoding, crossNode: p.node !== id && p.node !== null ? true : false });
        }
      }
    }
  }
  return leaks;
}
