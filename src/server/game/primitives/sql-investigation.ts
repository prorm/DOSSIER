import { z } from "zod";
import { profile } from "../core/difficulty";
import { render } from "../core/template";
import { COLORS, DEPARTMENTS, FIRST_NAMES, LAST_NAMES, VEHICLE_MAKES } from "../core/pools";
import { Rng } from "../core/rng";
import { utf8 } from "../artifacts/bytes";
import type { ChallengePrimitive, Transition } from "./types";
import { answerMatches, attempts } from "./types";

/**
 * SQL investigation over a per-team, procedurally generated campus database
 * (employees, badges, access logs, access points, devices, Wi-Fi sessions,
 * vehicles, parking events). The incident is planted consistently across
 * tables; answering requires joins and time-window reasoning, and every ID
 * differs per team. Queried live in a sandboxed PGlite, or downloaded as SQL.
 */

const Person = z
  .object({
    key: z.string().regex(/^[a-z][a-z0-9]{0,20}$/),
    name: z.string().max(80),
    department: z.string().max(40).default("Robotics"),
    title: z.string().max(60).default("Staff"),
    /** Optional fixed badge id (templated), so other nodes can reference the same badge. */
    badge: z.string().max(80).optional(),
  })
  .strict();

const Config = z
  .object({
    question: z.string().max(600),
    answerFormat: z.string().max(80).default(""),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).default("2026-03-13"),
    nextDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).default("2026-03-14"),
    staff: z.number().int().min(10).max(400).default(60),
    building: z.string().regex(/^[A-Z]$/).default("B"),
    people: z.array(Person).min(2).max(8),
    incident: z
      .object({
        room: z.string().regex(/^[A-Z]-\d{3}$/).default("B-114"),
        /** HH:MM (templated) on `nextDate`. */
        time: z.string().max(80),
        /** Whose badge opened the door. */
        badgeOf: z.string(),
        /** Who was actually in the room (via their phone on the room's access point). */
        present: z.string(),
        /** Person whose car left campus before the incident (alibi for badgeOf). */
        alibi: z.object({ person: z.string(), leftAt: z.string().max(80).default("01:10") }).strict().optional(),
        /** Decoy: someone on the same access point earlier who left before the incident. */
        decoy: z.string().optional(),
      })
      .strict(),
    /** Which planted value answers the question. */
    answerField: z.enum(["present.id", "present.name", "badgeOf.badge", "present.mac", "present.plate"]).default("present.id"),
  })
  .strict()
  .superRefine((c, ctx) => {
    const keys = new Set(c.people.map((p) => p.key));
    for (const [k, v] of [["badgeOf", c.incident.badgeOf], ["present", c.incident.present], ["alibi", c.incident.alibi?.person], ["decoy", c.incident.decoy]] as const)
      if (v && !keys.has(v)) ctx.addIssue({ code: "custom", path: ["incident", k], message: `unknown person key "${v}"` });
  });
type C = z.infer<typeof Config>;

const Action = z.union([
  z.object({ type: z.literal("query"), sql: z.string().min(1).max(4000) }).strict(),
  z.object({ type: z.literal("answer"), value: z.string().min(1).max(200) }).strict(),
]);
type A = z.infer<typeof Action>;

interface Row {
  [k: string]: string | number | null | undefined;
}
interface Dataset {
  tables: Record<string, { columns: [string, string][]; rows: Row[] }>;
  planted: Record<string, { id: string; name: string; badge: string; mac: string; plate: string }>;
}

