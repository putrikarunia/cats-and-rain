"use client"

import Image from "next/image"
import {
  ChevronUpIcon,
  HeartIcon,
  PauseIcon,
  PlayIcon,
  Repeat1Icon,
  RepeatIcon,
  ShuffleIcon,
  SkipBackIcon,
  SkipForwardIcon,
  Volume1Icon,
  Volume2Icon,
  VolumeXIcon,
} from "lucide-react"

import { IconTooltip } from "@/components/icon-tooltip"
import { usePlayer } from "@/components/player/player-provider"
import { TrackProgress } from "@/components/player/track-progress"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Slider } from "@/components/ui/slider"
import { Toggle } from "@/components/ui/toggle"
import { cn } from "@/lib/utils"

const repeatLabels = {
  off: "Repeat",
  all: "Repeat one",
  one: "Turn off repeat",
} as const

export function NowPlayingBar({ className }: { className?: string }) {
  const {
    currentTrack,
    isPlaying,
    liked,
    shuffle,
    repeat,
    volume,
    muted,
    togglePlay,
    next,
    previous,
    toggleShuffle,
    cycleRepeat,
    toggleLike,
    setVolume,
    toggleMute,
  } = usePlayer()

  const isLiked = liked.has(currentTrack.id)
  const effectiveVolume = muted ? 0 : volume
  const VolumeIcon =
    effectiveVolume === 0 ? VolumeXIcon : effectiveVolume < 0.5 ? Volume1Icon : Volume2Icon

  return (
    <section
      aria-label="Now playing"
      className={cn(
        "flex h-18 flex-1 items-center gap-4 rounded-2xl border bg-card px-3 shadow-dock",
        className
      )}
    >
      <Image
        src={currentTrack.artwork}
        alt=""
        width={48}
        height={48}
        className="size-12 shrink-0 rounded-lg object-cover"
      />
      <div className="flex w-55 min-w-0 flex-col gap-0.5">
        <span className="truncate text-label font-semibold">
          {currentTrack.title}
        </span>
        <span className="truncate text-xs text-muted-foreground">
          {currentTrack.artist} · {currentTrack.album}
        </span>
      </div>
      <IconTooltip label={isLiked ? "Remove from liked songs" : "Like"}>
        <Button
          variant="ghost"
          size="icon-lg"
          aria-label="Like"
          aria-pressed={isLiked}
          onClick={() => toggleLike(currentTrack.id)}
          className={cn(
            "rounded-full text-muted-foreground",
            isLiked && "text-foreground [&_svg]:fill-current"
          )}
        >
          <HeartIcon />
        </Button>
      </IconTooltip>

      <div className="flex flex-1 items-center justify-center gap-3">
        <IconTooltip label={shuffle ? "Turn off shuffle" : "Shuffle"}>
          <Toggle
            aria-label="Shuffle"
            pressed={shuffle}
            onPressedChange={toggleShuffle}
            className="rounded-full text-muted-foreground aria-pressed:text-foreground"
          >
            <ShuffleIcon />
          </Toggle>
        </IconTooltip>
        <IconTooltip label="Previous">
          <Button
            variant="ghost"
            size="icon-lg"
            aria-label="Previous"
            onClick={previous}
            className="rounded-full"
          >
            <SkipBackIcon className="size-5" />
          </Button>
        </IconTooltip>
        <IconTooltip label={isPlaying ? "Pause" : "Play"}>
          <Button
            size="icon-2xl"
            aria-label={isPlaying ? "Pause" : "Play"}
            onClick={togglePlay}
            className="rounded-full shadow-raised"
          >
            {isPlaying ? <PauseIcon /> : <PlayIcon />}
          </Button>
        </IconTooltip>
        <IconTooltip label="Next">
          <Button
            variant="ghost"
            size="icon-lg"
            aria-label="Next"
            onClick={next}
            className="rounded-full"
          >
            <SkipForwardIcon className="size-5" />
          </Button>
        </IconTooltip>
        <IconTooltip label={repeatLabels[repeat]}>
          <Toggle
            aria-label="Repeat"
            pressed={repeat !== "off"}
            onPressedChange={cycleRepeat}
            className="rounded-full text-muted-foreground aria-pressed:text-foreground"
          >
            {repeat === "one" ? <Repeat1Icon /> : <RepeatIcon />}
          </Toggle>
        </IconTooltip>
      </div>

      <TrackProgress className="w-75" />

      <div className="flex items-center gap-1.5">
        <IconTooltip label={muted ? "Unmute" : "Mute"}>
          <Button
            variant="ghost"
            size="icon"
            aria-label={muted ? "Unmute" : "Mute"}
            onClick={toggleMute}
            className="rounded-full text-muted-foreground"
          >
            <VolumeIcon className="size-4.5" />
          </Button>
        </IconTooltip>
        <Slider
          aria-label="Volume"
          min={0}
          max={1}
          step={0.01}
          value={[effectiveVolume]}
          onValueChange={(value) =>
            setVolume(Array.isArray(value) ? value[0] : (value as number))
          }
          className="data-horizontal:w-18 **:data-[slot=slider-range]:bg-muted-foreground **:data-[slot=slider-thumb]:opacity-0 hover:**:data-[slot=slider-thumb]:opacity-100 focus-within:**:data-[slot=slider-thumb]:opacity-100"
        />
      </div>

      <Separator
        orientation="vertical"
        className="data-vertical:h-7 data-vertical:self-center"
      />

      <IconTooltip label="Expand player">
        <Button
          variant="outline"
          size="icon-lg"
          aria-label="Expand player"
          className="bg-secondary shadow-none"
        >
          <ChevronUpIcon />
        </Button>
      </IconTooltip>
    </section>
  )
}
