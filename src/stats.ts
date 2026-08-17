import { db } from './db'
import { todayKey } from './utils'

export async function addWatchSeconds(kind: 'video' | 'pdf', seconds: number) {
  if (seconds <= 0) return
  const dateKey = todayKey()
  await db.transaction('rw', db.dailyStats, async () => {
    const row = await db.dailyStats.get(dateKey)
    if (!row) {
      await db.dailyStats.put({
        dateKey,
        videoSeconds: kind === 'video' ? seconds : 0,
        pdfSeconds: kind === 'pdf' ? seconds : 0,
      })
      return
    }
    if (kind === 'video') {
      await db.dailyStats.update(dateKey, { videoSeconds: row.videoSeconds + seconds })
    } else {
      await db.dailyStats.update(dateKey, { pdfSeconds: row.pdfSeconds + seconds })
    }
  })
}
