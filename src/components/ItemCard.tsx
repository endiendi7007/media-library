import { useEffect, useMemo, useState } from 'react'
import type { LibraryItem, Progress } from '../types'
import { formatTime } from '../utils'

interface Props {
  item: LibraryItem
  progress?: Progress
  selected: boolean
  selectMode: boolean
  thumbUrl?: string
  onOpen: () => void
  onToggleSelect: () => void
  onDownload?: () => void
}

export function ItemCard({
  item,
  progress,
  selected,
  selectMode,
  thumbUrl,
  onOpen,
  onToggleSelect,
  onDownload,
}: Props) {
  const pct =
    progress && progress.duration > 0 && !progress.completed
      ? Math.min(100, (progress.position / progress.duration) * 100)
      : progress?.completed
        ? 100
        : 0

  const downloadable = onDownload && (item.type === 'video' || item.type === 'audio' || item.type === 'pdf')

  return (
    <div className={`card ${selected ? 'selected' : ''}`}>
      {selectMode && (
        <button
          type="button"
          className={`card-check ${selected ? 'on' : ''}`}
          onClick={(e) => {
            e.stopPropagation()
            onToggleSelect()
          }}
          aria-label="Select"
        />
      )}
      {!selectMode && downloadable && (
        <button
          type="button"
          className={`card-download ${item.cachedBlob ? 'saved' : ''}`}
          onClick={(e) => {
            e.stopPropagation()
            onDownload?.()
          }}
          aria-label={item.cachedBlob ? 'Downloaded — download again' : 'Download'}
          title={item.cachedBlob ? 'Downloaded' : 'Download'}
        >
          {item.cachedBlob ? (
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden>
              <path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden>
              <path d="M12 16 6 10l1.4-1.4L11 12.2V3h2v9.2l3.6-3.6L18 10zM5 20v-2h14v2z" />
            </svg>
          )}
        </button>
      )}
      <button type="button" className="card-hit" onClick={onOpen}>
        <div className="card-thumb">
          {thumbUrl ? <img src={thumbUrl} alt="" /> : <span>{item.type.toUpperCase()}</span>}
          <span className="card-type">{item.type}</span>
          {progress?.completed && <span className="card-tick">✓</span>}
        </div>
        <div className="card-body">
          <p className="card-title">{item.title}</p>
          <div className="card-meta">
            {item.duration ? formatTime(item.duration) : '—'}
            {progress && !progress.completed && progress.position > 0
              ? ` · left at ${formatTime(progress.position)}`
              : ''}
          </div>
          {pct > 0 && !progress?.completed && (
            <div className="progress-bar">
              <span style={{ width: `${pct}%` }} />
            </div>
          )}
        </div>
      </button>
    </div>
  )
}

export function useThumbUrls(items: LibraryItem[]) {
  const [urls, setUrls] = useState<Record<string, string>>({})
  const key = useMemo(
    () => items.map((i) => `${i.id}:${i.thumbnailBlob?.size ?? 0}`).join('|'),
    [items],
  )

  useEffect(() => {
    const next: Record<string, string> = {}
    const created: string[] = []
    for (const item of items) {
      if (item.thumbnailBlob) {
        const u = URL.createObjectURL(item.thumbnailBlob)
        next[item.id] = u
        created.push(u)
      }
    }
    setUrls(next)
    return () => {
      for (const u of created) URL.revokeObjectURL(u)
    }
  }, [key, items])

  return urls
}
