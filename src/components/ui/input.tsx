import * as React from "react"

import { cn } from "@/lib/utils"

/** Terminal field: recessed well, hairline border, accent caret, 16px text on mobile (no iOS zoom). */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-10 w-full min-w-0 rounded-sm border border-line-strong bg-bg px-3 py-1 font-mono text-base text-ink caret-[var(--accent)] transition-[border-color,box-shadow] duration-150 outline-none placeholder:text-faint md:text-sm",
        "file:inline-flex file:h-7 file:border-0 file:bg-transparent file:font-mono file:text-xs file:text-ink",
        "hover:border-[color-mix(in_srgb,var(--accent)_35%,var(--color-line-strong))]",
        "focus-visible:border-[var(--accent)] focus-visible:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_18%,transparent)] focus-visible:outline-none",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:border-signal-magenta aria-invalid:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-signal-magenta)_15%,transparent)]",
        className
      )}
      {...props}
    />
  )
}

export { Input }
