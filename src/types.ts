export type MediaType = 'video' | 'pdf' | 'image' | 'audio' | 'link'

export type ThemeMode = 'dark' | 'light'

export type QualityPref = 'lowest' | 'remember' | number

export interface Folder {
  id: string
  name: string
  createdAt: number
  order: number
}

export interface LibraryItem {
  id: string
  folderId: string
  url: string
  title: string
  type: MediaType
  duration?: number
  thumbnailBlob?: Blob
  cachedBlob?: Blob
  cacheSize?: number
  createdAt: number
  order: number
}

export interface Progress {
  itemId: string
  position: number
  duration: number
  completed: boolean
  remindDismissed: boolean
  updatedAt: number
  /** PDF page number when type is pdf */
  page?: number
}

export interface AppSettings {
  id: 'settings'
  theme: ThemeMode
  wallpaperId: string
  wallpaperBlob?: Blob
  defaultQuality: 'lowest' | 'remember'
  lastQualityHeight?: number
  lastSpeed: number
  lastFolderId?: string
  /** 0 = solid bar, 100 = fully transparent */
  topbarTransparency: number
  pauseTintEnabled: boolean
  /** CSS color for pause edge tint */
  pauseTintColor: string
  pauseIconEnabled: boolean
  /** CSS color for the video progress/seek bar */
  progressBarColor: string
}

export const PAUSE_TINT_PRESETS = [
  { id: 'grey', label: 'Grey', color: '#6b7280' },
  { id: 'slate', label: 'Slate', color: '#94a3b8' },
  { id: 'blue', label: 'Blue', color: '#3b82f6' },
  { id: 'black', label: 'Black', color: '#111827' },
  { id: 'amber', label: 'Amber', color: '#d97706' },
] as const

export const PROGRESS_BAR_PRESETS = [
  { id: 'blue', label: 'Blue', color: '#3b82f6' },
  { id: 'red', label: 'Red', color: '#ef4444' },
  { id: 'green', label: 'Green', color: '#22c55e' },
  { id: 'amber', label: 'Amber', color: '#d97706' },
  { id: 'purple', label: 'Purple', color: '#a855f7' },
  { id: 'white', label: 'White', color: '#f4f4f5' },
] as const

export interface DailyStat {
  dateKey: string
  videoSeconds: number
  pdfSeconds: number
}

export const WALLPAPER_PRESETS = [
  {
    id: 'slate',
    label: 'Slate',
    css: 'linear-gradient(145deg, #0e1116 0%, #1a2332 50%, #152238 100%)',
    cssLight: 'linear-gradient(145deg, #ffffff 0%, #eef1f6 50%, #e3e8f2 100%)',
  },
  {
    id: 'ocean',
    label: 'Ocean',
    css: 'linear-gradient(145deg, #0c1929 0%, #12344d 55%, #0f2740 100%)',
    cssLight: 'linear-gradient(145deg, #ffffff 0%, #e6f3fb 55%, #d7ecf8 100%)',
  },
  {
    id: 'mist',
    label: 'Mist',
    css: 'linear-gradient(145deg, #1c1f26 0%, #2a3140 100%)',
    cssLight: 'linear-gradient(145deg, #ffffff 0%, #eef0f4 100%)',
  },
  {
    id: 'dusk',
    label: 'Dusk',
    css: 'linear-gradient(160deg, #12151c 0%, #1e2838 40%, #243047 100%)',
    cssLight: 'linear-gradient(160deg, #ffffff 0%, #f1eefa 40%, #e8e3f6 100%)',
  },
] as const
