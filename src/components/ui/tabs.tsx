"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Tabs as TabsPrimitive } from "radix-ui"

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      orientation={orientation}
      className={cn("group/tabs flex gap-3 data-[orientation=horizontal]:flex-col", className)}
      {...props}
    />
  )
}

/**
 * Console tabs. `line` (default) is a hairline rail with an accent underline
 * on the active item; `segment` is a recessed segmented control. The list
 * scrolls horizontally on narrow screens instead of wrapping or squashing.
 */
const tabsListVariants = cva(
  "group/tabs-list flex w-full max-w-full items-stretch overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden text-mute",
  {
    variants: {
      variant: {
        line: "gap-0 border-b border-line",
        segment: "w-fit gap-0.5 rounded-sm border border-line bg-bg p-0.5",
        default: "gap-0 border-b border-line",
      },
    },
    defaultVariants: { variant: "line" },
  }
)

function TabsList({
  className,
  variant = "line",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> & VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  )
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "relative inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 px-3.5 font-mono text-[0.72rem] font-medium uppercase tracking-[0.1em] whitespace-nowrap text-mute transition-colors outline-none hover:text-ink focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--accent)] disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
        "data-[state=active]:text-ink",
        "group-data-[variant=line]/tabs-list:after:absolute group-data-[variant=line]/tabs-list:after:inset-x-2 group-data-[variant=line]/tabs-list:after:-bottom-px group-data-[variant=line]/tabs-list:after:h-0.5 group-data-[variant=line]/tabs-list:after:bg-[var(--accent)] group-data-[variant=line]/tabs-list:after:opacity-0 group-data-[variant=line]/tabs-list:after:transition-opacity group-data-[variant=line]/tabs-list:data-[state=active]:after:opacity-100",
        "group-data-[variant=default]/tabs-list:after:absolute group-data-[variant=default]/tabs-list:after:inset-x-2 group-data-[variant=default]/tabs-list:after:-bottom-px group-data-[variant=default]/tabs-list:after:h-0.5 group-data-[variant=default]/tabs-list:after:bg-[var(--accent)] group-data-[variant=default]/tabs-list:after:opacity-0 group-data-[variant=default]/tabs-list:data-[state=active]:after:opacity-100",
        "group-data-[variant=segment]/tabs-list:min-h-8 group-data-[variant=segment]/tabs-list:rounded-xs group-data-[variant=segment]/tabs-list:px-3 group-data-[variant=segment]/tabs-list:data-[state=active]:bg-raised group-data-[variant=segment]/tabs-list:data-[state=active]:shadow-[inset_0_0_0_1px_var(--color-line-strong)]",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1 outline-none data-[state=active]:animate-reveal-up", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants }
