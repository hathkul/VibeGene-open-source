import { useEffect, useId, useRef, useState } from 'react'

export function GuideScanMetricHelp({
  label,
  children,
}: {
  label: string
  children: string
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLSpanElement>(null)
  const popoverId = useId()

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [open])

  return (
    <span className="guidescan-metric-help" ref={rootRef}>
      <button
        type="button"
        className="guidescan-metric-help-trigger"
        aria-label={label}
        aria-expanded={open}
        aria-controls={popoverId}
        onClick={() => setOpen((value) => !value)}
      >
        (i)
      </button>
      {open ? (
        <span id={popoverId} role="tooltip" className="guidescan-metric-help-popover">
          {children}
        </span>
      ) : null}
    </span>
  )
}
