/**
 * Visual QA harness: captures key screens at desktop (1440) and phone (360)
 * widths. Usage: pnpm tsx scripts/screenshots.ts [outDir] [baseUrl] [filter]
 * Requires the demo data (pnpm demo) and a running server.
 */
import { chromium, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const out = path.resolve(process.argv[2] ?? "docs/screenshots");
const base = process.argv[3] ?? "http://localhost:3000";
const filter = process.argv[4];

const TEAM = { teamName: "Null Pointers", password: "demo-password" };
const STAFF = { email: "admin@dossier.local", password: "dossier-demo-pass" };

const TEAM_PAGES = [
  ["console", "/play"],
  ["hunt", "/play/hunt"],
  ["ctf", "/play/ctf"],
  ["challenge", "/play/challenge/xor-marks"],
  ["challenge-locked", "/play/challenge/h08"],
  ["inquest", "/play/inquest"],
  ["evidence", "/play/inquest/evidence/e-cctv"],
  ["board", "/play/inquest/board"],
  ["accuse", "/play/inquest/accuse"],
  ["live", "/play/live"],
  ["leaderboard", "/play/leaderboard"],
];
const PUBLIC_PAGES = [
  ["landing", "/"],
  ["login", "/login"],
  ["register", "/register"],
  ["public-leaderboard", "/leaderboard"],
];
const STAFF_PAGES = [
  ["admin", "/admin"],
  ["admin-event", "/admin/event"],
  ["admin-challenges", "/admin/challenges"],
  ["admin-challenge-edit", "/admin/challenges/xor-marks"],
  ["admin-teams", "/admin/teams"],
  ["admin-submissions", "/admin/submissions"],
  ["admin-signals", "/admin/signals"],
  ["admin-checkpoints", "/admin/checkpoints"],
  ["admin-packs", "/admin/packs"],
  ["volunteer", "/volunteer"],
  ["display", "/display"],
  ["dev-ui", "/dev/ui"],
];

async function shoot(page: Page, name: string, url: string, width: number) {
  if (filter && !name.includes(filter)) return;
  await page.setViewportSize({ width, height: width < 500 ? 780 : 900 });
  await page.goto(base + url, { waitUntil: "networkidle" }).catch(() => {});
  await page.waitForTimeout(2200);
  const file = path.join(out, `${name}-${width}.png`);
  await page.screenshot({ path: file, fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  console.log(`${overflow > 1 ? "⚠ overflow " + overflow + "px " : ""}${file}`);
}

async function main() {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ reducedMotion: "no-preference" });
  await ctx.addCookies([{ name: "dossier_boot", value: "1", url: base }]);
  const page = await ctx.newPage();
  for (const w of [1440, 360]) for (const [n, u] of PUBLIC_PAGES) await shoot(page, n!, u!, w);
  // team session
  const r = await page.request.post(`${base}/api/auth/login`, { data: TEAM, headers: { origin: base } });
  if (!r.ok()) throw new Error(`team login failed ${r.status()} ${await r.text()}`);
  for (const w of [1440, 360]) for (const [n, u] of TEAM_PAGES) await shoot(page, n!, u!, w);
  const s = await page.request.post(`${base}/api/staff/login`, { data: STAFF, headers: { origin: base } });
  if (!s.ok()) throw new Error(`staff login failed ${s.status()} ${await s.text()}`);
  for (const w of [1440, 360]) for (const [n, u] of STAFF_PAGES) await shoot(page, n!, u!, w);
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
