import { useEffect, useState } from 'react'
import { db } from '../db'
import {
  downloadItemMedia,
  probeHlsQualities,
  saveToDevice,
  type DownloadProgress,
  type QualityOption,
} from '../downloads'
import type { LibraryItem } from '../types'
import { formatBytes } from '../utils'

interface Props {
  item: LibraryItem
  onClose: () => void
}

type Step =
  | { name: 'checking' }
  | { name: 'choose-quality'; options: QualityOption[] }
  | { name: 'choose-destination'; qualityIndex: number | null }
  | { name: 'downloading'; qualityIndex: number | null }
  | { name: 'done'; savedToApp: boolean; savedToDevice: boolean; isSegmented: boolean }
  | { name: 'error'; message: string }

export function DownloadModal({ item, onClose }: Props) {
  const [step, setStep] = useState<Step>({ name: 'checking' })
  const [progress, setProgress] = useState<DownloadProgress | null>(null)

  useEffect(() => {
    let cancelled = false
    async function init() {
      if (item.type === 'pdf' || item.type === 'image') {
        if (!cancelled) setStep({ name: 'choose-destination', qualityIndex: null })
        return
      }
      const options = await probeHlsQualities(item.url)
      if (cancelled) return
      if (options.length > 0) setStep({ name: 'choose-quality', options })
      else setStep({ name: 'choose-destination', qualityIndex: null })
    }
    void init()
    return () => {
      cancelled = true
    }
  }, [item.type, item.url])

  async function runDownload(qualityIndex: number | null, destination: 'app' | 'device' | 'both') {
    setStep({ name: 'downloading', qualityIndex })
    setProgress(null)
    try {
      const { blob, isSegmented } = await downloadItemMedia(item, qualityIndex, setProgress)
      let savedToApp = false
      let savedToDevice = false

      if (destination === 'app' || destination === 'both') {
        await db.items.update(item.id, { cachedBlob: blob, cacheSize: blob.size })
        savedToApp = true
      }
      if (destination === 'device' || destination === 'both') {
        await saveToDevice(blob, item)
        savedToDevice = true
      }

      setStep({ name: 'done', savedToApp, savedToDevice, isSegmented })
    } catch (e) {
      setStep({ name: 'error', message: e instanceof Error ? e.message : 'Download failed' })
    }
  }

  const isVideoLike = item.type === 'video' || item.type === 'audio'

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Download</h2>
        <p className="section-sub" style={{ marginBottom: 14 }}>
          {item.title}
        </p>

        {step.name === 'checking' && <p className="section-sub">Checking available quality…</p>}

        {step.name === 'choose-quality' && (
          <>
            <p className="section-sub" style={{ marginBottom: 10 }}>
              Multiple qualities are available. Which one do you want?
            </p>
            <div className="download-quality-list">
              {step.options.map((o) => (
                <button
                  key={o.index}
                  type="button"
                  className="btn"
                  onClick={() => setStep({ name: 'choose-destination', qualityIndex: o.index })}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </>
        )}

        {step.name === 'choose-destination' && (
          <>
            <p className="section-sub" style={{ marginBottom: 10 }}>
              Where should it go?
            </p>
            <div className="download-quality-list">
              <button type="button" className="btn btn-primary" onClick={() => void runDownload(step.qualityIndex, 'app')}>
                Keep in app (offline)
              </button>
              <button type="button" className="btn" onClick={() => void runDownload(step.qualityIndex, 'device')}>
                {isVideoLike ? 'Save to gallery / device' : 'Save to device'}
              </button>
              <button type="button" className="btn" onClick={() => void runDownload(step.qualityIndex, 'both')}>
                Both
              </button>
            </div>
            {isVideoLike && item.url.includes('.m3u8') && (
              <p className="section-sub" style={{ marginTop: 10, fontSize: '0.78rem' }}>
                Streamed video is saved as a single file rebuilt from the stream. "Keep in app" always
                works for playback here; whether your Gallery app can open the saved file depends on
                your device.
              </p>
            )}
          </>
        )}

        {step.name === 'downloading' && (
          <div>
            <p className="section-sub" style={{ marginBottom: 8 }}>
              Downloading…
            </p>
            {progress?.segment ? (
              <p className="section-sub">
                Segment {progress.segment.done} / {progress.segment.total}
              </p>
            ) : progress ? (
              <p className="section-sub">
                {formatBytes(progress.loaded)}
                {progress.total ? ` / ${formatBytes(progress.total)}` : ''}
              </p>
            ) : null}
          </div>
        )}

        {step.name === 'done' && (
          <div>
            <p className="section-sub" style={{ marginBottom: 10 }}>
              {step.savedToApp && step.savedToDevice
                ? 'Saved offline in the app and sent to your device.'
                : step.savedToApp
                  ? 'Saved offline — you can watch it in the app without a connection.'
                  : 'Sent to your device.'}
            </p>
            <div className="modal-actions">
              <button type="button" className="btn btn-primary" onClick={onClose}>
                Done
              </button>
            </div>
          </div>
        )}

        {step.name === 'error' && (
          <div>
            <p className="section-sub" style={{ marginBottom: 10, color: 'var(--danger)' }}>
              {step.message}
            </p>
            <div className="modal-actions">
              <button type="button" className="btn" onClick={onClose}>
                Close
              </button>
            </div>
          </div>
        )}

        {step.name !== 'downloading' && step.name !== 'done' && (
          <div className="modal-actions">
            <button type="button" className="btn" onClick={onClose}>
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
