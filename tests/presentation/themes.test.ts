import { describe, expect, it } from "vitest";
import { DEFAULT_THEME, THEMES, THEME_IDS, THEME_LIST, getTheme, isThemeId, themeScopeStyle, themeStyleSheet } from "../../src/lib/experience/themes";

/** WCAG relative luminance / contrast, so "ink on paper" is a checked fact, not a hope. */
function lum(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
function contrast(a: string, b: string) {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

describe("themes", () => {
  it("ships at least four, registered under stable ids", () => {
    expect(THEME_IDS.length).toBeGreaterThanOrEqual(4);
    for (const id of THEME_IDS) expect(THEMES[id].id).toBe(id);
    expect(isThemeId("cold-case")).toBe(true);
    expect(isThemeId("nope")).toBe(false);
    expect(getTheme("nope").id).toBe(DEFAULT_THEME);
  });

  it("are genuinely different: navigation, universe layout, backdrop, node style, formation and surface all vary", () => {
    for (const key of ["nav", "surface", "formation"] as const) expect(new Set(THEME_LIST.map((t) => t[key])).size).toBe(THEME_LIST.length);
    for (const key of ["layout", "backdrop", "nodeStyle", "edgeStyle"] as const) expect(new Set(THEME_LIST.map((t) => t.universe[key])).size).toBe(THEME_LIST.length);
    expect(new Set(THEME_LIST.map((t) => t.fonts.display)).size).toBeGreaterThanOrEqual(3);
    expect(new Set(THEME_LIST.map((t) => t.radius.ctl)).size).toBeGreaterThanOrEqual(3);
    // At least one dark and one light scheme.
    expect(new Set(THEME_LIST.map((t) => t.scheme))).toEqual(new Set(["dark", "light"]));
  });

  it("keep body text legible (WCAG AA 4.5:1) and signals readable on every surface", () => {
    for (const t of THEME_LIST) {
      expect(contrast(t.palette.ink, t.palette.bg), `${t.id} ink/bg`).toBeGreaterThan(7);
      expect(contrast(t.palette.inkDim, t.palette.surface), `${t.id} inkDim/surface`).toBeGreaterThan(4.5);
      expect(contrast(t.palette.mute, t.palette.surface), `${t.id} mute/surface`).toBeGreaterThan(3);
      for (const [name, c] of Object.entries(t.signals)) expect(contrast(c, t.palette.surface), `${t.id} ${name}/surface`).toBeGreaterThan(3);
      // Text on a solid accent fill.
      expect(contrast(t.palette.accentInk, t.signals.green), `${t.id} accentInk/green`).toBeGreaterThan(3.5);
    }
  });

  it("generate one token block per theme from the same source", () => {
    const css = themeStyleSheet();
    for (const id of THEME_IDS) expect(css).toContain(`:root[data-dossier-theme="${id}"]`);
    expect(css).toContain("--color-bg:#e6dcc5");
    const scope = themeScopeStyle("signal");
    expect(scope["--color-bg"]).toBe(THEMES.signal.palette.bg);
    expect(scope.colorScheme).toBe("dark"); // React wants camelCase for real CSS properties
  });

  it("define a universe palette with every presentation state and sound profile", () => {
    for (const t of THEME_LIST) {
      for (const k of ["locked", "discovered", "available", "completed", "failed", "suspicious", "edge", "edgeLive"] as const) expect(t.universe.colors[k]).toMatch(/^#[0-9a-f]{6}$/i);
      expect(t.sound.root).toBeGreaterThan(50);
      expect(t.universe.fov).toBeGreaterThan(20);
    }
  });
});
