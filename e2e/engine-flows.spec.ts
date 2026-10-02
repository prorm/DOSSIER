import { expect, test, type Page } from "@playwright/test";

/**
 * Engine golden paths against a server seeded with `pnpm demo` (CASE 017 +
 * demo staff/teams). Credentials default to the demo's; override with env.
 */
const STAFF = { email: process.env.E2E_STAFF_EMAIL ?? "admin@dossier.local", password: process.env.E2E_STAFF_PASSWORD ?? "dossier-demo-pass" };
const TEAM = { name: process.env.E2E_TEAM ?? "Lambda Lords", password: process.env.E2E_TEAM_PASSWORD ?? "demo-password" };

test.describe.configure({ mode: "serial" });
test.skip(({ isMobile }) => isMobile, "Desktop flows; mobile overflow is covered in golden-paths.");

async function skipBoot(page: Page) {
  await page.context().addCookies([{ name: "dossier_boot", value: "1", url: test.info().project.use.baseURL! }]);
}

async function staffLogin(page: Page) {
  await page.goto("/staff/login");
  await page.fill('input[name="email"]', STAFF.email);
  await page.fill('input[name="password"]', STAFF.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/admin/);
}

async function teamLogin(page: Page) {
  await skipBoot(page);
  await page.goto("/login");
  await page.fill('input[name="teamName"]', TEAM.name);
  await page.fill('input[name="password"]', TEAM.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/play/);
}

test("Control Room is derived from team journals", async ({ page }) => {
  await staffLogin(page);
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Control room" })).toBeVisible();
  await expect(page.getByText("Challenge telemetry")).toBeVisible();
  await expect(page.locator("table").first().locator("tbody tr").first()).toBeVisible();
});

test("Team console, case map, and a sandboxed investigation site with real browser state", async ({ page, context }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await teamLogin(page);
  await expect(page.getByText("Current objective")).toBeVisible();
  await page.goto("/play/map");
  await expect(page.locator('a[href^="/play/node/"]').first()).toBeVisible();

  await page.goto("/play/node/kestrel-portal");
  const link = page.locator('a[href*="/x/"]').first();
  await expect(link).toBeVisible();
  const site = await context.newPage();
  await site.goto((await link.getAttribute("href"))!);
  await site.waitForLoadState("networkidle");
  await expect(site).toHaveTitle(/Kestrel/);
  const state = await site.evaluate(async () => ({
    local: Object.keys(localStorage),
    idb: ((await indexedDB.databases?.()) ?? []).map((d) => d.name),
    scripts: [...document.scripts].map((s) => s.src).filter(Boolean),
  }));
  expect(state.local.length).toBeGreaterThan(0);
  expect(state.idb).toContain("portal-offline");
  const js = await site.request.get(state.scripts[0]!);
  const map = /sourceMappingURL=(\S+)/.exec(await js.text())?.[1];
  expect(map).toBeTruthy();
  const sm = await (await site.request.get(new URL(map!, state.scripts[0]).href)).json();
  expect(sm.version).toBe(3);
  expect(errors).toEqual([]);
});

test("Studio: story → world → look → playtest → publish → play as team", async ({ page }) => {
  test.setTimeout(8 * 60_000);
  await staffLogin(page);
  await page.goto("/studio/new");
  await page.getByLabel("Title").fill(`E2E Case ${Date.now() % 100000}`);
  await page.getByRole("button", { name: "Create event" }).click();
  await page.waitForURL(/\/studio\/[^/]+\?tab=story/);

  // STORY: the production line reads the real draft.
  const line = page.getByRole("navigation", { name: "Production line" });
  await expect(line).toContainText("Drop in your story");
  await page.setInputFiles('input[type="file"]', "tests/fixtures/stories/gallery-heist.md");
  await page.getByRole("button", { name: "Compile story" }).click();
  await expect(page.getByText(/Characters \(\d+\)/)).toBeVisible({ timeout: 60_000 });
  await expect(line).toContainText(/\d+ people/);

  // WORLD: building leaves a receipt of measured stages, and the line lights up from it.
  await page.locator('[data-station="world"]').click();
  await page.getByRole("button", { name: "Generate" }).click();
  const receipt = page.getByRole("region", { name: "Build receipt" }).first();
  await expect(receipt).toContainText("Wire the graph", { timeout: 240_000 });
  // Stages show their numbers as the playhead passes them, so allow the replay to finish.
  await expect(receipt).toContainText(/\d+ gates/, { timeout: 60_000 });
  await expect(line).toContainText(/\d+ files/);
  // …the theatre closes on the world it built, quoting the draft's real numbers…
  const world = page.getByRole("dialog", { name: "The world you built" });
  await expect(world.getByText("This is the world you just created.")).toBeVisible({ timeout: 60_000 });
  await world.getByRole("button", { name: "Leave the theatre" }).click();
  // …and hands over to the challenges.
  await expect(page.getByText(/critical path ~\d+ min/)).toBeVisible({ timeout: 60_000 });

  // LOGIC: the graph.
  await page.locator('[data-station="logic"]').click();
  await expect(page.getByRole("button", { name: "Graph", exact: true })).toBeVisible();
  await expect(page.getByRole("application", { name: /Challenge graph/ })).toBeVisible();

  // PRESENTATION: pick a look, save it.
  await page.locator('[data-station="presentation"]').click();
  await page.getByRole("radio", { name: /COLD CASE/ }).click();
  await page.getByRole("button", { name: "Save look" }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible({ timeout: 30_000 });

  // PLAYTEST → PUBLISH.
  await page.locator('[data-station="playtest"]').click();
  await page.getByRole("button", { name: "Validate", exact: true }).click();
  await expect(page.getByText(/✓ Publishable/)).toBeVisible({ timeout: 240_000 });
  await page.locator('[data-station="publish"]').click();
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByText("published v1", { exact: true })).toBeVisible({ timeout: 240_000 });
  await page.getByRole("button", { name: "Play as team" }).first().click();
  await page.waitForURL(/\/play/);
  await expect(page.getByText("Current objective")).toBeVisible();
});
