import { useEffect, useMemo, useState } from 'react'
import { DownloadModal } from './components/DownloadModal'
import { ItemCard, useThumbUrls } from './components/ItemCard'
import { PdfViewer } from './components/PdfViewer'
import { ReminderBanner } from './components/ReminderBanner'
import { SettingsView } from './components/SettingsView'
import { VideoPlayer } from './components/VideoPlayer'
import { db } from './db'
import {
  useAllItems,
  useFolders,
  useItems,
  useProgressMap,
  useReady,
  useSettings,
  useTodayStats,
} from './hooks'
import { captureMediaMeta } from './thumbnails'
import { WALLPAPER_PRESETS, type LibraryItem } from './types'
import { detectType, formatDurationShort, titleFromUrl } from './utils'
import { APP_VERSION } from './version'

type View =
  | { name: 'home' }
  | { name: 'folder'; folderId: string }
  | { name: 'settings' }
  | { name: 'player'; itemId: string }
  | { name: 'pdf'; itemId: string }
  | { name: 'image'; itemId: string }

const sessionLater = new Set<string>()

export default function App() {
  const ready = useReady()
  const settings = useSettings()
  const folders = useFolders()
  const allItems = useAllItems()
  const progressMap = useProgressMap()
  const today = useTodayStats()

  const [view, setView] = useState<View>({ name: 'home' })
  const [search, setSearch] = useState('')
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [addOpen, setAddOpen] = useState(false)
  const [folderOpen, setFolderOpen] = useState(false)
  const [addUrl, setAddUrl] = useState('')
  const [addTitle, setAddTitle] = useState('')
  const [folderName, setFolderName] = useState('')
  const [bannerHidden, setBannerHidden] = useState(false)
  const [wallpaperUrl, setWallpaperUrl] = useState<string | undefined>()
  const [wallpaperReady, setWallpaperReady] = useState(false)
  const [downloadItem, setDownloadItem] = useState<LibraryItem | null>(null)

  const folderId = view.name === 'folder' ? view.folderId : null
  const folderItems = useItems(folderId)
  const thumbUrls = useThumbUrls(view.name === 'folder' ? folderItems : allItems)

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme
  }, [settings.theme])

  useEffect(() => {
    if (!ready) return
    let cancelled = false
    let objectUrl: string | undefined

    async function prepareWallpaper() {
      setWallpaperReady(false)

      if (settings.wallpaperBlob) {
        objectUrl = URL.createObjectURL(settings.wallpaperBlob)
        const img = new Image()
        img.decoding = 'async'
        const loaded = new Promise<void>((resolve, reject) => {
          img.onload = () => resolve()
          img.onerror = () => reject(new Error('wallpaper failed'))
        })
        img.src = objectUrl
        try {
          await loaded
          if (img.decode) await img.decode().catch(() => undefined)
        } catch {
          /* still show app with fallback gradient */
        }
        if (cancelled) {
          URL.revokeObjectURL(objectUrl)
          return
        }
        setWallpaperUrl(objectUrl)
        setWallpaperReady(true)
        return
      }

      setWallpaperUrl(undefined)
      // Gradients are instant; tiny delay keeps splash from flashing
      await new Promise((r) => requestAnimationFrame(() => r(undefined)))
      if (!cancelled) setWallpaperReady(true)
    }

    void prepareWallpaper()
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [ready, settings.wallpaperBlob, settings.wallpaperId])

  const wallpaperCss = useMemo(() => {
    if (wallpaperUrl) return `url(${wallpaperUrl})`
    const preset = WALLPAPER_PRESETS.find((w) => w.id === settings.wallpaperId) ?? WALLPAPER_PRESETS[0]
    return settings.theme === 'light' ? preset.cssLight : preset.css
  }, [settings.wallpaperId, settings.theme, wallpaperUrl])

  const unfinished = useMemo(() => {
    const list: { item: LibraryItem; progress: NonNullable<ReturnType<typeof progressMap.get>> }[] = []
    for (const item of allItems) {
      if (item.type !== 'video' && item.type !== 'audio') continue
      const p = progressMap.get(item.id)
      if (!p || p.completed || p.remindDismissed) continue
      if (p.position <= 0) continue
      if (sessionLater.has(item.id)) continue
      list.push({ item, progress: p })
    }
    list.sort((a, b) => b.progress.updatedAt - a.progress.updatedAt)
    return list
  }, [allItems, progressMap, bannerHidden])

  const continueWatching = useMemo(() => {
    return allItems
      .map((item) => ({ item, progress: progressMap.get(item.id) }))
      .filter((x) => x.progress && !x.progress.completed && x.progress.position > 0)
      .sort((a, b) => (b.progress?.updatedAt ?? 0) - (a.progress?.updatedAt ?? 0))
      .slice(0, 12)
  }, [allItems, progressMap])

  const filteredFolderItems = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return folderItems
    return folderItems.filter(
      (i) => i.title.toLowerCase().includes(q) || i.url.toLowerCase().includes(q),
    )
  }, [folderItems, search])

  const activeItemId =
    view.name === 'player' || view.name === 'pdf' || view.name === 'image' ? view.itemId : null
  const activeItem = allItems.find((i) => i.id === activeItemId)

  function openItem(item: LibraryItem) {
    if (selectMode) {
      toggleSelect(item.id)
      return
    }
    if (item.type === 'pdf') setView({ name: 'pdf', itemId: item.id })
    else if (item.type === 'image') setView({ name: 'image', itemId: item.id })
    else if (item.type === 'link') window.open(item.url, '_blank', 'noopener,noreferrer')
    else setView({ name: 'player', itemId: item.id })
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAll() {
    setSelected(new Set(filteredFolderItems.map((i) => i.id)))
  }

  async function createFolder() {
    const name = folderName.trim()
    if (!name) return
    const id = crypto.randomUUID()
    const maxOrder = folders.reduce((m, f) => Math.max(m, f.order), -1)
    await db.folders.add({ id, name, createdAt: Date.now(), order: maxOrder + 1 })
    setFolderName('')
    setFolderOpen(false)
    setView({ name: 'folder', folderId: id })
  }

  async function addLink() {
    if (!folderId || !addUrl.trim()) return
    const url = addUrl.trim()
    const type = detectType(url)
    const id = crypto.randomUUID()
    const maxOrder = folderItems.reduce((m, i) => Math.max(m, i.order), -1)
    const title = addTitle.trim() || titleFromUrl(url)
    await db.items.add({
      id,
      folderId,
      url,
      title,
      type,
      createdAt: Date.now(),
      order: maxOrder + 1,
    })
    setAddUrl('')
    setAddTitle('')
    setAddOpen(false)
    if (type === 'video' || type === 'audio') void captureMediaMeta(id, url)
  }

  async function deleteSelected(mode: 'library' | 'download') {
    const ids = [...selected]
    if (!ids.length) return
    if (mode === 'download') {
      for (const id of ids) await db.items.update(id, { cachedBlob: undefined, cacheSize: 0 })
    } else {
      await db.items.bulkDelete(ids)
      await db.progress.bulkDelete(ids)
    }
    setSelected(new Set())
    setSelectMode(false)
  }

  async function deleteFolder(id: string) {
    if (!confirm('Delete this folder and all items inside?')) return
    const items = await db.items.where('folderId').equals(id).toArray()
    const itemIds = items.map((i) => i.id)
    await db.items.bulkDelete(itemIds)
    await db.progress.bulkDelete(itemIds)
    await db.folders.delete(id)
    setView({ name: 'home' })
  }

  if (!ready || !wallpaperReady) {
    return (
      <div className="boot-splash" aria-busy="true" aria-label="Loading">
        <div className="boot-splash-inner">
          <div className="boot-mark" />
          <p>Endi's Media</p>
          <span>Loading wallpaper…</span>
        </div>
      </div>
    )
  }

  if (view.name === 'player' && activeItem) {
    return (
      <VideoPlayer
        item={activeItem}
        progress={progressMap.get(activeItem.id)}
        settings={settings}
        onClose={() => setView({ name: 'folder', folderId: activeItem.folderId })}
      />
    )
  }

  if (view.name === 'pdf' && activeItem) {
    return (
      <PdfViewer
        item={activeItem}
        progress={progressMap.get(activeItem.id)}
        onClose={() => setView({ name: 'folder', folderId: activeItem.folderId })}
      />
    )
  }

  if (view.name === 'image' && activeItem) {
    return (
      <div className="image-screen">
        <div className="image-toolbar">
          <button
            type="button"
            className="icon-btn"
            onClick={() => setView({ name: 'folder', folderId: activeItem.folderId })}
          >
            ←
          </button>
          <strong style={{ flex: 1 }}>{activeItem.title}</strong>
        </div>
        <div style={{ flex: 1, display: 'grid', placeItems: 'center', padding: 16 }}>
          <img src={activeItem.url} alt={activeItem.title} style={{ maxWidth: '100%', maxHeight: '100%' }} />
        </div>
      </div>
    )
  }

  const todayTotal = today.videoSeconds + today.pdfSeconds
  const reminder = !bannerHidden && unfinished[0]

  return (
    <div className="app-shell" style={{ ['--wallpaper' as string]: wallpaperCss }}>
      <header
        className="topbar"
        style={{
          ['--topbar-transparency' as string]: String(settings.topbarTransparency ?? 18),
          ['--topbar-blur' as string]:
            (settings.topbarTransparency ?? 18) >= 100
              ? '0px'
              : `${Math.max(0, 12 - (settings.topbarTransparency ?? 18) * 0.08)}px`,
        }}
      >
        <div className="brand">Endi's Media</div>
        <div className="stats-chip" title={`Videos ${formatDurationShort(today.videoSeconds)} · PDFs ${formatDurationShort(today.pdfSeconds)}`}>
          Today {formatDurationShort(todayTotal)}
        </div>
        <button type="button" className="icon-btn" onClick={() => setView({ name: 'settings' })} aria-label="Settings">
          ⚙
        </button>
      </header>

      {reminder && (
        <ReminderBanner
          item={reminder.item}
          progress={reminder.progress}
          extraCount={Math.max(0, unfinished.length - 1)}
          onOpen={() => openItem(reminder.item)}
          onLater={() => {
            sessionLater.add(reminder.item.id)
            setBannerHidden(true)
            queueMicrotask(() => setBannerHidden(false))
          }}
          onNever={() => {
            void db.progress.update(reminder.item.id, { remindDismissed: true })
          }}
        />
      )}

      {view.name === 'settings' ? (
        <SettingsView settings={settings} onClose={() => setView({ name: 'home' })} />
      ) : view.name === 'home' ? (
        <>
          <main className="main">
          <h1 className="section-title">Your folders</h1>
          <p className="section-sub">Organize lectures, PDFs, and streams. Progress stays on this device.</p>
          <div className="toolbar">
            <button type="button" className="btn btn-primary" onClick={() => setFolderOpen(true)}>
              Add folder
            </button>
          </div>

          {continueWatching.length > 0 && (
            <>
              <h2 className="section-title" style={{ fontSize: '1.05rem' }}>
                Continue watching
              </h2>
              <div className="continue-row">
                {continueWatching.map(({ item, progress }) => (
                  <div key={item.id} className="continue-card">
                    <ItemCard
                      item={item}
                      progress={progress}
                      selected={false}
                      selectMode={false}
                      thumbUrl={thumbUrls[item.id]}
                      onOpen={() => openItem(item)}
                      onToggleSelect={() => undefined}
                      onDownload={() => setDownloadItem(item)}
                    />
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="grid">
            {folders.map((folder) => {
              const count = allItems.filter((i) => i.folderId === folder.id).length
              return (
                <button
                  key={folder.id}
                  type="button"
                  className="card folder-tile"
                  onClick={() => {
                    void db.settings.update('settings', { lastFolderId: folder.id })
                    setView({ name: 'folder', folderId: folder.id })
                  }}
                >
                  <strong>{folder.name}</strong>
                  <span className="card-meta">{count} items</span>
                </button>
              )
            })}
          </div>
          {!folders.length && <p className="empty">No folders yet.</p>}
          </main>
          <div className="app-version" aria-label={`Version ${APP_VERSION}`}>
            v{APP_VERSION}
          </div>
        </>
      ) : (
        <main className="main">
          <div className="toolbar">
            <button type="button" className="icon-btn" onClick={() => setView({ name: 'home' })}>
              ←
            </button>
            <h1 className="section-title" style={{ margin: 0, flex: 1 }}>
              {folders.find((f) => f.id === folderId)?.name ?? 'Folder'}
            </h1>
          </div>

          <div className="search-row">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search in folder…"
            />
          </div>

          <div className="toolbar">
            <button type="button" className="btn btn-primary" onClick={() => setAddOpen(true)}>
              Add link
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setSelectMode((v) => !v)
                setSelected(new Set())
              }}
            >
              {selectMode ? 'Cancel select' : 'Select'}
            </button>
            {selectMode && (
              <>
                <button type="button" className="btn" onClick={selectAll}>
                  Select all
                </button>
                <button type="button" className="btn btn-danger" onClick={() => void deleteSelected('library')}>
                  Delete from library
                </button>
                <button type="button" className="btn" onClick={() => void deleteSelected('download')}>
                  Delete downloads only
                </button>
              </>
            )}
            <button type="button" className="btn btn-danger" onClick={() => folderId && void deleteFolder(folderId)}>
              Delete folder
            </button>
          </div>

          <div className="grid">
            {filteredFolderItems.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                progress={progressMap.get(item.id)}
                selected={selected.has(item.id)}
                selectMode={selectMode}
                thumbUrl={thumbUrls[item.id]}
                onOpen={() => openItem(item)}
                onToggleSelect={() => toggleSelect(item.id)}
                onDownload={() => setDownloadItem(item)}
              />
            ))}
          </div>
          {!filteredFolderItems.length && <p className="empty">No items yet. Add an .m3u8, MP4, or PDF link.</p>}
        </main>
      )}

      {folderOpen && (
        <div className="modal-backdrop" onClick={() => setFolderOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>New folder</h2>
            <div className="field">
              <label htmlFor="folder-name">Name</label>
              <input
                id="folder-name"
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
                placeholder="e.g. Physics"
              />
            </div>
            <div className="modal-actions">
              <button type="button" className="btn" onClick={() => setFolderOpen(false)}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={() => void createFolder()}>
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {addOpen && (
        <div className="modal-backdrop" onClick={() => setAddOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Add link</h2>
            <div className="field">
              <label htmlFor="add-url">URL</label>
              <input
                id="add-url"
                value={addUrl}
                onChange={(e) => setAddUrl(e.target.value)}
                placeholder="https://…/index.m3u8"
              />
            </div>
            <div className="field">
              <label htmlFor="add-title">Title (optional)</label>
              <input
                id="add-title"
                value={addTitle}
                onChange={(e) => setAddTitle(e.target.value)}
                placeholder="Lecture 3"
              />
            </div>
            <div className="modal-actions">
              <button type="button" className="btn" onClick={() => setAddOpen(false)}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={() => void addLink()}>
                Add
              </button>
            </div>
          </div>
        </div>
      )}
      {downloadItem && <DownloadModal item={downloadItem} onClose={() => setDownloadItem(null)} />}
    </div>
  )
}
