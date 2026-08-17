import { db } from './db'
import { blobSize, formatBytes } from './utils'

export interface StorageBreakdown {
  thumbnails: number
  downloads: number
  wallpapers: number
  other: number
  total: number
  quota?: number
  usage?: number
}

export async function estimateStorage(): Promise<StorageBreakdown> {
  const items = await db.items.toArray()
  let thumbnails = 0
  let downloads = 0
  for (const item of items) {
    thumbnails += await blobSize(item.thumbnailBlob)
    downloads += await blobSize(item.cachedBlob)
  }
  const settings = await db.settings.get('settings')
  const wallpapers = await blobSize(settings?.wallpaperBlob)

  let usage: number | undefined
  let quota: number | undefined
  if (navigator.storage?.estimate) {
    const est = await navigator.storage.estimate()
    usage = est.usage
    quota = est.quota
  }

  const known = thumbnails + downloads + wallpapers
  const other = usage != null ? Math.max(0, usage - known) : 0

  return {
    thumbnails,
    downloads,
    wallpapers,
    other,
    total: usage ?? known,
    quota,
    usage,
  }
}

export function breakdownLabels(b: StorageBreakdown) {
  return [
    `Thumbnails ${formatBytes(b.thumbnails)}`,
    `Downloads ${formatBytes(b.downloads)}`,
    `Wallpaper ${formatBytes(b.wallpapers)}`,
    `Other ${formatBytes(b.other)}`,
    `Total ${formatBytes(b.total)}`,
  ]
}
