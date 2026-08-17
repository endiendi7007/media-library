import Hls from 'hls.js'
import { extensionForType, sanitizeFilename } from './utils'
import type { LibraryItem } from './types'

export interface QualityOption {
  /** hls.js level index, or -1 for "single quality / original file" */
  index: number
  label: string
  height?: number
  bandwidth?: number
}

export interface DownloadProgress {
  loaded: number
  total: number
  /** For multi-segment (HLS) downloads: segments done / total segments */
  segment?: { done: number; total: number }
}

/**
 * Probes an HLS (.m3u8) URL for available quality levels using hls.js's own
 * manifest parser (no network re-implementation needed). Resolves with an
 * empty array for non-HLS URLs or single-rendition streams (nothing to choose).
 */
export function probeHlsQualities(url: string): Promise<QualityOption[]> {
  return new Promise((resolve) => {
    if (!url.includes('.m3u8') || !Hls.isSupported()) {
      resolve([])
      return
    }
    const hls = new Hls()
    const finish = (opts: QualityOption[]) => {
      hls.destroy()
      resolve(opts)
    }
    const timeout = window.setTimeout(() => finish([]), 15000)
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      window.clearTimeout(timeout)
      const levels = hls.levels
        .map((l, index) => ({
          index,
          height: l.height || undefined,
          bandwidth: l.bitrate || undefined,
        }))
        .sort((a, b) => (b.height || 0) - (a.height || 0) || (b.bandwidth || 0) - (a.bandwidth || 0))
      if (levels.length <= 1) {
        finish([])
        return
      }
      finish(
        levels.map((l) => ({
          index: l.index,
          height: l.height,
          bandwidth: l.bandwidth,
          label: l.height ? `${l.height}p` : l.bandwidth ? `${Math.round(l.bandwidth / 1000)} kbps` : `Track ${l.index + 1}`,
        })),
      )
    })
    hls.on(Hls.Events.ERROR, (_e, data) => {
      if (data.fatal) finish([])
    })
    hls.loadSource(url)
  })
}

/** Resolves a possibly-relative URI against a base playlist URL. */
function resolveUri(base: string, uri: string): string {
  return new URL(uri, base).toString()
}

/** Minimal M3U8 parser: pulls segment URIs (and any EXT-X-MAP init segment) from a media playlist. */
async function fetchSegmentUrls(playlistUrl: string): Promise<string[]> {
  const res = await fetch(playlistUrl)
  if (!res.ok) throw new Error(`Playlist fetch failed (${res.status})`)
  const text = await res.text()
  const urls: string[] = []
  const mapMatch = text.match(/#EXT-X-MAP:.*URI="([^"]+)"/)
  if (mapMatch) urls.push(resolveUri(playlistUrl, mapMatch[1]))
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    urls.push(resolveUri(playlistUrl, trimmed))
  }
  return urls
}

/** For a chosen HLS quality, finds the actual media-playlist URL (variant playlists reference their own .m3u8). */
function getVariantPlaylistUrl(masterUrl: string, index: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const hls = new Hls()
    const timeout = window.setTimeout(() => {
      hls.destroy()
      reject(new Error('Timed out reading playlist'))
    }, 15000)
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      window.clearTimeout(timeout)
      const level = hls.levels[index]
      hls.destroy()
      if (!level) {
        reject(new Error('Quality not found'))
        return
      }
      resolve(level.uri || masterUrl)
    })
    hls.on(Hls.Events.ERROR, (_e, data) => {
      if (data.fatal) {
        window.clearTimeout(timeout)
        hls.destroy()
        reject(new Error('Failed to read manifest'))
      }
    })
    hls.loadSource(masterUrl)
  })
}

export interface DownloadResult {
  blob: Blob
  /** true if this is raw MPEG-TS/fMP4 segments concatenated (HLS), which may not open outside this app */
  isSegmented: boolean
}

/**
 * Downloads a library item's media. For HLS sources with a chosen quality,
 * fetches every segment of that rendition and concatenates them. For plain
 * files (mp4/pdf/etc.) it's a single fetch.
 */
export async function downloadItemMedia(
  item: LibraryItem,
  qualityIndex: number | null,
  onProgress?: (p: DownloadProgress) => void,
): Promise<DownloadResult> {
  const isHls = item.url.includes('.m3u8')

  if (isHls && qualityIndex != null && qualityIndex >= 0) {
    const variantUrl = await getVariantPlaylistUrl(item.url, qualityIndex)
    const segmentUrls = await fetchSegmentUrls(variantUrl)
    const parts: ArrayBuffer[] = []
    let loaded = 0
    for (let i = 0; i < segmentUrls.length; i++) {
      const res = await fetch(segmentUrls[i])
      if (!res.ok) throw new Error(`Segment ${i + 1} failed (${res.status})`)
      const buf = await res.arrayBuffer()
      parts.push(buf)
      loaded += buf.byteLength
      onProgress?.({ loaded, total: 0, segment: { done: i + 1, total: segmentUrls.length } })
    }
    const blob = new Blob(parts, { type: 'video/mp2t' })
    return { blob, isSegmented: true }
  }

  const res = await fetch(item.url)
  if (!res.ok) throw new Error(`Download failed (${res.status})`)
  const total = Number(res.headers.get('content-length') || 0)
  if (!res.body || !onProgress) {
    const blob = await res.blob()
    return { blob, isSegmented: false }
  }
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let loaded = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    loaded += value.byteLength
    onProgress({ loaded, total })
  }
  const blob = new Blob(chunks as BlobPart[], { type: res.headers.get('content-type') || undefined })
  return { blob, isSegmented: false }
}

/**
 * Attempts to hand the file to the OS share sheet (which on iOS/Android
 * typically offers "Save Video"/"Save to Photos" for media files). Falls
 * back to a normal browser download if the Web Share API with files isn't
 * available — the file still lands on-device, just in Downloads instead.
 */
export async function saveToDevice(blob: Blob, item: LibraryItem): Promise<'shared' | 'downloaded'> {
  const ext = extensionForType(item.type, blob.type)
  const filename = `${sanitizeFilename(item.title)}.${ext}`
  const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' })

  if (navigator.canShare?.({ files: [file] }) && navigator.share) {
    try {
      await navigator.share({ files: [file], title: item.title })
      return 'shared'
    } catch {
      // user cancelled or share failed — fall through to direct download
    }
  }

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 30000)
  return 'downloaded'
}
