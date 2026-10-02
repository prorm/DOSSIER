import { Story, type StoryModel } from "../core/blueprint";

/**
 * Story compiler, stage 1: Markdown → structured story model.
 *
 * Deterministic and dependency-free. It understands conventional sections
 * (Characters, Locations, Timeline, Truth, Acts, Artifacts, Organizations,
 * Motives) in any of the supplied files — or whole files named after them —
 * and falls back to prose heuristics for names, places, times and
 * relationships. The result is validated against the blueprint Story schema;
 * organisers review and edit it in Studio before generation.
 */

export interface StorySource {
  name: string;
  markdown: string;
}

export interface ExtractedStory {
  story: StoryModel;
  acts: { title: string; summary: string }[];
  dates: string[];
  times: string[];
  relationships: { from: string; to: string; kind: string }[];
  potentialClues: string[];
  potentialRedHerrings: string[];
  concepts: { concept: string; count: number; snippets: string[] }[];
  warnings: string[];
}

export const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/^(dr|prof|mr|mrs|ms)\.?\s+/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "x";

const SECTION_ALIASES: Record<string, string[]> = {
  characters: ["characters", "cast", "people", "persons", "suspects", "dramatis personae"],
  locations: ["locations", "places", "setting", "settings", "map"],
  timeline: ["timeline", "chronology", "events", "sequence of events", "the night"],
  truth: ["truth", "solution", "answer", "what really happened", "resolution"],
  acts: ["acts", "chapters", "structure", "outline"],
  artifacts: ["artifacts", "artefacts", "objects", "items", "props", "evidence"],
  organizations: ["organizations", "organisations", "groups", "companies"],
  motives: ["motives", "motive"],
  lore: ["lore", "background", "world", "backstory"],
};

function sectionKind(heading: string): string | null {
  const h = heading.toLowerCase().replace(/[^a-z ]/g, "").trim();
  for (const [k, names] of Object.entries(SECTION_ALIASES)) if (names.some((n) => h === n || h.startsWith(`${n} `) || h.endsWith(` ${n}`))) return k;
  return null;
}

interface Section {
  kind: string | null;
  heading: string;
  lines: string[];
  file: string;
}

function sections(src: StorySource): Section[] {
  const fileKind = sectionKind(src.name.replace(/\.md$/i, "").replace(/[-_]/g, " "));
  const out: Section[] = [{ kind: fileKind, heading: "", lines: [], file: src.name }];
  for (const line of src.markdown.replace(/\r/g, "").split("\n")) {
    const m = /^(#{1,3})\s+(.+?)\s*#*$/.exec(line);
    if (m && m[1]!.length >= 2) out.push({ kind: sectionKind(m[2]!) ?? (m[1]!.length === 3 ? out.at(-1)!.kind : null), heading: m[2]!, lines: [], file: src.name });
    else out.at(-1)!.lines.push(line);
  }
  return out;
}

/** "- **Name** (tag) — description" | "- Name: description" | "- Name - description" */
function listItems(lines: string[]): { name: string; tags: string[]; text: string; raw: string }[] {
  const items: { name: string; tags: string[]; text: string; raw: string }[] = [];
  for (const line of lines) {
    const m = /^\s*(?:[-*+]|\d+[.)])\s+(.*)$/.exec(line);
    if (!m) {
      // continuation lines belong to the previous item
      if (items.length && /^\s{2,}\S/.test(line)) items.at(-1)!.text += ` ${line.trim()}`;
      continue;
    }
    const raw = m[1]!.trim();
    let name = "";
    let rest = raw;
    const bold = /^\*\*(.+?)\*\*\s*(.*)$/.exec(raw);
    if (bold) {
      name = bold[1]!;
      rest = bold[2]!;
    } else {
      const sep = /^(.+?)\s*(?:—|–|:|\s-\s)\s*(.*)$/.exec(raw);
      if (sep) {
        name = sep[1]!;
        rest = sep[2]!;
      } else name = raw;
    }
    const tags: string[] = [];
    rest = rest.replace(/^\(([^)]+)\)\s*/, (_, t: string) => {
      tags.push(...t.split(/[,;]/).map((x) => x.trim().toLowerCase()));
      return "";
    });
    name = name.replace(/\s*\(([^)]+)\)\s*$/, (_, t: string) => {
      tags.push(...t.split(/[,;]/).map((x) => x.trim().toLowerCase()));
      return "";
    });
    rest = rest.replace(/^(?:—|–|-|:)\s*/, "");
    items.push({ name: name.replace(/\*\*/g, "").trim(), tags, text: rest.trim(), raw });
  }
  return items;
}