const hhmmss = (sec: number) => {
  const s = ((sec % 86400) + 86400) % 86400;
  return `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};
const secs = (hhmm: string) => {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(hhmm.trim());
  if (!m) throw new Error(`sql-investigation: "${hhmm}" is not HH:MM after templating`);
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3] ?? 0);
};
const mac = (rng: Rng) => ["02", ...Array.from({ length: 5 }, () => rng.hex(1))].join(":");

export function generateCampus(c: C, rng: Rng): Dataset {
  const usedIds = new Set<string>();
  const uid = (p: string) => {
    let v: string;
    do v = rng.code(p);
    while (usedIds.has(v));
    usedIds.add(v);
    return v;
  };
  const employees: Row[] = [];
  const badges: Row[] = [];
  const devices: Row[] = [];
  const vehicles: Row[] = [];
  const planted: Dataset["planted"] = {};
  const add = (name: string, dept: string, title: string, badgeFixed?: string) => {
    const id = uid("E####");
    const badge = badgeFixed ?? uid("KR-####");
    usedIds.add(badge);
    employees.push({ employee_id: id, full_name: name, department: dept, title, badge_id: badge });
    badges.push({ badge_id: badge, employee_id: id, status: "active", issued_on: `20${rng.int(19, 25)}-0${rng.int(1, 9)}-1${rng.int(0, 9)}` });
    const m = mac(rng);
    devices.push({ mac: m, employee_id: id, kind: "phone", label: `${name.split(" ")[0]}'s phone` });
    if (rng.chance(0.5)) devices.push({ mac: mac(rng), employee_id: id, kind: "laptop", label: `${dept.toLowerCase()}-lt-${rng.int(10, 99)}` });
    const plate = `KA-${rng.int(1, 60).toString().padStart(2, "0")}-${rng.code("??")}-${rng.int(1000, 9999)}`;
    if (rng.chance(0.55) || badgeFixed !== undefined) vehicles.push({ plate, employee_id: id, make: rng.pick(VEHICLE_MAKES), color: rng.pick(COLORS) });
    return { id, name, badge, mac: m, plate };
  };
  for (const p of c.people) planted[p.key] = add(p.name, p.department, p.title, p.badge ?? rng.code("KR-####"));
  // Every planted person owns a vehicle (the alibi and entry evidence depend on it).
  for (const p of Object.values(planted)) if (!vehicles.some((v) => v.employee_id === p.id)) vehicles.push({ plate: p.plate, employee_id: p.id, make: rng.pick(VEHICLE_MAKES), color: rng.pick(COLORS) });
  const plantedNames = new Set(c.people.map((p) => p.name));
  for (let i = 0; employees.length < c.staff + c.people.length && i < 2000; i++) {
    const name = `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`;
    if (plantedNames.has(name) || employees.some((e) => e.full_name === name)) continue;
    add(name, rng.pick(DEPARTMENTS), rng.pick(["Research Associate", "Technician", "PhD Scholar", "Lecturer", "Administrator", "Security Officer"]));
  }

  const B = c.building;
  const rooms = Array.from({ length: 18 }, (_, i) => `${B}-${String(101 + i)}`);
  if (!rooms.includes(c.incident.room)) rooms.push(c.incident.room);
  const access_points: Row[] = rooms.map((room) => ({ ap_name: `${B}1-AP-${room.slice(2)}`, building: B, floor: 1, room }));
  const apFor = (room: string) => `${B}1-AP-${room.slice(2)}`;

  const T = secs(c.incident.time);
  const date2 = c.nextDate;
  const ts = (sec: number) => (sec >= 86400 ? `${date2} ${hhmmss(sec - 86400)}` : sec < 0 ? `${c.date} ${hhmmss(sec + 86400)}` : `${date2} ${hhmmss(sec)}`);
  const noiseEmp = employees.filter((e) => !Object.values(planted).some((p) => p.id === e.employee_id));

  // Access logs: background swipes 00:00–06:00 on the incident night, plus the planted events.
  const access_logs: Row[] = [];
  for (let i = 0; i < c.staff * 3; i++) {
    const e = rng.pick(noiseEmp);
    const room = rng.pick(rooms.filter((r) => r !== c.incident.room));
    access_logs.push({ badge_id: e.badge_id, door: room, ts: ts(rng.int(0, 6 * 3600)), result: rng.chance(0.93) ? "GRANTED" : "DENIED" });
  }
  const badgeOf = planted[c.incident.badgeOf]!;
  const present = planted[c.incident.present]!;
  access_logs.push({ badge_id: badgeOf.badge, door: c.incident.room, ts: ts(T + 13), result: "GRANTED" });
  access_logs.push({ badge_id: badgeOf.badge, door: c.incident.room, ts: ts(T + 1260), result: "GRANTED" });
  access_logs.push({ badge_id: present.badge, door: `${B}-101`, ts: ts(T - 1800), result: "GRANTED" });
  access_logs.sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
  access_logs.forEach((r, i) => (r.log_id = 1000 + i));

  // Wi-Fi sessions (the correlation that breaks the badge alibi).
  const wifi_sessions: Row[] = [];
  const devs = devices.filter((d) => d.kind === "phone");
  const incidentAp = apFor(c.incident.room);
  const noiseDevs = devs.filter((x) => !Object.values(planted).some((p) => p.id === x.employee_id));
  for (let i = 0; i < c.staff * 2; i++) {
    const d = rng.pick(noiseDevs);
    const start = rng.int(0, 5 * 3600);
    const end = start + rng.int(120, 5400);
    let ap = apFor(rng.pick(rooms));
    // The incident room's access point stays unambiguous: background sessions there
    // never overlap the hour around the incident.
    if (ap === incidentAp && end > T - 3600 && start < T + 3600) ap = apFor(rng.pick(rooms.filter((r) => r !== c.incident.room)));
    wifi_sessions.push({ mac: d.mac, ap_name: ap, connected_at: ts(start), disconnected_at: ts(end) });
  }
  wifi_sessions.push({ mac: present.mac, ap_name: apFor(c.incident.room), connected_at: ts(T - 11 * 60 + 4), disconnected_at: ts(T + 19 * 60 + 40) });
  if (c.incident.decoy) {
    const d = planted[c.incident.decoy]!;
    wifi_sessions.push({ mac: d.mac, ap_name: apFor(c.incident.room), connected_at: ts(T - 95 * 60), disconnected_at: ts(T - 41 * 60) });
  }
  if (c.incident.alibi) {
    const a = planted[c.incident.alibi.person]!;
    const left = secs(c.incident.alibi.leftAt);
    wifi_sessions.push({ mac: a.mac, ap_name: apFor(rooms[3]!), connected_at: ts(left - 3 * 3600), disconnected_at: ts(left - 120) });
  }
  wifi_sessions.sort((a, b) => String(a.connected_at).localeCompare(String(b.connected_at)));
  wifi_sessions.forEach((r, i) => (r.session_id = 5000 + i));

  // Parking gates.
  const parking_events: Row[] = [];
  for (let i = 0; i < c.staff; i++) {
    const v = rng.pick(vehicles);
    parking_events.push({ plate: v.plate, gate: rng.pick(["North", "East", "Lot C"]), direction: rng.chance(0.5) ? "IN" : "OUT", ts: ts(rng.int(-4 * 3600, 6 * 3600)) });
  }
  if (c.incident.alibi) {
    const a = planted[c.incident.alibi.person]!;
    parking_events.push({ plate: a.plate, gate: "North", direction: "OUT", ts: ts(secs(c.incident.alibi.leftAt)) });
  }
  parking_events.push({ plate: present.plate, gate: "East", direction: "IN", ts: ts(T - 34 * 60) });
  parking_events.push({ plate: present.plate, gate: "East", direction: "OUT", ts: ts(T + 47 * 60) });
  parking_events.sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
  parking_events.forEach((r, i) => (r.event_id = 9000 + i));

  // Stable column order; shuffle employee rows so planted people are not at the top.
  const shuffledEmployees = rng.shuffle(employees);
  return {
    planted,
    tables: {
      employees: { columns: [["employee_id", "TEXT PRIMARY KEY"], ["full_name", "TEXT"], ["department", "TEXT"], ["title", "TEXT"], ["badge_id", "TEXT"]], rows: shuffledEmployees },
      badges: { columns: [["badge_id", "TEXT PRIMARY KEY"], ["employee_id", "TEXT"], ["status", "TEXT"], ["issued_on", "TEXT"]], rows: rng.shuffle(badges) },
      access_points: { columns: [["ap_name", "TEXT PRIMARY KEY"], ["building", "TEXT"], ["floor", "INTEGER"], ["room", "TEXT"]], rows: access_points },
      access_logs: { columns: [["log_id", "INTEGER PRIMARY KEY"], ["badge_id", "TEXT"], ["door", "TEXT"], ["ts", "TEXT"], ["result", "TEXT"]], rows: access_logs },
      devices: { columns: [["mac", "TEXT PRIMARY KEY"], ["employee_id", "TEXT"], ["kind", "TEXT"], ["label", "TEXT"]], rows: rng.shuffle(devices) },
      wifi_sessions: { columns: [["session_id", "INTEGER PRIMARY KEY"], ["mac", "TEXT"], ["ap_name", "TEXT"], ["connected_at", "TEXT"], ["disconnected_at", "TEXT"]], rows: wifi_sessions },
      vehicles: { columns: [["plate", "TEXT PRIMARY KEY"], ["employee_id", "TEXT"], ["make", "TEXT"], ["color", "TEXT"]], rows: rng.shuffle(vehicles) },
      parking_events: { columns: [["event_id", "INTEGER PRIMARY KEY"], ["plate", "TEXT"], ["gate", "TEXT"], ["direction", "TEXT"], ["ts", "TEXT"]], rows: parking_events },
    },
  };
}

