export type Track = {
  id: string
  title: string
  artist: string
  album: string
  /** Listed track length in seconds. */
  duration: number
  artwork: string
  src: string
}

export type Playlist = {
  id: string
  title: string
  description: string
  cover: string
  updatedAt: string
  tracks: Track[]
}

const art = (path: string) => `https://i.pinimg.com/736x/${path}.jpg`
// Royalty-free demo audio. Swap for files in /public/audio when you have real masters.
const audio = (n: number) =>
  `https://www.soundhelix.com/examples/mp3/SoundHelix-Song-${n}.mp3`

export const catsAndRain: Playlist = {
  id: "cats-and-rain",
  title: "Cats & Rain",
  description: "Lofi for slow afternoons.",
  cover: art("bf/a7/09/bfa709994564ea8dbfe849328623002f"),
  updatedAt: "2026-10-06",
  tracks: [
    {
      id: "rainy-window",
      title: "Rainy Window",
      artist: "Mochi Beats",
      album: "Windowsill",
      duration: 204,
      artwork: art("16/0b/21/160b21d7c6c33be3430846595f9d2418"),
      src: audio(1),
    },
    {
      id: "paws-on-the-keys",
      title: "Paws on the Keys",
      artist: "Sleepy Tofu",
      album: "Soft Keys",
      duration: 178,
      artwork: art("b0/ff/08/b0ff082b83d3aab8d6632ce9149a5731"),
      src: audio(2),
    },
    {
      id: "blue-hour-purr",
      title: "Blue Hour Purr",
      artist: "Lo Nekō",
      album: "Blue Hour",
      duration: 192,
      artwork: art("f1/89/34/f189345439272e7d9c791a639adb3287"),
      src: audio(3),
    },
    {
      id: "sunday-nap",
      title: "Sunday Nap",
      artist: "Velvet Yawn",
      album: "Slow Sundays",
      duration: 242,
      artwork: art("b3/47/5a/b3475ab7398470689b53ce400f97a1bd"),
      src: audio(4),
    },
    {
      id: "midnight-milk",
      title: "Midnight Milk",
      artist: "Dusty Paws",
      album: "Night Shift",
      duration: 191,
      artwork: art("16/bc/86/16bc8606e17f1f56f4f7e50b3f59987e"),
      src: audio(5),
    },
    {
      id: "warm-radiator",
      title: "Warm Radiator",
      artist: "Hazel Tapes",
      album: "Indoor Weather",
      duration: 167,
      artwork: art("21/32/a5/2132a5592555aa0339cd2c38d3dc054d"),
      src: audio(6),
    },
    {
      id: "kitchen-lamp",
      title: "Kitchen Lamp",
      artist: "Mochi Beats",
      album: "Windowsill",
      duration: 216,
      artwork: art("73/4c/a3/734ca33f4cbcdf1a0fa8a93e84de52eb"),
      src: audio(7),
    },
    {
      id: "tin-roof",
      title: "Tin Roof",
      artist: "Sleepy Tofu",
      album: "Soft Keys",
      duration: 185,
      artwork: art("10/92/f6/1092f653ca7a52d838dfedb4e0fc4618"),
      src: audio(8),
    },
    {
      id: "yarn-and-static",
      title: "Yarn & Static",
      artist: "Lo Nekō",
      album: "Blue Hour",
      duration: 172,
      artwork: art("0f/a4/9a/0fa49a25a871292dffdb98d6f5ece776"),
      src: audio(9),
    },
    {
      id: "last-train-home",
      title: "Last Train Home",
      artist: "Velvet Yawn",
      album: "Slow Sundays",
      duration: 258,
      artwork: art("bf/a7/09/bfa709994564ea8dbfe849328623002f"),
      src: audio(10),
    },
  ],
}
