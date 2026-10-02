/**
 * Visual QA harness. Signs in through the real UI and captures the requested
 * routes with a WebGL-capable headless Chromium.
 *
 *   pnpm tsx scripts/shots.ts --out <dir> [--as team|staff|none] [--size 1440x900] [--wait 2500]
 *                             [--team "Null Pointers"] [--boot] [--full] [--base http://localhost:3000]
 *                             [--theme blacksite|neural-archive|cold-case|signal] <route>...
 *
 * Needs a running server seeded with `pnpm demo`.
 */
import { chromium, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

function arg(name: string, fallback?: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}
const flag = (name: string) => process.argv.includes(`--${name}`);
const VALUE_FLAGS = new Set(["--out", "--as", "--size", "--wait", "--team", "--base", "--theme", "--timeline"]);
const routes = process.argv.slice(2).filter((a, i, all) => a.startsWith("/") && !VALUE_FLAGS.has(all[i - 1] ?? ""));

const out = path.resolve(arg("out", "docs/screenshots")!);
const base = arg("base", "http://localhost:3000")!;
const as = arg("as", "team")!;
const [w, h] = arg("size", "1440x900")!.split("x").map(Number) as [number, number];
const wait = Number(arg("wait", "2500"));
const teamName = arg("team", "Null Pointers")!;
const theme = arg("theme");

async function login(page: Page) {
  if (as === "team") {
    await page.goto(`${base}/login`, { timeout: 150_000 });
    await page.fill('input[name="teamName"]', teamName);
    await page.fill('input[name="password"]', "demo-password");
    await Promise.all([page.waitForURL(/\/play/, { timeout: 150_000 }), page.click('button[type="submit"]')]);
  } else if (as === "staff") {
    await page.goto(`${base}/staff/login`, { timeout: 150_000 });
    await page.fill('input[name="email"]', "admin@dossier.local");
    await page.fill('input[name="password"]', "dossier-demo-pass");
    await Promise.all([page.waitForURL(/\/admin/, { timeout: 150_000 }), page.click('button[type="submit"]')]);
  }
}

async function main() {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-webgl"],
  });
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  if (flag("boot")) await ctx.addCookies([{ name: "dossier_boot", value: "1", url: base }]);
  if (theme) await ctx.addCookies([{ name: "dossier_theme", value: theme, url: base }]);
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text().slice(0, 300)}`);
  });
  await login(page);
  for (const r of routes) {
    errors.length = 0;
    await page.goto(base + r, { waitUntil: "load", timeout: 150_000 }).catch((e) => console.log(`! ${r}: ${e.message}`));
    // If the route mounts a WebGL universe, wait until it reports ready (first compile in dev can take a while).
    const timeline = arg("timeline");
    if (timeline) {
      // Capture a sequence (an opening, a build animation) at fixed offsets after load.
      const t0 = Date.now();
      for (const t of timeline.split(",").map(Number)) {
        await page.waitForTimeout(Math.max(0, t - (Date.now() - t0)));
        const f = path.join(out, `${r.replace(/^\//, "").replace(/[/?=&]/g, "_") || "home"}-t${t}.png`);
        await page.screenshot({ path: f, timeout: 120_000 });
        console.log(f);
      }
      continue;
    }
    await page.waitForTimeout(2000);
    if (await page.locator('[data-testid="case-universe"][data-renderer="3d"]').count()) await page.waitForSelector('[data-testid="case-universe"][data-ready="true"]', { timeout: 90_000 }).catch(() => console.log(`  (3D not ready on ${r})`));
    await page.waitForTimeout(wait);
    const name = r.replace(/^\//, "").replace(/[/?=&]/g, "_") || "home";
    const file = path.join(out, `${name}-${w}.png`);
    await page.screenshot({ path: file, fullPage: flag("full"), timeout: 180_000 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    console.log(`${overflow > 1 ? `⚠ overflow ${overflow}px ` : ""}${file}${errors.length ? `\n   ${errors.slice(0, 4).join("\n   ")}` : ""}`);
  }
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
