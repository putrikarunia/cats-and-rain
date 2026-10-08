"use client"

import * as React from "react"

import type { Track } from "@/lib/playlist"

export type RepeatMode = "off" | "all" | "one"

type PlayerContextValue = {
  tracks: Track[]
  currentIndex: number
  currentTrack: Track
  isPlaying: boolean
  volume: number
  muted: boolean
  shuffle: boolean
  repeat: RepeatMode
  liked: ReadonlySet<string>
  playTrack: (index: number) => void
  playPlaylist: (options?: { shuffle?: boolean }) => void
  togglePlay: () => void
  next: () => void
  previous: () => void
  seek: (seconds: number) => void
  setVolume: (volume: number) => void
  toggleMute: () => void
  toggleShuffle: () => void
  cycleRepeat: () => void
  toggleLike: (trackId: string) => void
}

type PlayerProgressValue = {
  currentTime: number
  duration: number
}

const PlayerContext = React.createContext<PlayerContextValue | null>(null)
const PlayerProgressContext = React.createContext<PlayerProgressValue>({
  currentTime: 0,
  duration: 0,
})

/** Current track first, the rest in random order. */
function createShuffleOrder(length: number, first: number) {
  const rest = Array.from({ length }, (_, i) => i).filter((i) => i !== first)
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[rest[i], rest[j]] = [rest[j], rest[i]]
  }
  return [first, ...rest]
}

const RESTART_THRESHOLD_SECONDS = 3

