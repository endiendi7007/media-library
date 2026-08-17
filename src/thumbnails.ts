import Hls from 'hls.js'
import { db } from './db'

/** Best-effort thumbnail + duration capture. Never throws to caller. */
export async function captureMediaMeta(itemId: string, url: string) {
  try {
    const video = document.createElement('video')
    video.crossOrigin = 'anonymous'
    video.muted = true
    video.playsInline = true
    video.preload = 'metadata'

    const cleanup = () => {
      try {
        video.pause()
        video.removeAttribute('src')
        video.load()
      } catch {
        /* ignore */
      }
    }

    const done = new Promise<void>((resolve) => {
      const timeout = window.setTimeout(() => resolve(), 12000)

      const finish = async () => {
        window.clearTimeout(timeout)
        const duration = Number.isFinite(video.duration) ? video.duration : undefined
        let thumbnailBlob: Blob | undefined
        try {
          const seekTo = duration && duration > 2 ? Math.min(3, duration * 0.1) : 0.1
          await new Promise<void>((r) => {
            const onSeeked = () => {
              video.removeEventListener('seeked', onSeeked)
              r()
            }
            video.addEventListener('seeked', onSeeked)
            try {
              video.currentTime = seekTo
            } catch {
              r()
            }
          })
          const canvas = document.createElement('canvas')
          canvas.width = 320
          canvas.height = Math.max(1, Math.round((video.videoHeight / video.videoWidth) * 320)) || 180
          const ctx = canvas.getContext('2d')
          if (ctx && video.videoWidth > 0) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
            thumbnailBlob = await new Promise<Blob | undefined>((res) =>
              canvas.toBlob((b) => res(b ?? undefined), 'image/jpeg', 0.72),
            )
          }
        } catch {
          /* CORS often blocks canvas */
        }

        const patch: { duration?: number; thumbnailBlob?: Blob } = {}
        if (duration && duration > 0) patch.duration = duration
        if (thumbnailBlob) patch.thumbnailBlob = thumbnailBlob
        if (Object.keys(patch).length) await db.items.update(itemId, patch)
        cleanup()
        if (hls) hls.destroy()
        resolve()
      }

      let hls: Hls | null = null
      video.addEventListener('loadeddata', () => void finish(), { once: true })
      video.addEventListener('error', () => {
        cleanup()
        if (hls) hls.destroy()
        window.clearTimeout(timeout)
        resolve()
      })

      if (url.includes('.m3u8') && Hls.isSupported()) {
        hls = new Hls({ enableWorker: true, maxBufferLength: 5 })
        hls.loadSource(url)
        hls.attachMedia(video)
        hls.on(Hls.Events.ERROR, () => {
          cleanup()
          hls?.destroy()
          window.clearTimeout(timeout)
          resolve()
        })
      } else {
        video.src = url
      }
    })

    await done
  } catch (e) {
    console.warn('captureMediaMeta failed', e)
  }
}
