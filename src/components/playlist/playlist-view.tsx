"use client"

import * as React from "react"
import {
  EllipsisIcon,
  LinkIcon,
  PlayIcon,
  SearchIcon,
  ShuffleIcon,
} from "lucide-react"

import { usePlayer } from "@/components/player/player-provider"
import { SongsSection } from "@/components/playlist/songs-section"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import { Kbd } from "@/components/ui/kbd"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

const views = [
  { value: "playlist", label: "Playlist" },
  { value: "songs", label: "Songs" },
  { value: "about", label: "About" },
] as const

type View = (typeof views)[number]["value"]

export function PlaylistView({ hero }: { hero: React.ReactNode }) {
  const { playPlaylist, playTrack } = usePlayer()
  const [view, setView] = React.useState<View>("playlist")
  const [query, setQuery] = React.useState("")
  const searchRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        searchRef.current?.focus()
        searchRef.current?.select()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  return (
    <Tabs
      value={view}
      onValueChange={(value) => setView(value as View)}
      className="gap-6"
    >
      <div className="flex shrink-0 items-center justify-between gap-4">
        <TabsList className="gap-0.5 group-data-horizontal/tabs:h-9">
          {views.map(({ value, label }) => (
            <TabsTrigger
              key={value}
              value={value}
              className="px-3.5 text-label data-active:bg-card data-active:font-semibold"
            >
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="flex items-center gap-2">
          <InputGroup className="h-9 w-65 bg-card">
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              ref={searchRef}
              type="search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                setView("playlist")
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setQuery("")
                  event.currentTarget.blur()
                }
              }}
              placeholder="Search songs, artists"
              aria-label="Search songs, artists"
            />
            <InputGroupAddon align="inline-end">
              <Kbd>⌘K</Kbd>
            </InputGroupAddon>
          </InputGroup>

          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="outline" size="icon-lg" aria-label="More options" />
              }
            >
              <EllipsisIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => playTrack(0)}>
                <PlayIcon />
                Play from the top
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => playPlaylist({ shuffle: true })}>
                <ShuffleIcon />
                Shuffle play
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => void navigator.clipboard?.writeText(window.location.href)}
              >
                <LinkIcon />
                Copy link
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <TabsContent value="playlist" className="flex flex-col gap-6">
        {hero}
        <SongsSection query={query} />
      </TabsContent>
      <TabsContent value="songs">
        <ComingSoon title="Songs" />
      </TabsContent>
      <TabsContent value="about">
        <ComingSoon title="About" />
      </TabsContent>
    </Tabs>
  )
}

function ComingSoon({ title }: { title: string }) {
  return (
    <Empty className="border border-dashed">
      <EmptyHeader>
        <EmptyTitle>{title} is on its way</EmptyTitle>
        <EmptyDescription>This view hasn’t been designed yet.</EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}
