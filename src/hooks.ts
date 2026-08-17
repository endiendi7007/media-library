import { liveQuery } from 'dexie'
import { useEffect, useState } from 'react'
import { db, ensureDefaults } from './db'
import type { AppSettings, DailyStat, Folder, LibraryItem, Progress } from './types'
import { todayKey } from './utils'

export function useReady() {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    ensureDefaults().then(() => setReady(true))
  }, [])
  return ready
}

function useLiveQuery<T>(factory: () => Promise<T> | T, deps: unknown[], initial: T): T {
  const [value, setValue] = useState<T>(initial)
  useEffect(() => {
    const obs = liveQuery(factory)
    const sub = obs.subscribe({
      next: (v) => setValue(v),
      error: (e) => console.error(e),
    })
    return () => sub.unsubscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return value
}

export function useSettings() {
  return useLiveQuery(
    async () => (await db.settings.get('settings'))!,
    [],
    {
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
    } satisfies AppSettings,
  )
}

export function useFolders() {
  return useLiveQuery(() => db.folders.orderBy('order').toArray(), [], [] as Folder[])
}

export function useItems(folderId: string | null) {
  return useLiveQuery(
    () => (folderId ? db.items.where('folderId').equals(folderId).sortBy('order') : Promise.resolve([])),
    [folderId],
    [] as LibraryItem[],
  )
}

export function useAllItems() {
  return useLiveQuery(() => db.items.toArray(), [], [] as LibraryItem[])
}

export function useProgressMap() {
  const rows = useLiveQuery(() => db.progress.toArray(), [], [] as Progress[])
  const map = new Map<string, Progress>()
  for (const p of rows) map.set(p.itemId, p)
  return map
}

export function useTodayStats() {
  return useLiveQuery(
    async () =>
      (await db.dailyStats.get(todayKey())) ?? {
        dateKey: todayKey(),
        videoSeconds: 0,
        pdfSeconds: 0,
      },
    [],
    { dateKey: todayKey(), videoSeconds: 0, pdfSeconds: 0 } satisfies DailyStat,
  )
}

export function useItem(itemId: string | null) {
  return useLiveQuery<LibraryItem | undefined>(
    async () => (itemId ? (await db.items.get(itemId)) : undefined),
    [itemId],
    undefined,
  )
}
