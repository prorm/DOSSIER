import type { StageContext, StageKind } from "./types";

/**
 * Sample rooms for the Room lab (/dev/rooms) and visual tests. The shapes are
 * exactly what each primitive's `view()` returns; the content is invented.
 */
const base: Omit<StageContext, "primitive" | "view" | "title"> = {
  nodeId: "sample-node",
  artifacts: [],
  site: null,
  discoveries: [],
  tools: [],
  skills: [],
  checkpoint: null,
  disabledReason: null,
  fingerprint: "7f3a91c2d4e6b805",
  evidence: [
    { id: "ev-door", title: "B-wing door controller export" },
    { id: "ev-roster", title: "B-114 access roster" },
    { id: "ev-notebook", title: "Ilse's lab notebook" },
  ],
  characters: [
    { id: "marsh", name: "Theo Marsh", suspect: true, role: "PhD scholar & part-time sysadmin" },
    { id: "whitlock", name: "Dana Whitlock", suspect: true, role: "Night-shift security" },
    { id: "rao", name: "Prof. Anand Rao", suspect: true, role: "Head of the radio lab" },
  ],
  locations: [
    { id: "b114", name: "Server room B-114" },
    { id: "dome", name: "Observatory dome" },
  ],
  playtestScanUrl: null,
  gpsTarget: null,
  board: { placed: 9, strings: 5 },
};

const art = (name: string, mime: string, description: string, url: string, obtained: string | null = null) => ({ name, mime, description, url, obtained });

