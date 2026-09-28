"use client";

import { Binary, Crosshair, FolderSearch, LogOut, Sparkles, SparklesIcon, Trophy, type LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator, CommandShortcut } from "@/components/ui/command";
import { api } from "@/lib/api";
import { challengeHref, type NavItem } from "@/lib/modes";
import { setEffectsEnabled, useEffectsPreference } from "./effects";

interface PaletteItem {
  id: string;
  mode: "hunt" | "ctf" | "inquest";
  title: string;
  state: "open" | "solved";
  category: string | null;
}

const MODE_ICON: Record<PaletteItem["mode"], LucideIcon> = { hunt: Crosshair, ctf: Binary, inquest: FolderSearch };

/** Ctrl/Cmd+K. Jump anywhere: sections, any visible challenge, core actions. */
export function CommandPalette({ nav, open, onOpenChange }: { nav: NavItem[]; open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const [items, setItems] = useState<PaletteItem[] | null>(null);
  const effects = useEffectsPreference();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    api<{ items: PaletteItem[] }>("/api/play/palette")
      .then((r) => alive && setItems(r.items))
      .catch(() => alive && setItems([]));
    return () => {
      alive = false;
    };
  }, [open]);

  const go = useCallback(
    (href: string) => {
      onOpenChange(false);
      router.push(href);
    },
    [router, onOpenChange],
  );

  const logout = async () => {
    onOpenChange(false);
    await api("/api/auth/logout", { method: "POST", body: {} }).catch(() => {});
    router.push("/login");
    router.refresh();
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Command palette" description="Jump to a section or challenge" className="top-[18%] translate-y-0 sm:max-w-xl">
      <CommandInput placeholder="Type a command or search challenges…" />
      <CommandList>
        <CommandEmpty>No match in the archive.</CommandEmpty>
        <CommandGroup heading="Navigate">
          {nav.map((n) => (
            <CommandItem key={n.href} value={`go ${n.label}`} onSelect={() => go(n.href)}>
              <n.icon />
              {n.label}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading={items === null ? "Challenges — loading…" : `Challenges (${items.length})`}>
          {(items ?? []).map((c) => {
            const Icon = MODE_ICON[c.mode];
            return (
              <CommandItem key={c.id} value={`${c.title} ${c.id} ${c.category ?? ""} ${c.mode}`} onSelect={() => go(challengeHref(c.id))}>
                <Icon />
                <span className="truncate">{c.title}</span>
                <CommandShortcut className={c.state === "solved" ? "text-signal-green" : ""}>{c.state === "solved" ? "solved" : c.mode}</CommandShortcut>
              </CommandItem>
            );
          })}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Actions">
          <CommandItem value="leaderboard scores ranks" onSelect={() => go("/play/leaderboard")}>
            <Trophy />
            Open leaderboard
          </CommandItem>
          <CommandItem value="toggle effects motion animation" onSelect={() => setEffectsEnabled(!effects)}>
            {effects ? <Sparkles /> : <SparklesIcon />}
            {effects ? "Turn visual effects off" : "Turn visual effects on"}
          </CommandItem>
          <CommandItem value="sign out logout" onSelect={logout}>
            <LogOut />
            Sign out
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
