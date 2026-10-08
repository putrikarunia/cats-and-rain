"use client"

import * as React from "react"

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

/** Wraps an icon-only control so its label is visible on hover and focus. */
export function IconTooltip({
  label,
  side = "top",
  children,
}: {
  label: React.ReactNode
  side?: React.ComponentProps<typeof TooltipContent>["side"]
  children: React.ReactElement
}) {
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent side={side}>{label}</TooltipContent>
    </Tooltip>
  )
}
