import { cacheLife } from "next/cache"

import { PlayerDock } from "@/components/player/player-dock"
import { PlayerProvider } from "@/components/player/player-provider"
import { PlaylistHero } from "@/components/playlist/playlist-hero"
import { PlaylistView } from "@/components/playlist/playlist-view"
import { NavRail } from "@/components/shell/nav-rail"
import { formatRelativeDate, formatTotalDuration } from "@/lib/format"
import { catsAndRain as playlist } from "@/lib/playlist"

async function getPlaylistMeta() {
  "use cache"
  // Keeps "Updated N days ago" fresh without rendering on every request.
  cacheLife("hours")
  const totalSeconds = playlist.tracks.reduce((sum, t) => sum + t.duration, 0)
  return [
    playlist.description,
    `${playlist.tracks.length} songs, ${formatTotalDuration(totalSeconds)}`,
    `Updated ${formatRelativeDate(playlist.updatedAt)}`,
  ]
}

export default async function PlaylistPage() {
  const meta = await getPlaylistMeta()

  return (
    <PlayerProvider tracks={playlist.tracks} initialIndex={2}>
      <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
        <div className="flex min-h-0 flex-1 pt-5">
          <NavRail />
          <main className="relative min-w-0 flex-1 overflow-hidden">
            <div className="h-full overflow-y-auto pt-1 pr-8 pb-36 pl-4">
              <PlaylistView
                hero={
                  <PlaylistHero
                    title={playlist.title}
                    cover={playlist.cover}
                    meta={meta}
                  />
                }
              />
            </div>
            <PlayerDock />
          </main>
        </div>
      </div>
    </PlayerProvider>
  )
}
