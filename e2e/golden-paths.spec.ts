import { test, expect } from "@playwright/test";

test.describe("DOSSIER Golden Paths & Surface Health", () => {
  test("Public landing and hub navigation", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/DOSSIER/i);
    // Verifies cyber terminal theme elements exist
    await expect(page.locator("body")).toBeVisible();
    await expect(page.locator("text=DOSSIER")).toBeVisible();
  });

  test("Authentication portals render correctly", async ({ page }) => {
    // Team login
    await page.goto("/login");
    await expect(page.locator('input[name="teamName"], input[type="text"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();

    // Staff login
    await page.goto("/staff/login");
    await expect(page.locator('input[type="email"], input[name="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test("Public leaderboard and display screens", async ({ page }) => {
    await page.goto("/leaderboard");
    await expect(page.locator("text=LEADERBOARD, text=Standings, text=RANK").first()).toBeVisible();

    await page.goto("/display");
    await expect(page.locator("body")).toBeVisible();
  });

  test("Component Lab (/dev/ui) renders cyber-terminal primitives", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("/dev/ui");
    await expect(page.locator("body")).toBeVisible();
    await expect(page.locator("text=COMPONENT LAB, text=UI LAB, text=primitives").first()).toBeVisible();

    // Expect no critical runtime crashes
    expect(errors.filter((e) => !e.includes("ResizeObserver"))).toHaveLength(0);
  });

  test("360px Mobile viewport has zero horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });

    const surfaces = ["/", "/login", "/leaderboard", "/dev/ui"];
    for (const path of surfaces) {
      await page.goto(path);
      await page.waitForLoadState("domcontentloaded");

      const hasOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });

      expect(hasOverflow, `Path ${path} has horizontal overflow on 360px viewport`).toBe(false);
    }
  });
});