const CONCEPTS: Record<string, RegExp> = {
  satellite: /\b(satellite|cubesat|orbit|ground[- ]station|telemetry)\b/i,
  radio: /\b(radio|transmission|burst|frequency|signal|broadcast|morse)\b/i,
  server: /\b(server|workstation|computer|laptop|logs?|wiped?|hard drive|disk)\b/i,
  website: /\b(website|portal|intranet|web ?app|dashboard|login page)\b/i,
  access: /\b(badge|keycard|key card|door|access|swipe|lock)\b/i,
  photo: /\b(photo|photograph|camera|picture|cctv|image|whiteboard)\b/i,
  audio: /\b(recording|voicemail|audio|tape|call)\b/i,
  email: /\b(e-?mail|letter|message|note|memo)\b/i,
  document: /\b(notebook|diary|journal|report|document|pdf|dossier)\b/i,
  code: /\b(repository|repo|git|source code|commit|developer|script)\b/i,
  database: /\b(database|records|registry|ledger|spreadsheet)\b/i,
  network: /\b(network|wi-?fi|router|traffic|dns|packets?)\b/i,
  missing: /\b(missing|disappear(ed|s)?|vanish(ed)?|gone|kidnapp?ed|abducted)\b/i,
  online: /\b(forum|profile|social|online|post(ed)?|username|alias)\b/i,
  storm: /\b(storm|outage|blackout|power cut|power failure|flood)\b/i,
  money: /\b(debt|money|paid|payment|bribe|deal|offer|fraud)\b/i,
  campus: /\b(campus|building|hall|library|quad|observatory|lab)\b/i,
  cipher: /\b(cipher|code|encrypted|encoded|decode|key)\b/i,
  vehicle: /\b(car|vehicle|parking|gate|plate)\b/i,
};

