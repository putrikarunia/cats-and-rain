"use client"

import { AudioLinesIcon, SearchXIcon } from "lucide-react"

import { usePlayer } from "@/components/player/player-provider"
import { Eyebrow } from "@/components/playlist/eyebrow"
import { SongCard } from "@/components/playlist/song-card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"

export function SongsSection({ query }: { query: string }) {
  const { tracks, currentIndex, isPlaying, playTrack } = usePlayer()

  const needle = query.trim().toLowerCase()
  const results = tracks
    .map((track, index) => ({ track, index }))
    .filter(({ track }) =>
      [track.title, track.artist, track.album].some((field) =>
        field.toLowerCase().includes(needle)
      )
    )

  return (
    <section aria-labelledby="songs-heading" className="flex flex-col gap-3.5">
      <div className="flex items-center justify-between">
        <Eyebrow id="songs-heading">
          {needle ? `${results.length} of ${tracks.length} songs` : "Songs"}
        </Eyebrow>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <AudioLinesIcon className="size-3.5" />
          {isPlaying ? "Playing" : "Paused"} {currentIndex + 1} of {tracks.length}
        </p>
      </div>

      {results.length > 0 ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {results.map(({ track, index }) => (
            <SongCard
              key={track.id}
              track={track}
              isCurrent={index === currentIndex}
              isPlaying={isPlaying}
              onSelect={() => playTrack(index)}
            />
          ))}
        </div>
      ) : (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SearchXIcon />
            </EmptyMedia>
            <EmptyTitle>No songs match “{query.trim()}”</EmptyTitle>
            <EmptyDescription>Try a song title, artist or album.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </section>
  )
}
