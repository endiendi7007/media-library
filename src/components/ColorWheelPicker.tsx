import { useEffect, useRef, useState } from 'react'
import Wheel from '@uiw/react-color-wheel'
import ShadeSlider from '@uiw/react-color-shade-slider'
import { hexToHsva, hsvaToHex, type HsvaColor } from '@uiw/color-convert'

interface Props {
  /** Current color as a hex string, e.g. '#3b82f6' */
  value: string
  onChange: (hex: string) => void
  label?: string
}

/** A color-wheel based picker (hue + saturation ring, brightness slider) that
 * replaces the native <input type="color"> swatch used across Settings. */
export function ColorWheelPicker({ value, onChange, label = 'Custom' }: Props) {
  const [open, setOpen] = useState(false)
  const [hsva, setHsva] = useState<HsvaColor>(() => hexToHsva(value))
  const rootRef = useRef<HTMLDivElement>(null)

  // Stay in sync if the color changes from elsewhere (e.g. a preset swatch click)
  useEffect(() => {
    setHsva(hexToHsva(value))
  }, [value])

  // Close the panel on outside click/tap
  useEffect(() => {
    if (!open) return
    const onDocPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDocPointerDown)
    return () => document.removeEventListener('pointerdown', onDocPointerDown)
  }, [open])

  function commit(next: HsvaColor) {
    setHsva(next)
    onChange(hsvaToHex(next))
  }

  return (
    <div className="color-wheel-picker" ref={rootRef}>
      <button
        type="button"
        className="btn color-wheel-trigger"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`${label} color picker`}
      >
        <span className="color-wheel-trigger-swatch" style={{ background: value }} aria-hidden />
        {label}
      </button>

      {open && (
        <div className="color-wheel-panel">
          <Wheel
            color={hsva}
            width={168}
            height={168}
            onChange={(color) => commit({ ...hsva, ...color.hsva })}
          />
          <ShadeSlider
            hsva={hsva}
            style={{ width: '100%', marginTop: 16 }}
            onChange={(shade) => commit({ ...hsva, ...shade })}
          />
          <div className="color-wheel-preview">
            <span className="color-wheel-preview-swatch" style={{ background: hsvaToHex(hsva) }} aria-hidden />
            <span className="color-wheel-preview-hex">{hsvaToHex(hsva).toUpperCase()}</span>
          </div>
        </div>
      )}
    </div>
  )
}
