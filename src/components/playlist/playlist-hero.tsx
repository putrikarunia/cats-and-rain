import Image from "next/image"
import { Fragment } from "react"

import { Eyebrow } from "@/components/playlist/eyebrow"
import { PlaylistActions } from "@/components/playlist/playlist-actions"

export function PlaylistHero({
  title,
  cover,
  meta,
}: {
  title: string
  cover: string
  meta: string[]
}) {
  return (
    <header className="flex shrink-0 items-end gap-7">
      <Image
        src={cover}
        alt={`${title} cover`}
        width={184}
        height={184}
        priority
        className="size-46 shrink-0 rounded-3xl object-cover shadow-cover"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-2 pb-1">
        <Eyebrow>Playlist</Eyebrow>
        <h1 className="text-display font-semibold">{title}</h1>
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {meta.map((item, i) => (
            <Fragment key={item}>
              {i > 0 && (
                <span aria-hidden className="size-0.75 rounded-full bg-muted-foreground/50" />
              )}
              <span>{item}</span>
            </Fragment>
          ))}
        </p>
        <PlaylistActions className="pt-2" />
      </div>
    </header>
  )
}
