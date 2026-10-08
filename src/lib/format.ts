export function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00"
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, "0")}`
}

export function formatTotalDuration(seconds: number) {
  const minutes = Math.ceil(seconds / 60)
  if (minutes < 60) return `${minutes} min`
  return `${Math.floor(minutes / 60)} hr ${minutes % 60} min`
}

export function formatRelativeDate(iso: string, now = new Date()) {
  const days = Math.round(
    (now.getTime() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24)
  )
  if (days <= 0) return "today"
  if (days === 1) return "yesterday"
  return `${days} days ago`
}
