import Hls from 'hls.js'
import { useEffect, useRef, useState } from 'react'
import { db } from '../db'
import { addWatchSeconds } from '../stats'
import type { AppSettings, LibraryItem, Progress } from '../types'

const SPEEDS = [1, 1.25, 1.5, 2, 3, 4]

interface Props {
  item: LibraryItem
  progress?: Progress
  settings: AppSettings
  onClose: () => void
}

export function VideoPlayer({ item, progress, settings, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const baseSpeedRef = useRef(settings.lastSpeed || 1)
  const holdBoostRef = useRef(false)
  const seekHoldRef = useRef<number | null>(null)
  const lastTapRef = useRef<{ t: number; side: 'left' | 'right' } | null>(null)
  const skipAccRef = useRef(0)
  const watchAccRef = useRef(0)
  const lastTickRef = useRef<number | null>(null)
  const longPressTimer = useRef<number | null>(null)
  const pointerDownRef = useRef<{ x: number; y: number; t: number; side: 'left' | 'right' } | null>(null)

  const [levels, setLevels] = useState<{ height: number; index: number }[]>([])
  const [level, setLevel] = useState<number>(-1)
  const [speed, setSpeed] = useState(settings.lastSpeed || 1)
  const [badge, setBadge] = useState<string | null>(null)
  const [showChrome, setShowChrome] = useState(true)
  const [isPaused, setIsPaused] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuPanel, setMenuPanel] = useState<'root' | 'speed' | 'quality'>('root')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [forceLandscapeCss, setForceLandscapeCss] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [isScrubbing, setIsScrubbing] = useState(false)
  const [scrubTime, setScrubTime] = useState(0)
  const menuOpenRef = useRef(false)
  const stageRef = useRef<HTMLDivElement>(null)
  const seekBarRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    menuOpenRef.current = menuOpen
  }, [menuOpen])

  useEffect(() => {
    const syncLandscape = async () => {
      const fs = Boolean(document.fullscreenElement)
      setIsFullscreen(fs)
      if (!fs) {
        setForceLandscapeCss(false)
        try {
          screen.orientation?.unlock?.()
        } catch {
          /* ignore */
        }
        return
      }
      try {
        await screen.orientation?.lock?.('landscape')
        setForceLandscapeCss(false)
      } catch {
        // Browser blocked lock (common on iOS / desktop) — CSS rotate if portrait
        const portrait = window.matchMedia('(orientation: portrait)').matches
        setForceLandscapeCss(portrait)
      }
    }
    const onFs = () => void syncLandscape()
    const onOrient = () => {
      if (!document.fullscreenElement) return
      const portrait = window.matchMedia('(orientation: portrait)').matches
      // If still portrait while fullscreen, keep CSS force
      setForceLandscapeCss(portrait)
    }
    document.addEventListener('fullscreenchange', onFs)
    window.addEventListener('orientationchange', onOrient)
    window.matchMedia('(orientation: portrait)').addEventListener('change', onOrient)
    return () => {
      document.removeEventListener('fullscreenchange', onFs)
      window.removeEventListener('orientationchange', onOrient)
      try {
        screen.orientation?.unlock?.()
      } catch {
        /* ignore */
      }
    }
  }, [])

  useEffect(() => {
    baseSpeedRef.current = speed
  }, [speed])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const url = item.cachedBlob ? URL.createObjectURL(item.cachedBlob) : item.url
    let objectUrl = item.cachedBlob ? url : null

    const applyQuality = (hls: Hls) => {
      const lvls = hls.levels
        .map((l, index) => ({ height: l.height || 0, index }))
        .filter((l) => l.height > 0)
        .sort((a, b) => a.height - b.height)
      setLevels(lvls)
      if (settings.defaultQuality === 'lowest' && lvls.length) {
        hls.currentLevel = lvls[0].index
        setLevel(lvls[0].index)
      } else if (settings.defaultQuality === 'remember' && settings.lastQualityHeight) {
        const match = lvls.find((l) => l.height === settings.lastQualityHeight)
        if (match) {
          hls.currentLevel = match.index
          setLevel(match.index)
        }
      }
    }

    if (item.url.includes('.m3u8') && Hls.isSupported() && !item.cachedBlob) {
      const hls = new Hls({
        startLevel: -1,
        capLevelToPlayerSize: true,
      })
      hlsRef.current = hls
      hls.loadSource(item.url)
      hls.attachMedia(video)
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        applyQuality(hls)
        if (progress?.position && !progress.completed) {
          video.currentTime = progress.position
        }
        void video.play().catch(() => undefined)
      })
    } else if (video.canPlayType('application/vnd.apple.mpegurl') && item.url.includes('.m3u8')) {
      video.src = item.url
      video.addEventListener(
        'loadedmetadata',
        () => {
          if (progress?.position && !progress.completed) video.currentTime = progress.position
          void video.play().catch(() => undefined)
        },
        { once: true },
      )
    } else {
      video.src = url
      video.addEventListener(
        'loadedmetadata',
        () => {
          if (progress?.position && !progress.completed) video.currentTime = progress.position
          void video.play().catch(() => undefined)
        },
        { once: true },
      )
    }

    video.playbackRate = baseSpeedRef.current

    return () => {
      hlsRef.current?.destroy()
      hlsRef.current = null
      if (objectUrl) URL.revokeObjectURL(objectUrl)
      if (seekHoldRef.current) window.clearInterval(seekHoldRef.current)
      if (longPressTimer.current) window.clearTimeout(longPressTimer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const save = async () => {
      const position = video.currentTime || 0
      const duration = video.duration || progress?.duration || item.duration || 0
      const completed = duration > 0 && (video.ended || position / duration >= 0.95)
      await db.progress.put({
        itemId: item.id,
        position: completed ? 0 : position,
        duration,
        completed,
        remindDismissed: progress?.remindDismissed ?? false,
        updatedAt: Date.now(),
        page: progress?.page,
      })
      if (duration && (!item.duration || Math.abs(item.duration - duration) > 1)) {
        await db.items.update(item.id, { duration })
      }
    }

    const onTime = () => {
      const now = performance.now()
      if (!video.paused && !video.ended) {
        if (lastTickRef.current != null) {
          watchAccRef.current += (now - lastTickRef.current) / 1000
          if (watchAccRef.current >= 2) {
            const add = Math.floor(watchAccRef.current)
            watchAccRef.current -= add
            void addWatchSeconds('video', add)
            void save()
          }
        }
        lastTickRef.current = now
      } else {
        lastTickRef.current = null
      }
    }

    const onVis = () => {
      if (document.hidden) {
        lastTickRef.current = null
        void save()
      }
    }

    const interval = window.setInterval(onTime, 500)
    const syncPaused = () => setIsPaused(video.paused)
    syncPaused()
    video.addEventListener('play', syncPaused)
    video.addEventListener('pause', syncPaused)
    video.addEventListener('pause', save)
    video.addEventListener('ended', save)
    window.addEventListener('beforeunload', save)
    document.addEventListener('visibilitychange', onVis)

    return () => {
      window.clearInterval(interval)
      video.removeEventListener('play', syncPaused)
      video.removeEventListener('pause', syncPaused)
      video.removeEventListener('pause', save)
      video.removeEventListener('ended', save)
      window.removeEventListener('beforeunload', save)
      document.removeEventListener('visibilitychange', onVis)
      void save()
      if (watchAccRef.current >= 1) {
        void addWatchSeconds('video', Math.floor(watchAccRef.current))
      }
    }
  }, [item.id, item.duration, progress?.duration, progress?.page, progress?.remindDismissed])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const sync = () => {
      setCurrentTime(video.currentTime || 0)
      setDuration(video.duration || progress?.duration || item.duration || 0)
    }
    sync()

    video.addEventListener('timeupdate', sync)
    video.addEventListener('durationchange', sync)
    video.addEventListener('loadedmetadata', sync)
    return () => {
      video.removeEventListener('timeupdate', sync)
      video.removeEventListener('durationchange', sync)
      video.removeEventListener('loadedmetadata', sync)
    }
  }, [item.id, item.duration, progress?.duration])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const video = videoRef.current
      if (!video) return
      if (e.key === 'Escape') onClose()
      if (e.key === ' ' || e.key === 'k') {
        e.preventDefault()
        if (video.paused) void video.play()
        else video.pause()
      }
      if (e.key === 'ArrowLeft' || e.key === 'j') video.currentTime = Math.max(0, video.currentTime - 10)
      if (e.key === 'ArrowRight' || e.key === 'l') video.currentTime = Math.min(video.duration || 1e9, video.currentTime + 10)
      if (e.key === 'f') {
        void toggleFullscreen()
      }
      if (e.key === 'm') video.muted = !video.muted
      if (e.key === '[') {
        const idx = SPEEDS.indexOf(baseSpeedRef.current)
        const next = SPEEDS[Math.max(0, (idx === -1 ? 0 : idx) - 1)]
        setBaseSpeed(next)
      }
      if (e.key === ']') {
        const idx = SPEEDS.indexOf(baseSpeedRef.current)
        const next = SPEEDS[Math.min(SPEEDS.length - 1, (idx === -1 ? 0 : idx) + 1)]
        setBaseSpeed(next)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function setBaseSpeed(rate: number) {
    baseSpeedRef.current = rate
    setSpeed(rate)
    const video = videoRef.current
    if (video && !holdBoostRef.current) video.playbackRate = rate
    void db.settings.update('settings', { lastSpeed: rate })
  }

  function flash(text: string) {
    setBadge(text)
    window.setTimeout(() => setBadge(null), 700)
  }

  function seekBy(delta: number) {
    const video = videoRef.current
    if (!video) return
    video.currentTime = Math.max(0, Math.min(video.duration || 1e9, video.currentTime + delta))
    skipAccRef.current += delta
    flash(`${skipAccRef.current > 0 ? '+' : ''}${skipAccRef.current}s`)
  }

  function formatTime(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds < 0) seconds = 0
    const total = Math.round(seconds)
    const h = Math.floor(total / 3600)
    const m = Math.floor((total % 3600) / 60)
    const s = total % 60
    const mm = h > 0 ? String(m).padStart(2, '0') : String(m)
    const ss = String(s).padStart(2, '0')
    return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
  }

  function timeFromClientX(clientX: number): number {
    const bar = seekBarRef.current
    if (!bar || !duration) return 0
    const rect = bar.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    return ratio * duration
  }

  function onSeekBarPointerDown(e: React.PointerEvent) {
    e.stopPropagation()
    if (!duration) return
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    const t = timeFromClientX(e.clientX)
    setIsScrubbing(true)
    setScrubTime(t)
    setShowChrome(true)
  }

  function onSeekBarPointerMove(e: React.PointerEvent) {
    if (!isScrubbing) return
    e.stopPropagation()
    setScrubTime(timeFromClientX(e.clientX))
  }

  function onSeekBarPointerUp(e: React.PointerEvent) {
    if (!isScrubbing) return
    e.stopPropagation()
    const video = videoRef.current
    const t = timeFromClientX(e.clientX)
    if (video) video.currentTime = t
    setCurrentTime(t)
    setIsScrubbing(false)
  }

  function sideOf(clientX: number, width: number): 'left' | 'right' {
    return clientX < width / 2 ? 'left' : 'right'
  }

  function clearSeekHold() {
    if (seekHoldRef.current) {
      window.clearInterval(seekHoldRef.current)
      seekHoldRef.current = null
    }
  }

  function onPointerDown(e: React.PointerEvent) {
    const el = e.currentTarget as HTMLElement
    const rect = el.getBoundingClientRect()
    const side = sideOf(e.clientX, rect.width)
    pointerDownRef.current = { x: e.clientX, y: e.clientY, t: Date.now(), side }
    skipAccRef.current = 0

    longPressTimer.current = window.setTimeout(() => {
      const video = videoRef.current
      if (!video || seekHoldRef.current) return
      holdBoostRef.current = true
      const boosted = Math.min(baseSpeedRef.current * 2, 8)
      video.playbackRate = boosted
      setBadge(`${boosted}x`)
    }, 420)
  }

  function onPointerUp(_e: React.PointerEvent) {
    if (longPressTimer.current) {
      window.clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }

    const video = videoRef.current
    const down = pointerDownRef.current
    pointerDownRef.current = null

    if (holdBoostRef.current && video) {
      holdBoostRef.current = false
      video.playbackRate = baseSpeedRef.current
      setBadge(null)
      clearSeekHold()
      return
    }

    if (seekHoldRef.current) {
      clearSeekHold()
      skipAccRef.current = 0
      return
    }

    if (!down || !video) return
    const elapsed = Date.now() - down.t
    if (elapsed > 350) return

    const now = Date.now()
    const last = lastTapRef.current
    const isDouble = last && now - last.t < 300 && last.side === down.side

    if (isDouble) {
      const delta = down.side === 'left' ? -10 : 10
      skipAccRef.current = 0
      seekBy(delta)
      seekHoldRef.current = window.setInterval(() => seekBy(delta), 400)
      lastTapRef.current = null
      return
    }

    lastTapRef.current = { t: now, side: down.side }
    window.setTimeout(() => {
      const cur = lastTapRef.current
      if (cur && cur.t === now) {
        if (menuOpenRef.current) {
          setMenuOpen(false)
          setMenuPanel('root')
        } else if (video.paused) void video.play()
        else video.pause()
        setShowChrome(true)
        lastTapRef.current = null
      }
    }, 280)
  }

  function onPointerLeave() {
    if (longPressTimer.current) {
      window.clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
    if (holdBoostRef.current && videoRef.current) {
      holdBoostRef.current = false
      videoRef.current.playbackRate = baseSpeedRef.current
      setBadge(null)
    }
    clearSeekHold()
  }

  async function changeLevel(index: number) {
    setLevel(index)
    const hls = hlsRef.current
    if (hls) {
      hls.currentLevel = index
      const height = hls.levels[index]?.height
      if (height) await db.settings.update('settings', { lastQualityHeight: height })
    }
  }

  async function pip() {
    const video = videoRef.current
    if (!video) return
    if (document.pictureInPictureElement) await document.exitPictureInPicture()
    else if (document.pictureInPictureEnabled) await video.requestPictureInPicture()
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
        try {
          screen.orientation?.unlock?.()
        } catch {
          /* ignore */
        }
        setForceLandscapeCss(false)
        return
      }
      const el = stageRef.current
      if (!el) return
      await el.requestFullscreen()
      try {
        await screen.orientation?.lock?.('landscape')
        setForceLandscapeCss(false)
      } catch {
        const portrait = window.matchMedia('(orientation: portrait)').matches
        setForceLandscapeCss(portrait)
      }
    } catch {
      /* ignore unsupported / denied */
    }
  }

  return (
    <div className="player-screen">
      <div className="player-top" style={{ opacity: showChrome || menuOpen ? 1 : 0, transition: 'opacity 0.2s' }}>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
          ←
        </button>
        <h1>{item.title}</h1>
        <button type="button" className="icon-btn" onClick={() => void pip()} aria-label="PiP">
          PiP
        </button>
      </div>
      <div
        className={`player-stage${forceLandscapeCss ? ' force-landscape' : ''}`}
        ref={stageRef}
      >
        <video ref={videoRef} playsInline />
        <div
          className="gesture-layer"
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerLeave}
          onPointerLeave={onPointerLeave}
        />
        {badge && <div className="gesture-badge">{badge}</div>}
        {isPaused && (settings.pauseTintEnabled ?? true) && (
          <div
            className="pause-tint"
            aria-hidden
            style={{ ['--pause-tint' as string]: settings.pauseTintColor || '#6b7280' }}
          />
        )}
        {isPaused && settings.pauseIconEnabled && (
          <div className="pause-icon-badge" aria-hidden>
            <svg viewBox="0 0 24 24" width="40" height="40" fill="currentColor">
              <path d="M8 5h3v14H8V5zm5 0h3v14h-3V5z" />
            </svg>
          </div>
        )}

        {(isPaused || menuOpen || isScrubbing) && (
          <div
            className="video-progress-wrap"
            style={{ ['--progress-color' as string]: settings.progressBarColor || '#3b82f6' }}
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
          >
            <div className="video-progress-time">
              -{formatTime(Math.max(0, duration - (isScrubbing ? scrubTime : currentTime)))}
            </div>
            <div
              className="video-progress-bar"
              ref={seekBarRef}
              onPointerDown={onSeekBarPointerDown}
              onPointerMove={onSeekBarPointerMove}
              onPointerUp={onSeekBarPointerUp}
              onPointerCancel={onSeekBarPointerUp}
              role="slider"
              aria-label="Seek"
              aria-valuemin={0}
              aria-valuemax={duration}
              aria-valuenow={isScrubbing ? scrubTime : currentTime}
            >
              <div className="video-progress-track">
                <div
                  className="video-progress-fill"
                  style={{
                    width: `${duration ? (Math.min(isScrubbing ? scrubTime : currentTime, duration) / duration) * 100 : 0}%`,
                  }}
                />
                <div
                  className="video-progress-knob"
                  style={{
                    left: `${duration ? (Math.min(isScrubbing ? scrubTime : currentTime, duration) / duration) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {(showChrome || menuOpen) && (
          <div className="yt-controls" onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()}>
            {menuOpen && (
              <div className="yt-menu" role="menu">
                {menuPanel === 'root' && (
                  <>
                    <button type="button" className="yt-menu-row" onClick={() => setMenuPanel('speed')}>
                      <span>Playback speed</span>
                      <span className="yt-menu-value">
                        {speed === 1 ? 'Normal' : `${speed}`} <span aria-hidden>›</span>
                      </span>
                    </button>
                    {levels.length > 0 && (
                      <button type="button" className="yt-menu-row" onClick={() => setMenuPanel('quality')}>
                        <span>Quality</span>
                        <span className="yt-menu-value">
                          {levels.find((l) => l.index === level)?.height
                            ? `${levels.find((l) => l.index === level)!.height}p`
                            : 'Auto'}{' '}
                          <span aria-hidden>›</span>
                        </span>
                      </button>
                    )}
                  </>
                )}
                {menuPanel === 'speed' && (
                  <>
                    <button type="button" className="yt-menu-back" onClick={() => setMenuPanel('root')}>
                      ‹ Playback speed
                    </button>
                    {SPEEDS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        className={`yt-menu-option ${speed === s ? 'active' : ''}`}
                        onClick={() => {
                          setBaseSpeed(s)
                          setMenuOpen(false)
                          setMenuPanel('root')
                        }}
                      >
                        <span className="yt-check">{speed === s ? '✓' : ''}</span>
                        {s === 1 ? 'Normal' : s}
                      </button>
                    ))}
                  </>
                )}
                {menuPanel === 'quality' && (
                  <>
                    <button type="button" className="yt-menu-back" onClick={() => setMenuPanel('root')}>
                      ‹ Quality
                    </button>
                    {[...levels].reverse().map((l) => (
                      <button
                        key={l.index}
                        type="button"
                        className={`yt-menu-option ${level === l.index ? 'active' : ''}`}
                        onClick={() => {
                          void changeLevel(l.index)
                          setMenuOpen(false)
                          setMenuPanel('root')
                        }}
                      >
                        <span className="yt-check">{level === l.index ? '✓' : ''}</span>
                        {l.height}p
                      </button>
                    ))}
                  </>
                )}
              </div>
            )}

            <div className="yt-bar">
              <button
                type="button"
                className={`yt-gear ${menuOpen ? 'open' : ''}`}
                aria-label="Settings"
                onClick={() => {
                  setMenuOpen((o) => !o)
                  setMenuPanel('root')
                  setShowChrome(true)
                }}
              >
                <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden>
                  <path d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.58-.22l-2.39.96a7.2 7.2 0 0 0-1.62-.94l-.36-2.54a.48.48 0 0 0-.48-.41h-3.84a.48.48 0 0 0-.48.41l-.36 2.54c-.57.22-1.11.53-1.62.94l-2.39-.96a.49.49 0 0 0-.58.22L2.74 8.87a.48.48 0 0 0 .12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94L2.86 14.5a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.3.58.22l2.39-.96c.5.41 1.05.73 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.48-.41l.36-2.54c.57-.22 1.11-.53 1.62-.94l2.39.96c.22.08.46 0 .58-.22l1.92-3.32a.49.49 0 0 0-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2z" />
                </svg>
              </button>
              <button
                type="button"
                className="yt-gear"
                aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                onClick={() => void toggleFullscreen()}
              >
                {isFullscreen ? (
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden>
                    <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden>
                    <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