const lit = (v: string | number | null | undefined) => (v === null || v === undefined ? "NULL" : typeof v === "number" ? String(v) : `'${String(v).replace(/'/g, "''")}'`);

/** Portable SQL (works in PostgreSQL and SQLite). */
export function datasetSql(d: Dataset): { schema: string; data: string } {
  const schema = Object.entries(d.tables)
    .map(([t, def]) => `CREATE TABLE ${t} (\n  ${def.columns.map(([n, ty]) => `${n} ${ty}`).join(",\n  ")}\n);`)
    .join("\n\n");
  const data = Object.entries(d.tables)
    .map(([t, def]) => {
      const cols = def.columns.map(([n]) => n);
      const chunks: string[] = [];
      for (let i = 0; i < def.rows.length; i += 100)
        chunks.push(`INSERT INTO ${t} (${cols.join(", ")}) VALUES\n${def.rows.slice(i, i + 100).map((r) => `  (${cols.map((c) => lit(r[c])).join(", ")})`).join(",\n")};`);
      return chunks.join("\n");
    })
    .join("\n\n");
  return { schema, data };
}

interface Sec {
  answer: string;
  sql: { schema: string; data: string };
  tables: { name: string; columns: string[]; rows: number }[];
}

function answerFor(c: C, d: Dataset): string {
  const [who, field] = c.answerField.split(".") as ["present" | "badgeOf", "id" | "name" | "badge" | "mac" | "plate"];
  return d.planted[c.incident[who]]![field];
}

