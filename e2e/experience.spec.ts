import { expect, test, type BrowserContext, type Page } from "@playwright/test";

/**
 * The experience layer against a server seeded with `pnpm demo`: the opening sequence, the case
 * universe (3D and its flat twin), the four themes, the evidence board, the case file and the
 * War Room reacting live. Credentials default to the demo's.
 */
const STAFF = { email: process.env.E2E_STAFF_EMAIL ?? "admin@dossier.local", password: process.env.E2E_STAFF_PASSWORD ?? "dossier-demo-pass" };
const TEAM = { name: process.env.E2E_TEAM ?? "Lambda Lords", password: process.env.E2E_TEAM_PASSWORD ?? "demo-password" };
const BASE = () => test.info().project.use.baseURL!;

test.describe.configure({ mode: "serial" });
test.skip(({ isMobile }) => isMobile, "Desktop flows; the phone layout is checked by the overflow audit.");

async function teamLogin(page: Page, opts: { boot?: boolean } = { boot: true }) {
  if (opts.boot !== false) await page.context().addCookies([{ name: "dossier_boot", value: "1", url: BASE() }]);
  await page.goto("/login");
  await page.fill('input[name="teamName"]', TEAM.name);
  await page.fill('input[name="password"]', TEAM.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/play/);
}

async function staffLogin(page: Page) {
  await page.goto("/staff/login");
  await page.fill('input[name="email"]', STAFF.email);
  await page.fill('input[name="password"]', STAFF.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/admin/);
}

test.describe("cinematic entry", () => {
  test("the first visit plays the opening, Skip leaves it, and a returning visit goes straight in", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await teamLogin(page, { boot: false });
    const opening = page.locator(".opening");
    await expect(opening).toBeVisible({ timeout: 30_000 });
    // It quotes real numbers: the log prints this team's own world.
    await expect(page.locator(".opening-head")).toContainText(/DOS-\d{4}/);
    await page.getByRole("button", { name: /^Skip/ }).click();
    await expect(opening).toHaveCount(0, { timeout: 15_000 });
    await expect(page.getByText("Current objective")).toBeVisible();
    // The boot cookie is set: no second opening in this session.
    await page.reload();
    await expect(page.getByText("Current objective")).toBeVisible();
    await expect(page.locator(".opening")).toHaveCount(0);
    await ctx.close();
  });

  test("reduced motion gets a still title card and an explicit way in", async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: "reduce" });
    const page = await ctx.newPage();
    await teamLogin(page, { boot: false });
    await expect(page.locator(".opening")).toBeVisible({ timeout: 30_000 });
    // No Skip button is needed for a still card, and nothing animates in: the way in is already on screen.
    await expect(page.getByRole("button", { name: /^Skip/ })).toHaveCount(0);
    await page.locator(".opening-cta .u-cta").click();
    await expect(page.locator(".opening")).toHaveCount(0, { timeout: 15_000 });
    await expect(page.getByText("Current objective")).toBeVisible();
    await ctx.close();
  });
});

test.describe("the case universe", () => {
  test("renders in 3D where it can and always has its flat twin; every file is reachable as a link", async ({ page }) => {
    await teamLogin(page);
    await page.goto("/play/map");
    const universe = page.getByTestId("case-universe").first();
    await expect(universe).toBeVisible();
    await expect(universe).toHaveAttribute("data-ready", /true|false/);
    const links = page.locator('a[href^="/play/node/"]');
    expect(await links.count()).toBeGreaterThan(0);
    await expect(page.getByRole("application", { name: /Investigation map/ })).toBeVisible();
  });

  test("effects off falls back to the flat map, with the same files", async ({ page }) => {
    await teamLogin(page);
    await page.goto("/play/map?fx=off");
    const universe = page.getByTestId("case-universe").first();
    await expect(universe).toHaveAttribute("data-renderer", "2d");
    await expect(page.locator("svg.u-flat").first()).toBeVisible();
    expect(await page.locator('a[href^="/play/node/"]').count()).toBeGreaterThan(0);
  });
});

