import { expect, test, type Page } from "@playwright/test";

/**
 * The two-minute demo, end to end, as a stranger would run it:
 *
 *   Studio: new event → sample story → build the world → pick a look → publish, go live, start
 *   Player: register → the opening → the case universe → open a file → the evidence board
 *   Operator: the War Room sees the team, and sees it move
 *
 * It creates a real event and makes it the live one, so it leaves the world as it found it (the event
 * that was live is made live again). Runs last on purpose.
 */
const STAFF = { email: process.env.E2E_STAFF_EMAIL ?? "admin@dossier.local", password: process.env.E2E_STAFF_PASSWORD ?? "dossier-demo-pass" };

test.skip(({ isMobile }) => isMobile, "Desktop flow");

async function staffLogin(page: Page) {
  await page.goto("/staff/login");
  await page.fill('input[name="email"]', STAFF.email);
  await page.fill('input[name="password"]', STAFF.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/admin/);
}

const events = (page: Page) => page.evaluate(async () => ((await (await fetch("/api/studio")).json()) as { events: { id: string; active: boolean }[] }).events);

test("Studio → publish → a team walks in → the War Room watches", async ({ browser }) => {
  test.setTimeout(8 * 60_000);
  const t0 = Date.now();
  const marks: [string, number][] = [];
  const mark = (what: string) => marks.push([what, Math.round((Date.now() - t0) / 1000)]);

  const staffCtx = await browser.newContext();
  const s = await staffCtx.newPage();
  await staffLogin(s);
  await s.goto("/studio");
  const wasLive = (await events(s)).find((e) => e.active)?.id ?? null;

  try {
    /* ── Studio ── */
    await s.goto("/studio/new");
    const title = `Demo ${Date.now() % 100000}`;
    await s.getByLabel("Title").fill(title);
    await s.getByRole("button", { name: "Create event" }).click();
    await s.waitForURL(/\/studio\/[^/]+\?tab=story/);
    await s.getByRole("button", { name: "Try a sample story" }).click();
    await expect(s.getByText(/Characters \(\d+\)/)).toBeVisible({ timeout: 60_000 });
    mark("story compiled");

    await s.locator('[data-station="world"]').click();
    await s.getByRole("button", { name: "Generate" }).click();
    const world = s.getByRole("dialog", { name: "The world you built" });
    await expect(world.getByText("This is the world you just created.")).toBeVisible({ timeout: 120_000 });
    await world.getByRole("button", { name: "Leave the theatre" }).click();
    await expect(s.getByText(/critical path ~\d+ min/)).toBeVisible({ timeout: 120_000 });
    mark("world built");

    await s.locator('[data-station="presentation"]').click();
    await s.getByRole("radio", { name: /NEURAL ARCHIVE/ }).click();
    await s.getByRole("button", { name: "Save look" }).click();
    await expect(s.getByText("Saved", { exact: true })).toBeVisible({ timeout: 30_000 });
    mark("look chosen");

    await s.locator('[data-station="publish"]').click();
    await s.getByRole("switch").click(); // go live
    await s.getByRole("button", { name: "Publish", exact: true }).click();
    await expect(s.getByText(/Live for registration/)).toBeVisible({ timeout: 240_000 });
    await s.getByRole("button", { name: /Start the event now/ }).click();
    await expect(s.getByText(/Live — the clock is running/)).toBeVisible({ timeout: 60_000 });
    mark("published & started");

    /* ── A team walks in ── */
    const teamCtx = await browser.newContext();
    const p = await teamCtx.newPage();
    await p.goto("/register");
    const team = `Walk-in ${Date.now() % 100000}`;
    await p.fill('input[name="teamName"]', team);
    await p.getByLabel("Password", { exact: true }).fill("demo-password-123");
    await p.getByLabel("Confirm password").fill("demo-password-123");
    for (const [i, name] of ["Ada", "Grace"].entries()) {
      const box = p.getByLabel(`Member ${i + 1} name`);
      if (!(await box.count())) await p.getByRole("button", { name: "Add member" }).click();
      await p.getByLabel(`Member ${i + 1} name`).fill(name);
    }
    await p.locator('button[type="submit"]').click();
    await p.waitForURL(/\/play/);
    mark("team registered");

    // The opening plays (it is a first visit), quoting this event's real numbers; Skip goes in.
    await expect(p.locator(".opening")).toBeVisible({ timeout: 30_000 });
    await expect(p.locator("html")).toHaveAttribute("data-dossier-theme", "neural-archive");
    mark("opening");
    await p.getByRole("button", { name: /^Skip/ }).click();
    await expect(p.getByText("Current objective")).toBeVisible({ timeout: 30_000 });
    mark("console");

    await p.goto("/play/map");
    await expect(p.getByTestId("case-universe").first()).toBeVisible();
    const file = p.locator('a[href^="/play/node/"]').first();
    await expect(file).toBeVisible();
    mark("universe");
    const href = (await file.getAttribute("href"))!;
    await p.goto(href);
    await expect(p.getByRole("heading", { level: 1 }).first()).toBeVisible();
    mark("investigation");

    // One wrong answer, through the real API, so the operator has something to see.
    const csrf = await p.evaluate(() => document.querySelector('meta[name="csrf-token"]')?.getAttribute("content"));
    const status = await p.evaluate(
      async ({ node, csrf }) => (await fetch("/api/play/submit", { method: "POST", headers: { "content-type": "application/json", "x-csrf-token": csrf! }, body: JSON.stringify({ challengeId: node, answer: `nope-${Date.now()}` }) })).status,
      { node: href.split("/").pop()!, csrf },
    );
    expect(status).toBe(200);

    await p.goto("/play/board");
    await expect(p.locator('.board-wall[data-ready="true"]')).toBeVisible({ timeout: 30_000 });
    mark("board");

    /* ── The operator ── */
    await s.goto("/admin");
    const room = s.getByTestId("war-room");
    await expect(room).toContainText(title.toUpperCase().slice(0, 12), { ignoreCase: true });
    await expect(room.getByText("Active", { exact: true })).toBeVisible();
    await expect(room.locator(".wr-feed")).toContainText(team, { timeout: 30_000 });
    mark("war room");
    await teamCtx.close();
  } finally {
    // Leave the world as we found it: the event that was live is live again.
    if (wasLive) {
      await s.goto("/studio");
      const csrf = await s.evaluate(() => document.querySelector('meta[name="csrf-token"]')?.getAttribute("content"));
      await s.evaluate(async ({ id, csrf }) => void (await fetch(`/api/studio/${id}`, { method: "POST", headers: { "content-type": "application/json", "x-csrf-token": csrf! }, body: JSON.stringify({ op: "activate" }) })), { id: wasLive, csrf });
    }
    await staffCtx.close();
  }

  const total = marks.at(-1)![1];
  test.info().annotations.push({ type: "timeline", description: marks.map(([w, t]) => `${t}s ${w}`).join(" · ") });
  console.log(`DEMO TIMELINE (dev server): ${marks.map(([w, t]) => `${t}s ${w}`).join(" → ")}`);
  expect(total).toBeLessThan(240);
});
