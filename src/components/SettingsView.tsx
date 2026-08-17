import { useEffect, useState } from 'react'
import { db } from '../db'
import { breakdownLabels, estimateStorage, type StorageBreakdown } from '../storage'
import { WALLPAPER_PRESETS, PAUSE_TINT_PRESETS, PROGRESS_BAR_PRESETS, type AppSettings } from '../types'
import { ColorWheelPicker } from './ColorWheelPicker'

interface Props {
  settings: AppSettings
  onClose: () => void
}

export function SettingsView({ settings, onClose }: Props) {
  const [storage, setStorage] = useState<StorageBreakdown | null>(null)

  useEffect(() => {
    void estimateStorage().then(setStorage)
  }, [settings.wallpaperId, settings.wallpaperBlob])

  async function setTheme(theme: 'dark' | 'light') {
    await db.settings.update('settings', { theme })
  }

  async function setWallpaper(id: string) {
    await db.settings.update('settings', { wallpaperId: id, wallpaperBlob: undefined })
  }

  async function onUploadWallpaper(file: File | null) {
    if (!file) return
    await db.settings.update('settings', { wallpaperId: 'custom', wallpaperBlob: file })
  }

  async function setQuality(defaultQuality: 'lowest' | 'remember') {
    await db.settings.update('settings', { defaultQuality })
  }

  async function setTopbarTransparency(value: number) {
    const topbarTransparency = Math.max(0, Math.min(100, Math.round(value)))
    await db.settings.update('settings', { topbarTransparency })
  }

  async function setPauseTintEnabled(pauseTintEnabled: boolean) {
    await db.settings.update('settings', { pauseTintEnabled })
  }

  async function setPauseTintColor(pauseTintColor: string) {
    await db.settings.update('settings', { pauseTintColor })
  }

  async function setPauseIconEnabled(pauseIconEnabled: boolean) {
    await db.settings.update('settings', { pauseIconEnabled })
  }

  async function setProgressBarColor(progressBarColor: string) {
    await db.settings.update('settings', { progressBarColor })
  }

  async function clearDownloads() {
    const items = await db.items.toArray()
    for (const item of items) {
      if (item.cachedBlob) {
        await db.items.update(item.id, { cachedBlob: undefined, cacheSize: 0 })
      }
    }
    setStorage(await estimateStorage())
  }

  async function clearAll() {
    if (!confirm('Delete all folders, items, progress, and settings?')) return
    await db.delete()
    location.reload()
  }

  async function exportLibrary() {
    const folders = await db.folders.toArray()
    const items = await db.items.toArray()
    const progress = await db.progress.toArray()
    const dailyStats = await db.dailyStats.toArray()
    const payload = {
      version: 1,
      folders,
      items: items.map(({ thumbnailBlob, cachedBlob, ...rest }) => rest),
      progress,
      dailyStats,
      settings: { ...settings, wallpaperBlob: undefined },
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `media-library-backup-${Date.now()}.json`
    a.click()
  }

  async function importLibrary(file: File | null) {
    if (!file) return
    const text = await file.text()
    const data = JSON.parse(text) as {
      folders: unknown[]
      items: unknown[]
      progress: unknown[]
      dailyStats?: unknown[]
      settings?: AppSettings
    }
    await db.transaction('rw', db.folders, db.items, db.progress, db.dailyStats, db.settings, async () => {
      await db.folders.clear()
      await db.items.clear()
      await db.progress.clear()
      if (data.folders?.length) await db.folders.bulkPut(data.folders as never[])
      if (data.items?.length) await db.items.bulkPut(data.items as never[])
      if (data.progress?.length) await db.progress.bulkPut(data.progress as never[])
      if (data.dailyStats?.length) await db.dailyStats.bulkPut(data.dailyStats as never[])
      if (data.settings) await db.settings.put({ ...data.settings, id: 'settings' })
    })
    location.reload()
  }

  return (
    <div className="main">
      <div className="toolbar">
        <button type="button" className="icon-btn" onClick={onClose}>
          ←
        </button>
        <h1 className="section-title" style={{ margin: 0 }}>
          Settings
        </h1>
      </div>

      <div className="settings-panel">
        <div className="settings-block">
          <h3>Appearance</h3>
          <div className="toolbar">
            <button
              type="button"
              className={`btn ${settings.theme === 'dark' ? 'btn-primary' : ''}`}
              onClick={() => void setTheme('dark')}
            >
              Dark
            </button>
            <button
              type="button"
              className={`btn ${settings.theme === 'light' ? 'btn-primary' : ''}`}
              onClick={() => void setTheme('light')}
            >
              Light
            </button>
          </div>
          <p className="section-sub">Wallpaper</p>
          <div className="wallpaper-grid">
            {WALLPAPER_PRESETS.map((w) => (
              <button
                key={w.id}
                type="button"
                className={`wallpaper-swatch ${settings.wallpaperId === w.id ? 'active' : ''}`}
                style={{ background: settings.theme === 'light' ? w.cssLight : w.css }}
                onClick={() => void setWallpaper(w.id)}
                aria-label={w.label}
              />
            ))}
          </div>
          <div className="toolbar" style={{ marginTop: 10 }}>
            <label className="btn">
              Upload wallpaper
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => void onUploadWallpaper(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>
          <p className="section-sub" style={{ marginTop: 14, marginBottom: 8 }}>
            Top bar transparency — {settings.topbarTransparency ?? 18}%
            {(settings.topbarTransparency ?? 18) >= 100 ? ' (fully transparent)' : ''}
          </p>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={settings.topbarTransparency ?? 18}
            onChange={(e) => void setTopbarTransparency(Number(e.target.value))}
            aria-label="Top bar transparency"
            style={{ width: '100%' }}
          />
          <div className="toolbar" style={{ marginTop: 6 }}>
            <button type="button" className="btn" onClick={() => void setTopbarTransparency(0)}>
              Solid
            </button>
            <button type="button" className="btn" onClick={() => void setTopbarTransparency(50)}>
              50%
            </button>
            <button type="button" className="btn" onClick={() => void setTopbarTransparency(100)}>
              Fully transparent
            </button>
          </div>
        </div>

        <div className="settings-block">
          <h3>Pause look</h3>
          <p className="section-sub" style={{ marginBottom: 10 }}>
            Edge tint and optional icon while the video is paused.
          </p>
          <div className="toolbar">
            <button
              type="button"
              className={`btn ${(settings.pauseTintEnabled ?? true) ? 'btn-primary' : ''}`}
              onClick={() => void setPauseTintEnabled(true)}
            >
              Tint on
            </button>
            <button
              type="button"
              className={`btn ${settings.pauseTintEnabled === false ? 'btn-primary' : ''}`}
              onClick={() => void setPauseTintEnabled(false)}
            >
              Tint off
            </button>
            <button
              type="button"
              className={`btn ${settings.pauseIconEnabled ? 'btn-primary' : ''}`}
              onClick={() => void setPauseIconEnabled(!(settings.pauseIconEnabled ?? false))}
            >
              {settings.pauseIconEnabled ? 'Pause icon on' : 'Pause icon off'}
            </button>
          </div>
          {(settings.pauseTintEnabled ?? true) && (
            <>
              <p className="section-sub" style={{ marginTop: 12, marginBottom: 8 }}>
                Tint color
              </p>
              <div className="wallpaper-grid">
                {PAUSE_TINT_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`wallpaper-swatch ${
                      (settings.pauseTintColor || '#6b7280').toLowerCase() === p.color.toLowerCase()
                        ? 'active'
                        : ''
                    }`}
                    style={{ background: p.color }}
                    onClick={() => void setPauseTintColor(p.color)}
                    aria-label={p.label}
                    title={p.label}
                  />
                ))}
              </div>
              <div className="toolbar" style={{ marginTop: 10 }}>
                <ColorWheelPicker
                  value={settings.pauseTintColor || '#6b7280'}
                  onChange={(hex) => void setPauseTintColor(hex)}
                  label="Custom"
                />
              </div>
            </>
          )}
        </div>

        <div className="settings-block">
          <h3>Progress bar</h3>
          <p className="section-sub" style={{ marginBottom: 10 }}>
            Color of the time-remaining bar shown under the video.
          </p>
          <div className="wallpaper-grid">
            {PROGRESS_BAR_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`wallpaper-swatch ${
                  (settings.progressBarColor || '#3b82f6').toLowerCase() === p.color.toLowerCase()
                    ? 'active'
                    : ''
                }`}
                style={{ background: p.color }}
                onClick={() => void setProgressBarColor(p.color)}
                aria-label={p.label}
                title={p.label}
              />
            ))}
          </div>
          <div className="toolbar" style={{ marginTop: 10 }}>
            <ColorWheelPicker
              value={settings.progressBarColor || '#3b82f6'}
              onChange={(hex) => void setProgressBarColor(hex)}
              label="Custom"
            />
          </div>
        </div>

        <div className="settings-block">
          <h3>Player defaults</h3>
          <div className="toolbar">
            <button
              type="button"
              className={`btn ${settings.defaultQuality === 'lowest' ? 'btn-primary' : ''}`}
              onClick={() => void setQuality('lowest')}
            >
              Start at lowest quality
            </button>
            <button
              type="button"
              className={`btn ${settings.defaultQuality === 'remember' ? 'btn-primary' : ''}`}
              onClick={() => void setQuality('remember')}
            >
              Remember last quality
            </button>
          </div>
        </div>

        <div className="settings-block">
          <h3>Storage</h3>
          {storage ? (
            <p className="section-sub" style={{ marginBottom: 8 }}>
              {breakdownLabels(storage).join(' · ')}
            </p>
          ) : (
            <p className="section-sub">Calculating…</p>
          )}
          <div className="toolbar">
            <button type="button" className="btn" onClick={() => void clearDownloads()}>
              Clear all downloads
            </button>
            <button type="button" className="btn" onClick={() => void exportLibrary()}>
              Export library
            </button>
            <label className="btn">
              Import library
              <input
                type="file"
                accept="application/json"
                hidden
                onChange={(e) => void importLibrary(e.target.files?.[0] ?? null)}
              />
            </label>
            <button type="button" className="btn btn-danger" onClick={() => void clearAll()}>
              Delete all data
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