test.describe("themes", () => {
  const THEMES = [
    ["blacksite", "rail"],
    ["neural-archive", "dock"],
    ["cold-case", "tabs"],
    ["signal", "tuner"],
  ] as const;

  test("four genuinely different worlds: each brings its own navigation, fonts and surfaces", async ({ page, context }) => {
    await teamLogin(page);
    const seen = new Set<string>();
    for (const [theme, nav] of THEMES) {
      await context.addCookies([{ name: "dossier_theme", value: theme, url: BASE() }]);
      await page.goto("/play");
      const html = page.locator("html");
      const applied = await html.getAttribute("data-dossier-theme");
      test.skip(applied !== theme, "Theme overrides need DEV_UI=true on the server");
      await expect(page.locator(".shell")).toHaveAttribute("data-nav", nav);
      const look = await page.evaluate(() => {
        const cs = getComputedStyle(document.documentElement);
        return `${cs.getPropertyValue("--color-bg").trim()}|${cs.getPropertyValue("--font-display").trim()}|${cs.getPropertyValue("--r-panel").trim()}`;
      });
      seen.add(look);
    }
    expect(seen.size).toBe(4);
    await context.clearCookies({ name: "dossier_theme" });
  });
});

test.describe("the evidence board", () => {
  test("pin two exhibits, tie a string by dragging from a pin, and it survives a reload", async ({ page }) => {
    await teamLogin(page);
    await page.goto("/play/board");
    const wall = page.locator('.board-wall[data-ready="true"]');
    await expect(wall).toBeVisible({ timeout: 30_000 });

    // Put two exhibits on the wall from the tray (whichever are not there yet).
    const tray = page.locator("aside .tray-item");
    const before = await page.locator(".ex-wrap").count();
    const free = await tray.count();
    test.skip(free < 2 && before < 2, "Not enough exhibits held to tie a string");
    for (let i = 0; i < Math.min(2, free); i++) await tray.first().click();
    await expect.poll(() => page.locator(".ex-wrap").count()).toBeGreaterThanOrEqual(2);

    // Drag from the pin of the first exhibit onto the second.
    const wraps = page.locator(".ex-wrap");
    const a = wraps.nth(0);
    const b = wraps.nth(1);
    const idA = (await a.getAttribute("data-node"))!;
    // A pair can only be tied once: start from an exhibit with no strings (earlier runs may have left some).
    await page.locator(`[data-node="${idA}"] .ex-hit`).focus();
    const cut = page.getByRole("button", { name: /Cut strings/ });
    if (await cut.isVisible()) {
      await cut.click();
      await expect(page.getByRole("status").filter({ hasText: /Saved/ })).toBeVisible({ timeout: 15_000 });
    }
    await page.keyboard.press("Escape");
    await a.scrollIntoViewIfNeeded();
    const pin = await a.locator("[data-pin]").boundingBox();
    const target = await b.locator(".ex").boundingBox();
    expect(pin && target).toBeTruthy();
    const strings = await page.locator(".string-chip").count();
    await page.mouse.move(pin!.x + pin!.width / 2, pin!.y + pin!.height / 2);
    await page.mouse.down();
    await page.mouse.move(target!.x + target!.width / 2, target!.y + target!.height / 2, { steps: 12 });
    await page.mouse.up();

    // The picker offers relationships; the first suggestion ties the string.
    const picker = page.getByRole("dialog", { name: "Choose the relationship" });
    await expect(picker).toBeVisible();
    await picker.locator("button.pick").first().click();
    await expect(page.locator(".string-chip")).toHaveCount(strings + 1);
    await expect(page.getByRole("status").filter({ hasText: /Saved/ })).toBeVisible({ timeout: 15_000 });

    await page.reload();
    await expect(page.locator('.board-wall[data-ready="true"]')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator(".string-chip")).toHaveCount(strings + 1);

    // Leave the wall as we found it.
    await page.locator(`[data-node="${idA}"] .ex-hit`).focus();
    await page.getByRole("button", { name: /Cut strings/ }).click();
    await expect(page.getByRole("status").filter({ hasText: /Saved/ })).toBeVisible({ timeout: 15_000 });
  });
});

