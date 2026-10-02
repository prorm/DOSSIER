"use client";

import { createContext, useContext, useMemo, type CSSProperties, type ReactNode } from "react";

import { getTheme, themeScopeStyle, type ThemeDef, type ThemeId } from "@/lib/experience/themes";

const ThemeContext = createContext<ThemeDef>(getTheme("blacksite"));

/** The theme painting this page. Set once by the root layout from the event's presentation settings. */
export function ThemeProvider({ theme, children }: { theme: ThemeId; children: ReactNode }) {
  const def = useMemo(() => getTheme(theme), [theme]);
  return <ThemeContext.Provider value={def}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeDef {
  return useContext(ThemeContext);
}

/**
 * Renders children under a *different* theme than the page's. Used by Studio to
 * preview any theme live (cinematic, universe, board) without publishing: the
 * tokens are applied to this subtree only.
 */
export function ThemeScope({ theme, accent, accent2, className, children, style }: { theme: ThemeId; /** The organiser's accent / secondary colour names, for themes that follow them. */ accent?: string; accent2?: string; className?: string; children: ReactNode; style?: CSSProperties }) {
  const def = useMemo(() => getTheme(theme), [theme]);
  const vars = useMemo(() => themeScopeStyle(theme) as CSSProperties, [theme]);
  return (
    <ThemeContext.Provider value={def}>
      <div data-dossier-scope={theme} data-accent={accent} data-accent-2={accent2} className={className} style={{ ...vars, background: "var(--color-bg)", color: "var(--color-ink)", ...style }}>
        {children}
      </div>
    </ThemeContext.Provider>
  );
}
