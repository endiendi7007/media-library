import type { MediaType } from './types'

export function detectType(url: string): MediaType {
  const clean = url.split('?')[0].toLowerCase()
  if (clean.endsWith('.m3u8') || clean.includes('.m3u8')) return 'video'
  if (/\.(mp4|webm|mkv|mov)$/i.test(clean)) return 'video'
  if (/\.(mp3|wav|m4a|aac|ogg)$/i.test(clean)) return 'audio'
  if (/\.pdf$/i.test(clean)) return 'pdf'
  if (/\.(png|jpe?g|gif|webp|avif|svg)$/i.test(clean)) return 'image'
  return 'link'
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const s = Math.floor(seconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  }
  return `${m}:${String(sec).padStart(2, '0')}`
}

export function formatDurationShort(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0m'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

export function todayKey(d = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function titleFromUrl(url: string): string {
  try {
    const u = new URL(url)
    const parts = u.pathname.split('/').filter(Boolean)
    const last = parts[parts.length - 1] || u.hostname
    return decodeURIComponent(last).replace(/\.(m3u8|mp4|pdf)$/i, '') || 'Untitled'
  } catch {
    return 'Untitled'
  }
}

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let v = n
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v < 10 && i > 0 ? v.toFixed(1) : Math.round(v)} ${units[i]}`
}

export async function blobSize(blob?: Blob | null): Promise<number> {
  return blob?.size ?? 0
}

export function sanitizeFilename(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, '_').trim() || 'download'
}

export function extensionForType(type: MediaType, mime?: string): string {
  if (type === 'pdf') return 'pdf'
  if (type === 'image') return 'jpg'
  if (mime?.includes('mp4')) return 'mp4'
  if (mime?.includes('webm')) return 'webm'
  if (mime?.includes('mp2t') || mime === 'video/mp2t') return 'ts'
  if (type === 'audio') return 'mp3'
  return 'mp4'
}