test.describe("the case file", () => {
  test("exhibits are objects you can open, in order, with the sealed ones counted", async ({ page }) => {
    await teamLogin(page);
    await page.goto("/play/case");
    await expect(page.getByRole("navigation", { name: /Sections of the case file/ })).toBeVisible();
    const first = page.locator('a[href^="/play/case/evidence/"]').first();
    await expect(first).toBeVisible();
    await first.click();
    await page.waitForURL(/\/play\/case\/evidence\//);
    await expect(page.getByText(/Exhibit \d+ of \d+/)).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Other exhibits" })).toBeVisible();
  });
});

test.describe("the War Room", () => {
  test("shows the case with every team on it, and a team's move appears without a reload", async ({ browser }) => {
    const staffCtx: BrowserContext = await browser.newContext();
    const sp = await staffCtx.newPage();
    await staffLogin(sp);
    await sp.goto("/admin");
    const room = sp.getByTestId("war-room");
    await expect(room).toBeVisible();
    await expect(sp.getByRole("heading", { name: /Control room/ })).toBeVisible();
    await expect(room.getByText("Needs attention")).toBeVisible();
    await expect(room.locator(".wr-clock")).toContainText(/\d\d:\d\d:\d\d/);
    await expect(sp.getByText("Challenge telemetry")).toBeVisible();

    // A team misses on a file; the operator's feed shows it.
    const teamCtx = await browser.newContext();
    const tp = await teamCtx.newPage();
    await teamLogin(tp);
    await tp.goto("/play/map");
    const node = (await tp.locator('a[href^="/play/node/"]').first().getAttribute("href"))!.split("/").pop()!;
    const csrf = await tp.evaluate(() => document.querySelector('meta[name="csrf-token"]')?.getAttribute("content"));
    const status = await tp.evaluate(
      async ({ node, csrf }) => (await fetch("/api/play/submit", { method: "POST", headers: { "content-type": "application/json", "x-csrf-token": csrf! }, body: JSON.stringify({ challengeId: node, answer: `wrong-${Date.now()}` }) })).status,
      { node, csrf },
    );
    expect(status).toBe(200);
    await expect(room.locator(".wr-feed li.is-fresh, .wr-feed li.is-bad").first()).toContainText(/missed on/, { timeout: 20_000 });
    await teamCtx.close();
    await staffCtx.close();
  });

  test("Wall mode fills the screen and Escape gives it back", async ({ page }) => {
    await staffLogin(page);
    await page.goto("/admin");
    await page.getByRole("button", { name: /Wall mode/ }).click();
    await expect(page.getByTestId("war-room")).toHaveClass(/is-wall/);
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("war-room")).not.toHaveClass(/is-wall/);
  });
});

test.describe("the front door", () => {
  test("the landing page shows the real size of the case and names no file", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    const facts = page.getByLabel("The case in numbers");
    await expect(facts).toContainText(/Files\s*\d+/);
    await expect(facts).toContainText(/Acts\s*\d+/);
    // Spoiler safety: the silhouettes carry no titles.
    const html = await page.content();
    expect(html).not.toContain("The 03:14 burst");
  });
});

test.describe("phones", () => {
  test("nothing the player or the operator sees scrolls sideways at 360px", async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 360, height: 800 });
    const overflow = async (path: string) => {
      await page.goto(path);
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(1200);
      return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    };
    await teamLogin(page);
    for (const path of ["/play", "/play/map", "/play/case", "/play/board", "/play/leaderboard", "/play/node/kestrel-portal"]) {
      expect(await overflow(path), `${path} overflows at 360px`).toBeLessThanOrEqual(1);
    }
    await staffLogin(page);
    for (const path of ["/admin", "/admin/teams", "/studio", "/studio/case-017"]) {
      expect(await overflow(path), `${path} overflows at 360px`).toBeLessThanOrEqual(1);
    }
  });
});