export function mockStage(kind: StageKind): StageContext {
  const mk = (primitive: string, title: string, view: StageContext["view"], extra: Partial<StageContext> = {}): StageContext => ({ ...base, primitive, title, view, ...extra });
  switch (kind) {
    case "crypto":
      return mk(
        "cryptic",
        "The 03:14 burst",
        {
          kind: "cryptic",
          total: 3,
          solvedSteps: 1,
          steps: [
            { index: 0, prompt: "The preamble arrived mirrored end to end of the alphabet: **`LIXSRW`**", reveal: "ORCHID", solved: true },
            { index: 1, prompt: "Then a name, enciphered with that key (Vigenère): **`LXFOPVEFRNHR`**. The operator only ever reused the first word.", reveal: null, solved: false },
            { index: 2, prompt: "Finally a place, hidden in plain sight: `WECRLTEERDSOEEFEAOCAIVDEN`", reveal: null, solved: false },
          ],
        },
        {},
      );
    case "web":
      return mk(
        "web-investigation",
        "The portal remembers",
        { kind: "site", question: "What maintenance passphrase does the portal client assemble for the audit?", answerFormat: "word-word-####", secretName: "maintenance passphrase", attempts: 2 },
        { site: { url: "#sandbox", title: "Kestrel Lab Intranet" }, discoveries: ["Read portal.sync from localStorage", "Found the offline cache entry", "Opened the source map"], tools: ["Network → Headers", "Application → IndexedDB", "Sources (source maps)"] },
      );
    case "osint":
      return mk("osint-trail", "OrbitTalk", { kind: "site", question: "Which handle belongs to the person who photographed the dome?", answerFormat: "@handle", start: "forum/thread-88" }, { site: { url: "#sandbox", title: "OrbitTalk" }, tools: ["search operators", "profile cross-referencing"] });
    case "forensics":
      return mk(
        "image-forensics",
        "B-114 whiteboard photo",
        { kind: "artifact", question: "What time is written on the board?", answerFormat: "HH:MM" },
        {
          artifacts: [
            art("whiteboard.svg", "image/svg+xml", "Photograph taken minutes after the door opened", "/dev/sample-photo.svg", "2026-03-14T02:58:00Z"),
            art("intercept-0314.wav", "audio/wav", "Morse on the left channel, a sweep on the right", "/dev/sample-recording.wav"),
            art("lab-notebook.pdf", "application/pdf", "Ilse's lab notebook, scanned", "#pdf", "2026-03-14T03:12:00Z"),
            art("backup.zip", "application/zip", "Encrypted workstation backup", "#zip"),
          ],
          tools: ["exiftool", "strings", "Audacity (spectrogram view)"],
        },
      );
    case "git":
      return mk("git-forensics", "The repository remembers", { kind: "artifact", question: "What was in the file deleted before the audit?", answerFormat: "" }, { artifacts: [art("lodestar-ground.zip", "application/zip", "Repository snapshot (working tree + .git)", "#")], tools: ["git log --all", "git show", "git reflog / git fsck --lost-found"] });
    case "pcap":
      return mk("network-capture", "The gateway heard", { kind: "artifact", question: "Which host was beaconing at 02:47?", answerFormat: "a.b.c.d" }, { artifacts: [art("gateway.pcap", "application/vnd.tcpdump.pcap", "Capture from the campus gateway", "/dev/sample-capture.pcap")], tools: ["Wireshark", "tshark", "tcpdump"] });
    case "sql":
      return mk(
        "sql-investigation",
        "The facilities database",
        {
          kind: "sql",
          question: "Whose badge and phone were both in B-114 at 02:47?",
          answerFormat: "employee id",
          queries: 3,
          tables: [
            { name: "employees", columns: ["id", "name", "dept", "badge_id"], rows: 84 },
            { name: "badge_swipes", columns: ["badge_id", "door", "at"], rows: 1280 },
            { name: "wifi_assoc", columns: ["mac", "ap", "at"], rows: 3410 },
            { name: "devices", columns: ["mac", "employee_id", "kind", "label"], rows: 156 },
          ],
        },
        {},
      );
    case "interview":
      return mk(
        "interview",
        "Interview — Dana Whitlock",
        {
          kind: "interview",
          name: "Dana Whitlock",
          intro: "Dana agreed to talk. She knows her badge opened B-114.",
          transcript: [
            { kind: "ask", id: "where", q: "Q: Where were you during the outage?", a: "Home. I left early — my shift ended at one. Check the gate camera.", contradicted: false },
            { kind: "ask", id: "badge", q: "Q: How did your badge open B-114 at night?", a: "I reported my badge sleeve missing on Tuesday. The badge was in it.", contradicted: true },
            { kind: "confront", id: "ev-door", q: "Presented evidence: ev-door", a: "That's my badge, yes. It wasn't me holding it.", contradicted: false },
          ],
          available: [
            { id: "guess", question: "Who might have had your badge?" },
            { id: "ilse", question: "Did Ilse say anything to you recently?" },
          ],
          contradictions: [{ id: "badge-alibi", label: "Badge reported missing Tuesday, used Thursday night" }],
          goal: { contradictions: 3, reached: 1 },
        },
      );
    case "timeline":
      return mk("timeline", "Reconstruct the night", {
        kind: "timeline",
        prompt: "Put the night in order. Some of these claims are wrong.",
        referenceTz: "UTC+05:30",
        missing: 1,
        best: 72,
        events: [
          { id: "t1", label: "Door controller logs a badge swipe at B-114", source: "controller (UTC)", shown: "21:17", confidence: "high" },
          { id: "t2", label: "Workstation starts a secure erase", source: "syslog (local)", shown: "02:47", confidence: "high" },
          { id: "t3", label: "Radio club records the 03:14 burst", source: "club log", shown: "03:14", confidence: "medium" },
          { id: "t4", label: "Storm knocks out campus power", source: "facilities note", shown: "about 2:30", confidence: "low" },
        ],
      });
    case "board":
      return mk("board-deduction", "The case board", { kind: "board", prompt: "Show that the evidence, together, points one way.", required: 6, maxUnsupported: 3, vocabulary: ["implicates", "alibi-for", "places-at", "contradicts", "supports", "owned-by", "sent-to", "motive-for", "precedes", "same-as"], attempts: 0 });
    case "checkpoint":
      return mk("qr-checkpoint", "The observatory", { kind: "checkpoint", checkpoint: "observatory-dome", prompt: "The last transmission came from the old dome. Go and see for yourselves.", confirmed: false }, {
        checkpoint: { id: "observatory-dome", name: "Observatory dome", location: "North lawn, behind the physics block", instructions: "A volunteer is at the base of the dome steps until 17:00.", kind: "qr" },
      });
    case "gps":
      return mk("gps-checkpoint", "The radio mast", { kind: "gps", checkpoint: "radio-mast", prompt: "Stand where the antenna stood.", radiusM: 40, confirmed: false }, {
        checkpoint: { id: "radio-mast", name: "Radio mast", location: "Rooftop of the lab annex", instructions: "", kind: "gps" },
      });
    case "final":
      return mk("final-reconstruction", "Reconstruct the night", {
        kind: "final",
        prompt: "File your reconstruction. Every finding must stand on evidence you hold.",
        fields: [
          { id: "culprit", label: "Culprit", type: "suspect", points: 200, options: [] },
          { id: "place", label: "Where it happened", type: "location", points: 100, options: [] },
          { id: "time", label: "Time of the wipe", type: "time", points: 100, options: [] },
          { id: "proof", label: "Key evidence", type: "evidence", points: 150, options: [] },
        ],
        maxAttempts: 3,
        attemptsUsed: 1,
        bestCredit: 300,
        solved: false,
        nextPenalty: 150,
        coherenceBonus: 200,
      });
    default:
      return mk("static-answer", "Warm-up", { kind: "answer", answerType: "flag" });
  }
}

export const STAGE_KINDS: StageKind[] = ["crypto", "web", "osint", "forensics", "git", "pcap", "sql", "interview", "timeline", "board", "checkpoint", "gps", "final", "answer"];
