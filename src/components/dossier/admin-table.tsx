import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Admin data table. On narrow screens the table keeps its columns and scrolls
 * horizontally inside its panel (the page itself never scrolls sideways); the
 * first column stays pinned so rows remain identifiable while scrolling.
 */
export function DataTable({ head, children, className, minWidth = 640, caption }: { head: ReactNode[]; children: ReactNode; className?: string; minWidth?: number; caption?: string }) {
  return (
    <div className={cn("panel overflow-x-auto", className)}>
      <table className="w-full border-collapse text-sm" style={{ minWidth }}>
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead>
          <tr className="border-b border-line">
            {head.map((h, i) => (
              <th
                key={i}
                scope="col"
                className={cn(
                  "h-9 px-3 text-left font-mono text-[0.62rem] font-medium uppercase tracking-[0.12em] whitespace-nowrap text-faint",
                  i === 0 && "sticky left-0 z-10 bg-surface",
                )}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line [&_td:first-child]:sticky [&_td:first-child]:left-0 [&_td:first-child]:bg-surface [&_td]:px-3 [&_td]:py-2.5 [&_td]:align-middle">
          {children}
        </tbody>
      </table>
    </div>
  );
}
