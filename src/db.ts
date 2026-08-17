import Dexie, { type Table } from 'dexie'
import type { AppSettings, DailyStat, Folder, LibraryItem, Progress } from './types'

export class MediaLibraryDB extends Dexie {
  folders!: Table<Folder, string>
  items!: Table<LibraryItem, string>
  progress!: Table<Progress, string>
  settings!: Table<AppSettings, string>
  dailyStats!: Table<DailyStat, string>

  constructor() {
    super('media-library')
    this.version(1).stores({
      folders: 'id, order, createdAt',
      items: 'id, folderId, type, order, createdAt',
      progress: 'itemId, updatedAt, completed',
      settings: 'id',
      dailyStats: 'dateKey',
    })
  }
}

export const db = new MediaLibraryDB()

const DEFAULT_SETTINGS: AppSettings = {
  id: 'settings',
  theme: 'dark',
  wallpaperId: 'slate',
  defaultQuality: 'lowest',
  lastSpeed: 1,
  topbarTransparency: 18,
  pauseTintEnabled: true,
  pauseTintColor: '#6b7280',
  pauseIconEnabled: false,
  progressBarColor: '#3b82f6',
}

export async function ensureDefaults() {
  const existing = await db.settings.get('settings')
  if (!existing) {
    await db.settings.put({ ...DEFAULT_SETTINGS })
  } else {
    const patch: Partial<AppSettings> = {}
    if (existing.topbarTransparency == null) patch.topbarTransparency = 18
    if (existing.pauseTintEnabled == null) patch.pauseTintEnabled = true
    if (!existing.pauseTintColor) patch.pauseTintColor = '#6b7280'
    if (existing.pauseIconEnabled == null) patch.pauseIconEnabled = false
    if (!existing.progressBarColor) patch.progressBarColor = '#3b82f6'
    if (Object.keys(patch).length) await db.settings.update('settings', patch)
  }

  const folderCount = await db.folders.count()
  if (folderCount === 0) {
    const id = crypto.randomUUID()
    await db.folders.add({
      id,
      name: 'Lectures',
      createdAt: Date.now(),
      order: 0,
    })
  }
}
