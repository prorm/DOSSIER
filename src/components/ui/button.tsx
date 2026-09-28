import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

/**
 * DOSSIER button. Console voice: mono, uppercase micro-tracking, hairline
 * edges, a 1px physical press. Primary is the only filled variant — one per
 * view, reserved for the action that moves the game forward.
 */
const buttonVariants = cva(
  "pressable relative inline-flex shrink-0 select-none items-center justify-center gap-2 rounded-sm font-mono text-[0.78rem] font-semibold uppercase tracking-[0.08em] whitespace-nowrap outline-none disabled:pointer-events-none disabled:opacity-45 aria-disabled:pointer-events-none aria-disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-signal text-[var(--accent-ink)] shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_0_0_1px_var(--accent)] hover:brightness-110 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_0_0_1px_var(--accent),0_0_24px_-8px_var(--accent)]",
        outline:
          "border border-line-strong bg-surface text-ink hover:border-[color-mix(in_srgb,var(--accent)_60%,transparent)] hover:bg-raised hover:text-ink",
        secondary: "border border-line bg-raised text-ink hover:border-line-strong hover:bg-overlay",
        ghost: "text-mute hover:bg-raised hover:text-ink",
        destructive:
          "border border-[color-mix(in_srgb,var(--color-signal-magenta)_55%,transparent)] bg-[color-mix(in_srgb,var(--color-signal-magenta)_10%,transparent)] text-signal-magenta hover:bg-signal-magenta hover:text-bg focus-visible:outline-signal-magenta",
        signal:
          "border border-[color-mix(in_srgb,var(--accent-2)_55%,transparent)] bg-[color-mix(in_srgb,var(--accent-2)_8%,transparent)] text-signal-2 hover:bg-[color-mix(in_srgb,var(--accent-2)_16%,transparent)]",
        link: "h-auto px-0 normal-case tracking-normal text-signal-2 underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 has-[>svg]:px-3.5",
        xs: "h-7 gap-1 px-2 text-[0.68rem] [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 px-3 text-[0.72rem]",
        lg: "h-12 px-6 text-[0.82rem]",
        icon: "size-10",
        "icon-xs": "size-7 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