export const sqlInvestigation: ChallengePrimitive<C, { question: string; answerFormat: string }, Sec, A> = {
  id: "sql-investigation",
  version: "1.0.0",
  family: "ctf",
  label: "SQL investigation",
  summary: "A per-team generated campus database; the incident is planted consistently across badges, Wi-Fi, devices and parking. Query it live or download the dump.",
  schema: Config,
  actionSchema: Action,
  example: () => ({
    question: "Whose phone was on the access point in B-114 when the door opened?",
    answerFormat: "employee id (E####)",
    people: [
      { key: "culprit", name: "Theo Marsh", title: "PhD Scholar" },
      { key: "badge", name: "Dana Whitlock", department: "Facilities", title: "Night Technician" },
    ],
    incident: { room: "B-114", time: "02:47", badgeOf: "badge", present: "culprit", alibi: { person: "badge", leftAt: "01:10" } },
  }),
  createInstance(config, ctx) {
    const c = render(config, ctx.facts);
    const d = generateCampus(c, ctx.rng.fork("campus"));
    const answer = answerFor(c, d);
    const outputs: Record<string, string> = { answer };
    for (const [k, p] of Object.entries(d.planted)) {
      outputs[`${k}_id`] = p.id;
      outputs[`${k}_badge`] = p.badge;
      outputs[`${k}_plate`] = p.plate;
    }
    return {
      public: { question: c.question, answerFormat: c.answerFormat },
      secret: { answer, sql: datasetSql(d), tables: Object.entries(d.tables).map(([name, t]) => ({ name, columns: t.columns.map(([n]) => n), rows: t.rows.length })) },
      outputs,
      guarded: [answer],
      // Every employee id is in the data; the puzzle is the join that singles one out.
      intentional: ["plain"],
    };
  },
  view: (inst, node) => ({ kind: "sql", question: inst.public.question, answerFormat: inst.public.answerFormat, tables: inst.secret.tables, queries: Number(node?.steps["queries"] ?? 0), attempts: attempts(node) }),
  validateAction: () => ({ ok: true }),
  async applyAction(action, inst, node, _s, rt): Promise<Transition> {
    if (action.type === "query") {
      if (!rt.sql) return { events: [], correct: null, feedback: { tone: "info", title: "SANDBOX OFFLINE", message: "Download the SQL dump and query it locally." } };
      const r = await rt.sql(action.sql);
      return {
        events: [{ type: "node.step", node: "", key: "queries", value: Number(node?.steps["queries"] ?? 0) + 1 }],
        correct: null,
        feedback: { tone: "info", title: `${r.rowCount} row${r.rowCount === 1 ? "" : "s"}`, data: { result: r } },
      };
    }
    const ok = answerMatches(action.value, inst.secret.answer, "loose");
    return {
      events: ok ? [] : [{ type: "node.step", node: "", key: "attempts", value: attempts(node) + 1 }],
      solved: ok,
      correct: ok,
      submission: action.value.slice(0, 120),
      feedback: ok ? { tone: "success", title: "MATCH CONFIRMED" } : { tone: "fail", title: "NO MATCH", message: "The records do not support that." },
    };
  },
  intendedSolution: (inst) => [{ type: "answer", value: inst.secret.answer }],
  isAttempt: (a) => a.type === "answer",
  sqlDataset: (inst) => inst.secret.sql,
  artifacts: (inst) => [
    { name: "campus-records.sql", mime: "application/sql", description: "SQL dump (PostgreSQL / SQLite compatible)", build: () => utf8(`-- Synthetic campus records. Fictional data.\n${inst.secret.sql.schema}\n\n${inst.secret.sql.data}\n`) },
  ],
  difficulty: (c) =>
    profile({
      knowledgeDifficulty: 5,
      reasoningDifficulty: 6 + (c.incident.decoy ? 1 : 0),
      toolRequirement: 6,
      interactionDepth: 6,
      statefulness: 3,
      dependencyDepth: 3,
      crossModalComplexity: 4,
      redHerringDensity: (c.incident.decoy ? 3 : 0) + (c.incident.alibi ? 2 : 0) + 2,
      instanceUniqueness: 10,
    }),
  describe: () => ({ skills: ["SQL joins", "time-window reasoning"], tools: ["the in-game SQL console", "sqlite3 / psql"], interaction: { channels: ["database", "terminal"], textExposure: 0.01 } }),
  harden(c) {
    if (c.incident.decoy || c.people.length < 3) return null;
    const decoy = c.people.find((p) => p.key !== c.incident.present && p.key !== c.incident.badgeOf);
    if (!decoy) return null;
    return { config: { ...c, incident: { ...c.incident, decoy: decoy.key }, staff: Math.min(400, c.staff * 2) }, changes: [`Planted a decoy: ${decoy.name}'s phone sat on the same access point earlier that night`, `Staff population ${c.staff} → ${Math.min(400, c.staff * 2)}`] };
  },
};
