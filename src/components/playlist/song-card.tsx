"use client"

import Image from "next/image"
import { AudioLinesIcon, PauseIcon, PlayIcon } from "lucide-react"

import type { Track } from "@/lib/playlist"
import { formatTime } from "@/lib/format"
import { cn } from "@/lib/utils"

export function SongCard({
  track,
  isCurrent,
  isPlaying,
  onSelect,
}: {
  track: Track
  isCurrent: boolean
  isPlaying: boolean
  onSelect: () => void
}) {
  const active = isCurrent && isPlaying

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={`${active ? "Pause" : "Play"} ${track.title} by ${track.artist}`}
      aria-current={isCurrent ? "true" : undefined}
      className="group/song flex flex-col gap-2 rounded-2xl text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <span
        className={cn(
          "relative block aspect-square w-full overflow-hidden rounded-2xl bg-muted transition-shadow",
          isCurrent && "shadow-art"
        )}
      >
        <Image
          src={track.artwork}
          alt=""
          fill
          sizes="(min-width: 1280px) 20vw, (min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
          className="object-cover transition-transform duration-500 group-hover/song:scale-103"
        />
        <span
          className={cn(
            "absolute right-2.5 bottom-2.5 flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-raised transition-all",
            isCurrent
              ? "opacity-100"
              : "translate-y-1 opacity-0 group-hover/song:translate-y-0 group-hover/song:opacity-100 group-focus-visible/song:translate-y-0 group-focus-visible/song:opacity-100"
          )}
        >
          {active ? (
            <>
              <AudioLinesIcon className="size-4 animate-pulse group-hover/song:hidden" />
              <PauseIcon className="hidden size-4 group-hover/song:block" />
            </>
          ) : (
            <PlayIcon className="size-4" />
          )}
        </span>
      </span>
      <span className={cn("truncate text-label", isCurrent ? "font-semibold" : "font-medium")}>
        {track.title}
      </span>
      <span className="truncate text-xs text-muted-foreground">
        {track.artist} · {formatTime(track.duration)}
      </span>
    </button>
  )
}
