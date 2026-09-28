import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

/** Status tag. Square-ish, mono, tinted by signal meaning — never by decoration. */
const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1.5 overflow-hidden rounded-xs border px-1.5 py-0.5 font-mono text-[0.66rem] font-medium uppercase leading-none tracking-[0.1em] whitespace-nowrap [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        default: "border-line-strong bg-raised text-ink-dim",
        outline: "border-line-strong text-mute",
        success: "border-[color-mix(in_srgb,var(--color-signal-green)_40%,transparent)] bg-[color-mix(in_srgb,var(--color-signal-green)_9%,transparent)] text-signal-green",
        info: "border-[color-mix(in_srgb,var(--color-signal-cyan)_40%,transparent)] bg-[color-mix(in_srgb,var(--color-signal-cyan)_8%,transparent)] text-signal-cyan",
        danger: "border-[color-mix(in_srgb,var(--color-signal-magenta)_45%,transparent)] bg-[color-mix(in_srgb,var(--color-signal-magenta)_10%,transparent)] text-signal-magenta",
        warning: "border-[color-mix(in_srgb,var(--color-signal-amber)_45%,transparent)] bg-[color-mix(in_srgb,var(--color-signal-amber)_9%,transparent)] text-signal-amber",
        accent: "border-[color-mix(in_srgb,var(--accent)_45%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-signal",
        // shadcn compatibility names
        secondary: "border-line bg-raised text-mute",
        destructive: "border-[color-mix(in_srgb,var(--color-signal-magenta)_45%,transparent)] bg-[color-mix(in_srgb,var(--color-signal-magenta)_10%,transparent)] text-signal-magenta",
        ghost: "border-transparent text-mute",
        link: "border-transparent text-signal-2 underline-offset-4 [a&]:hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
