import { NowPlayingBar } from "@/components/player/now-playing-bar"

/** Floats the player over the bottom of the content with a fade-out scrim. */
export function PlayerDock() {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 flex h-35 items-end bg-linear-to-b from-background/0 via-background/90 to-background pr-8 pb-5 pl-4">
      <NowPlayingBar className="pointer-events-auto" />
    </div>
  )
}