export function PlayerProvider({
  tracks,
  initialIndex = 0,
  children,
}: {
  tracks: Track[]
  initialIndex?: number
  children: React.ReactNode
}) {
  const audioRef = React.useRef<HTMLAudioElement>(null)
  // Set when the next track change should start playback immediately.
  const autoplayRef = React.useRef(false)

  const [currentIndex, setCurrentIndex] = React.useState(initialIndex)
  const [isPlaying, setIsPlaying] = React.useState(false)
  const [currentTime, setCurrentTime] = React.useState(0)
  const [duration, setDuration] = React.useState(0)
  const [volume, setVolumeState] = React.useState(0.65)
  const [muted, setMuted] = React.useState(false)
  const [shuffle, setShuffle] = React.useState(false)
  const [order, setOrder] = React.useState(() => tracks.map((_, i) => i))
  const [repeat, setRepeat] = React.useState<RepeatMode>("off")
  const [liked, setLiked] = React.useState<ReadonlySet<string>>(new Set())

  const currentTrack = tracks[currentIndex]

  const currentIndexRef = React.useRef(currentIndex)
  React.useEffect(() => {
    currentIndexRef.current = currentIndex
  }, [currentIndex])

  const goTo = React.useCallback((index: number, autoplay: boolean) => {
    const audio = audioRef.current
    setCurrentTime(0)
    if (index === currentIndexRef.current) {
      if (!audio) return
      audio.currentTime = 0
      if (autoplay) void audio.play().catch(() => setIsPlaying(false))
      return
    }
    autoplayRef.current = autoplay
    setCurrentIndex(index)
  }, [])

  React.useEffect(() => {
    const audio = audioRef.current
    if (!audio || !autoplayRef.current) return
    autoplayRef.current = false
    void audio.play().catch(() => setIsPlaying(false))
  }, [currentIndex])

  React.useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.volume = volume
    audio.muted = muted
  }, [volume, muted])

  const togglePlay = React.useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) void audio.play().catch(() => setIsPlaying(false))
    else audio.pause()
  }, [])

  const playTrack = React.useCallback(
    (index: number) => {
      if (index === currentIndex) {
        togglePlay()
        return
      }
      if (shuffle) setOrder(createShuffleOrder(tracks.length, index))
      goTo(index, true)
    },
    [currentIndex, goTo, shuffle, togglePlay, tracks.length]
  )

  const playPlaylist = React.useCallback(
    (options?: { shuffle?: boolean }) => {
      if (options?.shuffle) {
        const start = Math.floor(Math.random() * tracks.length)
        setShuffle(true)
        setOrder(createShuffleOrder(tracks.length, start))
        goTo(start, true)
        return
      }
      togglePlay()
    },
    [goTo, togglePlay, tracks.length]
  )

  const advance = React.useCallback(
    (reason: "user" | "ended") => {
      const audio = audioRef.current
      if (reason === "ended" && repeat === "one" && audio) {
        audio.currentTime = 0
        void audio.play()
        return
      }
      const position = order.indexOf(currentIndex)
      const isLast = position === order.length - 1
      if (isLast && reason === "ended" && repeat === "off") {
        // End of the queue: rewind to the top and stop.
        goTo(order[0], false)
        return
      }
      goTo(order[isLast ? 0 : position + 1], reason === "ended" || isPlaying)
    },
    [currentIndex, goTo, isPlaying, order, repeat]
  )

  const next = React.useCallback(() => advance("user"), [advance])

  const previous = React.useCallback(() => {
    const audio = audioRef.current
    if (audio && audio.currentTime > RESTART_THRESHOLD_SECONDS) {
      audio.currentTime = 0
      setCurrentTime(0)
      return
    }
    const position = order.indexOf(currentIndex)
    const target = order[position === 0 ? order.length - 1 : position - 1]
    goTo(target, isPlaying)
  }, [currentIndex, goTo, isPlaying, order])

  const seek = React.useCallback((seconds: number) => {
    const audio = audioRef.current
    if (!audio) return
    audio.currentTime = seconds
    setCurrentTime(seconds)
  }, [])

  const setVolume = React.useCallback((value: number) => {
    setVolumeState(value)
    if (value > 0) setMuted(false)
  }, [])

  const toggleMute = React.useCallback(() => setMuted((m) => !m), [])

  const toggleShuffle = React.useCallback(() => {
    setOrder(
      shuffle
        ? tracks.map((_, i) => i)
        : createShuffleOrder(tracks.length, currentIndex)
    )
    setShuffle(!shuffle)
  }, [currentIndex, shuffle, tracks])

  const cycleRepeat = React.useCallback(() => {
    setRepeat((mode) => (mode === "off" ? "all" : mode === "all" ? "one" : "off"))
  }, [])

  const toggleLike = React.useCallback((trackId: string) => {
    setLiked((prev) => {
      const nextSet = new Set(prev)
      if (nextSet.has(trackId)) nextSet.delete(trackId)
      else nextSet.add(trackId)
      return nextSet
    })
  }, [])

  // OS media keys, lock screen and headphone controls.
  const onMediaAction = React.useEffectEvent(
    (action: "play" | "pause" | "next" | "previous") => {
      if (action === "next") next()
      else if (action === "previous") previous()
      else togglePlay()
    }
  )

  React.useEffect(() => {
    if (!("mediaSession" in navigator)) return
    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentTrack.title,
      artist: currentTrack.artist,
      album: currentTrack.album,
      artwork: [{ src: currentTrack.artwork, sizes: "736x736", type: "image/jpeg" }],
    })
    navigator.mediaSession.setActionHandler("play", () => onMediaAction("play"))
    navigator.mediaSession.setActionHandler("pause", () => onMediaAction("pause"))
    navigator.mediaSession.setActionHandler("nexttrack", () => onMediaAction("next"))
    navigator.mediaSession.setActionHandler("previoustrack", () =>
      onMediaAction("previous")
    )
  }, [currentTrack])

  // Space toggles playback unless the user is typing or focused on a control.
  const onKeyDown = React.useEffectEvent((event: KeyboardEvent) => {
    if (event.code !== "Space" || event.repeat) return
    const target = event.target as HTMLElement | null
    if (
      target?.closest(
        "input, textarea, select, button, [role=slider], [contenteditable=true]"
      )
    )
      return
    event.preventDefault()
    togglePlay()
  })

  React.useEffect(() => {
    const handler = (event: KeyboardEvent) => onKeyDown(event)
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [])

  const value = React.useMemo<PlayerContextValue>(
    () => ({
      tracks,
      currentIndex,
      currentTrack,
      isPlaying,
      volume,
      muted,
      shuffle,
      repeat,
      liked,
      playTrack,
      playPlaylist,
      togglePlay,
      next,
      previous,
      seek,
      setVolume,
      toggleMute,
      toggleShuffle,
      cycleRepeat,
      toggleLike,
    }),
    [
      tracks,
      currentIndex,
      currentTrack,
      isPlaying,
      volume,
      muted,
      shuffle,
      repeat,
      liked,
      playTrack,
      playPlaylist,
      togglePlay,
      next,
      previous,
      seek,
      setVolume,
      toggleMute,
      toggleShuffle,
      cycleRepeat,
      toggleLike,
    ]
  )

  const progress = React.useMemo(
    () => ({ currentTime, duration }),
    [currentTime, duration]
  )

  return (
    <PlayerContext.Provider value={value}>
      <PlayerProgressContext.Provider value={progress}>
        {children}
        <audio
          ref={audioRef}
          src={currentTrack.src}
          preload="metadata"
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
          onDurationChange={(e) => setDuration(e.currentTarget.duration)}
          onEnded={() => advance("ended")}
        />
      </PlayerProgressContext.Provider>
    </PlayerContext.Provider>
  )
}

export function usePlayer() {
  const context = React.useContext(PlayerContext)
  if (!context) throw new Error("usePlayer must be used within PlayerProvider")
  return context
}

export function usePlayerProgress() {
  return React.useContext(PlayerProgressContext)
}
