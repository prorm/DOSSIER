import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans, JetBrains_Mono } from "next/font/google";
import { headers } from "next/headers";

import { TooltipProvider } from "@/components/ui/tooltip";
import { getDb } from "@/server/db/client";
import { getActiveEvent } from "@/server/engine/event";

import "./globals.css";

const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap", weight: ["400", "500", "600", "700"] });
const sans = IBM_Plex_Sans({ subsets: ["latin"], variable: "--font-plex", display: "swap", weight: ["400", "500", "600"] });

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
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Reading request headers makes every page dynamic, which the per-request CSP nonce requires.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const event = await getActiveEvent(await getDb()).catch(() => null);
  const theme = (event?.config as { theme?: { accent?: string; secondary?: string } } | undefined)?.theme;
  return (
    <html
      lang="en"
      className={`${mono.variable} ${sans.variable}`}
      data-accent={theme?.accent ?? "green"}
      data-accent-2={theme?.secondary ?? "cyan"}
      suppressHydrationWarning
    >
      <head>{nonce ? <meta name="csp-nonce" content={nonce} /> : null}</head>
      <body className="crt">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:rounded-sm focus:bg-signal focus:px-3 focus:py-2 focus:font-mono focus:text-xs focus:text-[var(--accent-ink)]"
        >
          Skip to content
        </a>
        <TooltipProvider delayDuration={250}>{children}</TooltipProvider>
      </body>
    </html>
  );
}
