"use client"

import * as React from "react"

import { usePlayer, usePlayerProgress } from "@/components/player/player-provider"
import { Slider } from "@/components/ui/slider"
import { formatTime } from "@/lib/format"
import { cn } from "@/lib/utils"

function firstValue(value: number | readonly number[]) {
  return Array.isArray(value) ? value[0] : (value as number)
}

export function TrackProgress({ className }: { className?: string }) {
  const { seek } = usePlayer()
  const { currentTime, duration } = usePlayerProgress()
  // Holds the thumb position while dragging so timeupdates don't fight the user.
  const [scrubTime, setScrubTime] = React.useState<number | null>(null)
  const shownTime = scrubTime ?? currentTime

  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <span className="w-7 text-right text-2xs text-muted-foreground tabular-nums">
        {formatTime(shownTime)}
      </span>
      <Slider
        aria-label="Seek"
        min={0}
        max={duration || 1}
        step={0.1}
        value={[Math.min(shownTime, duration || 1)]}
        disabled={!duration}
        onValueChange={(value) => setScrubTime(firstValue(value))}
        onValueCommitted={(value) => {
          seek(firstValue(value))
          setScrubTime(null)
        }}
        className="flex-1 **:data-[slot=slider-thumb]:opacity-0 hover:**:data-[slot=slider-thumb]:opacity-100 focus-within:**:data-[slot=slider-thumb]:opacity-100"
      />
      <span className="w-7 text-2xs text-muted-foreground tabular-nums">
        {formatTime(duration)}
      </span>
    </div>
  )
}
