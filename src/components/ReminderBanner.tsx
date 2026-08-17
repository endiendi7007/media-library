import type { LibraryItem, Progress } from '../types'
import { formatTime } from '../utils'

interface Props {
  item: LibraryItem
  progress: Progress
  extraCount: number
  onOpen: () => void
  onLater: () => void
  onNever: () => void
}

export function ReminderBanner({ item, progress, extraCount, onOpen, onLater, onNever }: Props) {
  return (
    <div className="reminder" role="status">
      <button type="button" className="reminder-body" onClick={onOpen}>
        You only watched this video till {formatTime(progress.position)}
        {extraCount > 0 ? ` · +${extraCount} more` : ''} — {item.title}
      </button>
      <div className="reminder-actions">
        <button type="button" className="primary" onClick={onOpen}>
          Resume
        </button>
        <button type="button" onClick={onLater}>
          Remind me later
        </button>
        <button type="button" onClick={onNever}>
          Don&apos;t remind me again
        </button>
      </div>
    </div>
  )
}
