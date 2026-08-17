import { useEffect, useRef, useState } from 'react'
import * as pdfjs from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { db } from '../db'
import { addWatchSeconds } from '../stats'
import type { LibraryItem, Progress } from '../types'

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker

interface Props {
  item: LibraryItem
  progress?: Progress
  onClose: () => void
}

export function PdfViewer({ item, progress, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [page, setPage] = useState(progress?.page || 1)
  const [pageCount, setPageCount] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const docRef = useRef<pdfjs.PDFDocumentProxy | null>(null)
  const watchAcc = useRef(0)
  const lastTick = useRef<number | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const src = item.cachedBlob
          ? { data: await item.cachedBlob.arrayBuffer() }
          : { url: item.url }
        const doc = await pdfjs.getDocument(src).promise
        if (cancelled) return
        docRef.current = doc
        setPageCount(doc.numPages)
        setPage(Math.min(Math.max(1, progress?.page || 1), doc.numPages))
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to open PDF')
      }
    })()
    return () => {
      cancelled = true
      void docRef.current?.cleanup()
      docRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id])

  useEffect(() => {
    const doc = docRef.current
    const canvas = canvasRef.current
    if (!doc || !canvas || !pageCount) return
    let cancelled = false
    ;(async () => {
      const pdfPage = await doc.getPage(page)
      if (cancelled) return
      const viewport = pdfPage.getViewport({ scale: 1.25 })
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      canvas.width = viewport.width
      canvas.height = viewport.height
      await pdfPage.render({ canvasContext: ctx, viewport, canvas }).promise
      await db.progress.put({
        itemId: item.id,
        position: page,
        duration: pageCount,
        completed: page >= pageCount,
        remindDismissed: progress?.remindDismissed ?? false,
        updatedAt: Date.now(),
        page,
      })
    })()
    return () => {
      cancelled = true
    }
  }, [page, pageCount, item.id, progress?.remindDismissed])

  useEffect(() => {
    const tick = () => {
      if (document.hidden) {
        lastTick.current = null
        return
      }
      const now = performance.now()
      if (lastTick.current != null) {
        watchAcc.current += (now - lastTick.current) / 1000
        if (watchAcc.current >= 2) {
          const add = Math.floor(watchAcc.current)
          watchAcc.current -= add
          void addWatchSeconds('pdf', add)
        }
      }
      lastTick.current = now
    }
    const id = window.setInterval(tick, 500)
    return () => {
      window.clearInterval(id)
      if (watchAcc.current >= 1) void addWatchSeconds('pdf', Math.floor(watchAcc.current))
    }
  }, [])

  return (
    <div className="pdf-screen">
      <div className="pdf-toolbar">
        <button type="button" className="icon-btn" onClick={onClose}>
          ←
        </button>
        <strong style={{ flex: 1 }}>{item.title}</strong>
        <button type="button" className="btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
          Prev
        </button>
        <span>
          {page} / {pageCount || '—'}
        </span>
        <button
          type="button"
          className="btn"
          disabled={!pageCount || page >= pageCount}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </button>
      </div>
      <div className="pdf-canvas-wrap">
        {error ? <p className="empty">{error}</p> : <canvas ref={canvasRef} />}
      </div>
    </div>
  )
}
