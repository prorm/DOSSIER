import type { Metadata, Viewport } from "next";
import { Chakra_Petch, Courier_Prime, IBM_Plex_Sans, Instrument_Serif, JetBrains_Mono, Newsreader } from "next/font/google";
import { headers } from "next/headers";

import { ThemeProvider } from "@/components/experience/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getTheme, themeStyleSheet } from "@/lib/experience/themes";
import { getDb } from "@/server/db/client";
import { getActiveEvent } from "@/server/engine/event";
import { resolveTheme } from "@/server/theme";

import "./globals.css";
import "./themes.css";
import "./experience.css";
import "./rooms.css";
import "./board.css";
import "./case.css";
import "./exam.css";

const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap", weight: ["400", "500", "600", "700"] });
const sans = IBM_Plex_Sans({ subsets: ["latin"], variable: "--font-plex", display: "swap", weight: ["400", "500", "600"] });
// Theme display faces: declared once, downloaded only when a theme actually uses them.
const instrument = Instrument_Serif({ subsets: ["latin"], variable: "--font-instrument", display: "swap", weight: "400", style: ["normal", "italic"], preload: false });
const newsreader = Newsreader({ subsets: ["latin"], variable: "--font-newsreader", display: "swap", weight: ["400", "500", "600"], style: ["normal", "italic"], preload: false });
const courier = Courier_Prime({ subsets: ["latin"], variable: "--font-courier", display: "swap", weight: ["400", "700"], preload: false });
const chakra = Chakra_Petch({ subsets: ["latin"], variable: "--font-chakra", display: "swap", weight: ["400", "500", "600", "700"], preload: false });

export async function generateMetadata(): Promise<Metadata> {
  const event = await getActiveEvent(await getDb()).catch(() => null);
  const name = event?.name ?? "DOSSIER";
  return {
    title: { default: name, template: `%s · ${name}` },
    description: (event?.config as { tagline?: string } | undefined)?.tagline || "DOSSIER — a self-hostable game engine for tech fests.",
    robots: { index: false, follow: false },
    icons: { icon: "/icon.svg" },
  };
}

export const viewport: Viewport = {
  themeColor: "#05070A",
  colorScheme: "dark light",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Reading request headers makes every page dynamic, which the per-request CSP nonce requires.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const { theme: themeId, event } = await resolveTheme();
  const theme = getTheme(themeId);
  const accent = (event?.config as { theme?: { accent?: string; secondary?: string } } | undefined)?.theme;
  return (
    <html
      lang="en"
      className={`${mono.variable} ${sans.variable} ${instrument.variable} ${newsreader.variable} ${courier.variable} ${chakra.variable}`}
      data-accent={accent?.accent ?? "green"}
      data-accent-2={accent?.secondary ?? "cyan"}
      data-dossier-theme={themeId}
      style={{ colorScheme: theme.scheme }}
      suppressHydrationWarning
    >
      <head>
        {nonce ? <meta name="csp-nonce" content={nonce} /> : null}
        <meta name="theme-color" content={theme.palette.bg} />
        <style dangerouslySetInnerHTML={{ __html: themeStyleSheet() }} />
      </head>
      <body className="crt">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:rounded-sm focus:bg-signal focus:px-3 focus:py-2 focus:font-mono focus:text-xs focus:text-[var(--accent-ink)]"
        >
          Skip to content
        </a>
        <ThemeProvider theme={themeId}>
          <TooltipProvider delayDuration={250}>{children}</TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