const TIME_RE = /\b([01]?\d|2[0-3]):([0-5]\d)\b/g;
const DATE_RE = /\b(\d{4}-\d{2}-\d{2}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*(?:\s+\d{4})?|(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:,\s*\d{4})?)\b/g;
const PLACE_WORDS = /\b((?:[A-Z][\w'-]+\s){0,3}(?:Lab(?:oratory)?|Room|Hall|Building|Observatory|Library|Gate|Station|Shack|Office|Wing|Tower|Garage|Cafeteria|Canteen|Quad|Park|Dock|Warehouse|Club)(?:\s[A-Z]?-?\d+)?)\b/g;
const NAME_RE = /\b((?:Dr|Prof|Mr|Mrs|Ms)\.?\s)?([A-Z][a-z]+(?:\s[A-Z][a-z]+){1,2})\b/g;
const STOP_NAMES = new Set(["The Last", "Case File", "Server Room", "North Gate", "Old Observatory", "Radio Club"]);

/** Sentence split that keeps honorifics attached ("Prof. Anand Rao") and never merges list items or headings. */
export function sentences(text: string): string[] {
  return text
    .replace(/\*\*/g, "")
    .split(/\n+/)
    .map((l) => l.replace(/^\s*(?:#{1,6}|[-*+]|\d+[.)])\s+/, "").trim())
    .flatMap((l) =>
      l
        .replace(/\b(Dr|Prof|Mr|Mrs|Ms|St)\.\s/g, "$1\u00a0")
        .split(/(?<=[.!?])\s+(?=[A-Z"“])/)
        .map((s) => s.replace(/\u00a0/g, ". ").trim()),
    )
    .filter((s) => s.length > 12);
}

export function compileStory(input: StorySource[]): ExtractedStory {
  const warnings: string[] = [];
  // The main narrative file leads: its title, premise and briefing win.
  const rank = (n: string) => (/story|case|main|readme/i.test(n) ? 0 : /lore|background/i.test(n) ? 2 : 1);
  const sources = [...input].sort((a, b) => rank(a.name) - rank(b.name));
  const secs = sources.flatMap(sections);
  const all = sources.map((s) => s.markdown).join("\n\n");
  const prose = secs
    .filter((s) => !s.kind || s.kind === "lore")
    .flatMap((s) => s.lines)
    .filter((l) => !/^\s*[-*+]/.test(l))
    .join("\n");

  // Title / codename / premise.
  const h1 = [...all.matchAll(/^#\s+(.+)$/gm)].map((m) => m[1]!.trim()).find((t) => !sectionKind(t)) ?? "Untitled case";
  const title = h1.replace(/^CASE\s+\d+\s*[—–:-]\s*/i, "") || h1;
  const codename = /^\s*codename\s*:\s*(.+)$/im.exec(all)?.[1]?.trim() ?? "";
  const paras = prose
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p && !/^codename\s*:/i.test(p) && !p.startsWith("#"));
  const premise = (paras[0] ?? "").replace(/\*\*/g, "").slice(0, 600);
  const briefing = paras.slice(0, 4).join("\n\n").slice(0, 4000);

  // Characters.
  const characters: StoryModel["characters"] = [];
  const motives: StoryModel["motives"] = [];
  const addChar = (name: string, role: string, bio: string, suspect: boolean) => {
    const id = slug(name);
    if (characters.some((c) => c.id === id)) return;
    characters.push({ id, name: name.trim(), role: role.slice(0, 120), bio: bio.slice(0, 1500), suspect, traits: [], relationships: [] });
  };
  for (const s of secs.filter((x) => x.kind === "characters")) {
    for (const it of listItems(s.lines)) {
      if (!/[A-Z]/.test(it.name) || it.name.length > 60) continue;
      const suspect = it.tags.includes("suspect") || /\bsuspect\b/i.test(it.text) || s.heading.toLowerCase().includes("suspect");
      const role = it.text.split(/[.;]/)[0]!.replace(/\bsuspect\b/i, "").trim();
      const motive = /motive\s*:\s*([^.]+\.?)/i.exec(it.text)?.[1];
      addChar(it.name, role, it.text.replace(/motive\s*:\s*[^.]+\.?/i, "").trim(), suspect);
      if (motive) motives.push({ character: slug(it.name), text: motive.trim().slice(0, 400) });
    }
  }
  // Prose names mentioned at least twice.
  const counts = new Map<string, number>();
  for (const m of all.matchAll(NAME_RE)) {
    const full = `${m[1] ?? ""}${m[2]}`.trim();
    if (STOP_NAMES.has(m[2]!) || PLACE_WORDS.test(m[2]!)) continue;
    PLACE_WORDS.lastIndex = 0;
    counts.set(full, (counts.get(full) ?? 0) + 1);
  }
  for (const [name, n] of counts) {
    const id = slug(name);
    if (n >= 2 && !/^The\s/.test(name) && !characters.some((c) => c.id === id || c.name.endsWith(name.split(" ").at(-1)!)) && !/\b(Lab|Room|Institute|University|Aerospace|Club|Station|Transmission|Case)\b/.test(name)) addChar(name, "", "", false);
  }

  // Organizations.
  const organizations: StoryModel["organizations"] = [];
  for (const s of secs.filter((x) => x.kind === "organizations"))
    for (const it of listItems(s.lines)) if (!organizations.some((o) => o.id === slug(it.name))) organizations.push({ id: slug(it.name), name: it.name, description: it.text });
  for (const m of all.matchAll(/\b((?:[A-Z][\w-]+\s){0,3}(?:Aerospace|Inc|Corp|Corporation|Labs|Institute|University|Foundation|Agency|Ltd))\b/g)) {
    const name = m[1]!.trim();
    if (!organizations.some((o) => o.id === slug(name)) && organizations.length < 10) organizations.push({ id: slug(name), name, description: "" });
  }

  // Locations.
  const locations: StoryModel["locations"] = [];
  const addLoc = (name: string, description: string) => {
    const id = slug(name);
    if (locations.some((l) => l.id === id)) return;
    const geo = /lat(?:itude)?\s*(-?\d+(?:\.\d+)?)[,\s]+lon(?:gitude)?\s*(-?\d+(?:\.\d+)?)/i.exec(description);
    locations.push({ id, name: name.trim(), description: description.replace(/\((?:lat|latitude)[^)]*\)/i, "").trim().slice(0, 600), geo: geo ? { lat: Number(geo[1]), lon: Number(geo[2]) } : undefined });
  };
  for (const s of secs.filter((x) => x.kind === "locations")) for (const it of listItems(s.lines)) addLoc(it.name, it.text);
  for (const m of prose.matchAll(PLACE_WORDS)) if (locations.length < 12) addLoc(m[1]!.trim(), "");

  // Artifacts.
  const artifacts: StoryModel["artifacts"] = [];
  for (const s of secs.filter((x) => x.kind === "artifacts")) for (const it of listItems(s.lines)) artifacts.push({ id: slug(it.name), name: it.name, kind: "object", description: it.text });

  // Timeline.
  const timeline: StoryModel["timeline"] = [];
  const nameIndex = characters.map((c) => ({ id: c.id, keys: [c.name, c.name.split(" ").at(-1)!].filter((k) => k.length > 2) }));
  const locIndex = locations.map((l) => ({ id: l.id, keys: [l.name, ...l.name.split(/\s+/).filter((w) => /\d/.test(w))] }));
  for (const s of secs.filter((x) => x.kind === "timeline")) {
    listItems(s.lines).forEach((it, i) => {
      const t = /^(\d{4}-\d{2}-\d{2}\s+)?(\d{1,2}:\d{2})/.exec(it.raw);
      if (!t) return;
      const text = it.raw.replace(/^(\d{4}-\d{2}-\d{2}\s+)?\d{1,2}:\d{2}\s*(?:—|–|-|:)?\s*/, "").replace(/\*\*/g, "");
      timeline.push({
        id: `t${i + 1}`,
        at: t[2]!.padStart(5, "0"),
        title: text.slice(0, 140) || `Event at ${t[2]}`,
        body: "",
        actors: nameIndex.filter((n) => n.keys.some((k) => text.includes(k))).map((n) => n.id),
        location: locIndex.find((l) => l.keys.some((k) => text.includes(k)))?.id,
        public: i === 0,
      });
    });
  }

  // Truth.
  const truthLines = secs.filter((x) => x.kind === "truth").flatMap((s) => s.lines);
  const field = (k: string) => truthLines.map((l) => new RegExp(`^\\s*[-*]?\\s*\\**${k}\\**\\s*:\\s*(.+)$`, "i").exec(l)?.[1]?.trim()).find(Boolean) ?? "";
  const byName = (n: string) => characters.find((c) => n && (c.name.toLowerCase() === n.toLowerCase() || n.toLowerCase().includes(c.name.split(" ").at(-1)!.toLowerCase())))?.id;
  const byPlace = (n: string) => locations.find((l) => n && (l.name.toLowerCase() === n.toLowerCase() || n.toLowerCase().includes(l.name.toLowerCase())))?.id;
  const culprit = byName(field("culprit") || field("who"));
  if (!culprit) warnings.push("No culprit found: add a '## Truth' section with 'Culprit: <name>'.");
  if (culprit) {
    const c = characters.find((x) => x.id === culprit)!;
    c.suspect = true;
  }
  const truthTime = /(\d{1,2}:\d{2})/.exec(field("time") || field("when"))?.[1] ?? "";
  const truth = {
    culprit,
    motive: field("motive").slice(0, 400),
    method: field("method").slice(0, 400),
    location: byPlace(field("location") || field("where")),
    time: truthTime ? truthTime.padStart(5, "0") : "",
    keyEvidence: [] as string[],
    explanation: truthLines.filter((l) => !/^\s*[-*]\s*\**\w+\**\s*:/.test(l)).join("\n").trim().slice(0, 4000),
  };
  if (culprit && truth.motive && !motives.some((m) => m.character === culprit)) motives.push({ character: culprit, text: truth.motive });

  // Relationships: sentences naming two characters.
  const relationships: ExtractedStory["relationships"] = [];
  for (const sen of sentences(all)) {
    const pos = (n: (typeof nameIndex)[number]) => Math.min(...n.keys.map((k) => sen.indexOf(k)).filter((i) => i >= 0));
    const hits = nameIndex.filter((n) => n.keys.some((k) => sen.includes(k))).sort((x, y) => pos(x) - pos(y));
    if (hits.length === 2) {
      const [a, b] = hits;
      const ka = a!.keys.find((k) => sen.includes(k))!;
      const kb = b!.keys.find((k) => sen.includes(k))!;
      const between = sen.slice(sen.indexOf(ka) + ka.length, sen.indexOf(kb)).replace(/[^a-zA-Z' ]/g, " ").replace(/\s+/g, " ").trim();
      if (between && between.split(" ").length <= 5 && sen.indexOf(ka) < sen.indexOf(kb)) relationships.push({ from: a!.id, to: b!.id, kind: between.slice(0, 60) });
    }
  }
  for (const r of relationships) {
    const c = characters.find((x) => x.id === r.from);
    if (c && !c.relationships.some((x) => x.to === r.to)) c.relationships.push({ to: r.to, kind: r.kind });
  }

  // Acts.
  const acts = secs
    .filter((x) => x.kind === "acts")
    .flatMap((s) => listItems(s.lines))
    .map((it) => ({ title: it.name.replace(/^the\s/i, "The ").slice(0, 100), summary: it.text.slice(0, 400) }));

  // Concepts, clues, red herrings.
  const sens = sentences(all);
  const concepts = Object.entries(CONCEPTS)
    .map(([concept, re]) => {
      const hits = sens.filter((s) => re.test(s));
      return { concept, count: hits.length, snippets: hits.slice(0, 3).map((s) => s.slice(0, 200)) };
    })
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count);
  const potentialClues = sens.filter((s) => TIME_RE.test(s) || Object.values(CONCEPTS).some((re) => re.test(s))).slice(0, 20);
  TIME_RE.lastIndex = 0;
  const potentialRedHerrings = sens.filter((s) => /\b(rumou?r|argued|fought|seemed|appeared|allegedly|blame|alibi|suspicious|grudge|dispute)\b/i.test(s)).slice(0, 10);
  for (const s of sens) if (/\b(motive|debt|revenge|jealous|money|grant|credit|owed)\b/i.test(s)) {
    const who = nameIndex.find((n) => characters.find((c) => c.id === n.id)?.suspect && n.keys.some((k) => s.includes(k)));
    if (who && !motives.some((m) => m.character === who.id)) motives.push({ character: who.id, text: s.slice(0, 400) });
  }

  if (characters.filter((c) => c.suspect).length < 2) warnings.push("Fewer than two suspects: mark characters with '(suspect)' so the inquest has someone to rule out.");
  if (!locations.length) warnings.push("No locations found: add a '## Locations' list.");
  if (!timeline.length) warnings.push("No timeline found: add a '## Timeline' list of 'HH:MM — event' items.");

  const story = Story.parse({
    title: title.slice(0, 120),
    codename: codename.slice(0, 40),
    premise,
    briefing,
    characters: characters.slice(0, 60),
    organizations: organizations.slice(0, 30),
    locations: locations.slice(0, 60),
    artifacts: artifacts.slice(0, 80),
    timeline: timeline.slice(0, 120),
    motives: motives.slice(0, 40),
    truth,
  });
  return {
    story,
    acts,
    dates: [...new Set([...all.matchAll(DATE_RE)].map((m) => m[1]!))].slice(0, 20),
    times: [...new Set([...all.matchAll(TIME_RE)].map((m) => `${m[1]!.padStart(2, "0")}:${m[2]}`))].slice(0, 30),
    relationships,
    potentialClues,
    potentialRedHerrings,
    concepts,
    warnings,
  };
}
