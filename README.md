# Endi's Media

**Version:** 1.0.5

## About

Endi's Media is a local-first progressive web app (PWA) for organizing and watching lecture streams, PDFs, and other media links on your device.

You add folders, paste links (HLS `.m3u8`, MP4, PDF, images, and more), and the app keeps resume progress, completion marks, daily watch time, and your preferences in the browser — no account or server required. Playback is built for data-saving defaults (lowest quality first), custom speeds (including 3x/4x), and tap/hold gestures instead of a crowded control bar. You can install it like an app from the browser, theme it (dark/light + wallpaper), and back up your library with export/import.

Typical use: keep course lecture `.m3u8` links and PDFs in folders, continue where you left off, and get a gentle reminder for unfinished videos.

### Run locally

```bash
cd media-library
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173/`).

```bash
npm run build
npm run preview
```

---

## Updates summary

### v1.0.5

- Custom color pickers (pause tint, progress bar) now use a color wheel — hue/saturation ring plus a brightness slider — via `@uiw/react-color-wheel`, replacing the native browser color input
- Player: the seek/progress bar under the video is now hidden during playback and only shows while paused (or while scrubbing / with the settings menu open), instead of always being visible

### v1.0.4

- Settings: pause tint on/off, tint color presets + custom picker, optional pause icon

### v1.0.3

- While paused: keep subtle grey edge tint; removed pause icon

### v1.0.2

- Pause feedback: subtle grey edge tint + pause icon that fade out within 0.5s

### v1.0.1

- Removed the duplicate fullscreen button from the player top bar (fullscreen stays bottom-right only)

### v1.0.0 — Initial release

- Folder library with add-link flow and type detection (video / PDF / image / audio / link)
- Resume progress, completion ticks, continue-watching row, and search within folders
- HLS/MP4 player with lowest-quality default, speed presets, PiP, and keyboard shortcuts
- Gesture controls: tap play/pause, double-tap ±10s (hold to repeat), hold for temporary 2x/4x/8x
- Blue unfinished-video reminder (remind later / don’t remind again)
- Daily watch-time tracking for videos and PDFs
- Settings: dark/light theme, wallpaper presets or upload, top-bar transparency, storage usage, export/import, clear downloads/data
- Multi-select / select-all with delete from library or delete downloads only
- PDF viewer (pdf.js) and simple image viewer; optional PDF offline cache
- PWA manifest + service worker for installability
- YouTube-style gear menu for playback speed and quality
- Splash screen waits until wallpaper is fully loaded
- Fullscreen button; fullscreen prefers landscape (system lock, CSS fallback if needed)
- Version label on the home screen (bottom right)
