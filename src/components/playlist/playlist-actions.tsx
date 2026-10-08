"use client"

import * as React from "react"
import {
  CheckIcon,
  DownloadIcon,
  HeartIcon,
  PauseIcon,
  PlayIcon,
  ShuffleIcon,
} from "lucide-react"

import { IconTooltip } from "@/components/icon-tooltip"
import { usePlayer } from "@/components/player/player-provider"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function PlaylistActions({ className }: { className?: string }) {
  const { isPlaying, playPlaylist } = usePlayer()
  const [saved, setSaved] = React.useState(false)
  const [downloaded, setDownloaded] = React.useState(false)

  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <Button
        size="xl"
        onClick={() => playPlaylist()}
        className="rounded-full font-semibold shadow-raised"
      >
        {isPlaying ? <PauseIcon data-icon="inline-start" /> : <PlayIcon data-icon="inline-start" />}
        {isPlaying ? "Pause" : "Play"}
      </Button>
      <IconTooltip label="Shuffle play">
        <Button
          variant="outline"
          size="icon-xl"
          aria-label="Shuffle play"
          onClick={() => playPlaylist({ shuffle: true })}
          className="rounded-full"
        >
          <ShuffleIcon />
        </Button>
      </IconTooltip>
      <IconTooltip label={saved ? "Remove from library" : "Save to library"}>
        <Button
          variant="outline"
          size="icon-xl"
          aria-label="Save to library"
          aria-pressed={saved}
          onClick={() => setSaved((s) => !s)}
          className={cn("rounded-full", saved && "[&_svg]:fill-current")}
        >
          <HeartIcon />
        </Button>
      </IconTooltip>
      <IconTooltip label={downloaded ? "Downloaded" : "Download"}>
        <Button
          variant="outline"
          size="icon-xl"
          aria-label="Download"
          aria-pressed={downloaded}
          onClick={() => setDownloaded((d) => !d)}
          className="rounded-full"
        >
          {downloaded ? <CheckIcon /> : <DownloadIcon />}
        </Button>
      </IconTooltip>
    </div>
  )
}
