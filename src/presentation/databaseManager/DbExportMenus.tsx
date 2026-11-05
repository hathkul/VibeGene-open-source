import { useEffect, useRef, useState } from 'react'
import { Download } from 'lucide-react'
import {
  DATABASE_PROJECT_EXPORT_OPTIONS,
  type DatabaseProjectExportFormat,
} from './types'

export type DbRowExportMenuProps = {
  projectName: string
  onExport: (format: DatabaseProjectExportFormat) => Promise<void>
  onStatus?: (message: string) => void
}

export function DbRowExportMenu({
  projectName,
  onExport,
  onStatus: notifyStatus,
}: DbRowExportMenuProps) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!open) return
    const place = () => {
      const button = buttonRef.current
      if (!button) return
      const rect = button.getBoundingClientRect()
      const menuWidth = 168
      const left = Math.min(
        Math.max(8, rect.right - menuWidth),
        window.innerWidth - menuWidth - 8,
      )
      const top = Math.min(rect.bottom + 3, window.innerHeight - 120)
      setMenuPos({ top, left })
    }
    place()
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  async function handleExport(format: DatabaseProjectExportFormat) {
    setBusy(true)
    notifyStatus?.('Working...')
    try {
      await onExport(format)
      setOpen(false)
    } catch (error) {
      notifyStatus?.(`Export failed: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div ref={rootRef} className={`db-file-export${open ? ' is-open' : ''}`}>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={busy}
        onClick={(event) => {
          event.stopPropagation()
          setOpen((current) => !current)
        }}
      >
        Export
      </button>
      {open && menuPos && (
        <div
          className="db-file-export-menu"
          role="menu"
          aria-label={`Export ${projectName}`}
          style={{ top: menuPos.top, left: menuPos.left }}
        >
          {DATABASE_PROJECT_EXPORT_OPTIONS.map((option) => (
            <button
              key={option.format}
              type="button"
              role="menuitem"
              disabled={busy}
              onClick={(event) => {
                event.stopPropagation()
                void handleExport(option.format)
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export type DbSelectionExportMenuProps = {
  selectionCount: number
  disabled?: boolean
  selectionTitle: string
  onExport: (format: DatabaseProjectExportFormat) => Promise<void>
  onStatus?: (message: string) => void
}

export function DbSelectionExportMenu({
  selectionCount,
  disabled,
  selectionTitle,
  onExport,
  onStatus: notifyStatus,
}: DbSelectionExportMenuProps) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const count = selectionCount

  useEffect(() => {
    if (!open) return
    const place = () => {
      const button = buttonRef.current
      if (!button) return
      const rect = button.getBoundingClientRect()
      const menuWidth = 168
      const left = Math.min(
        Math.max(8, rect.left),
        window.innerWidth - menuWidth - 8,
      )
      const top = Math.min(rect.bottom + 3, window.innerHeight - 120)
      setMenuPos({ top, left })
    }
    place()
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  async function handleExport(format: DatabaseProjectExportFormat) {
    setBusy(true)
    notifyStatus?.('Working...')
    try {
      await onExport(format)
      setOpen(false)
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error)
      if (/cancelled/i.test(text)) notifyStatus?.('Export cancelled.')
      else notifyStatus?.(`Export failed: ${text}`)
    } finally {
      setBusy(false)
    }
  }

  if (count < 1) return null

  return (
    <div ref={rootRef} className={`db-file-export db-selection-export${open ? ' is-open' : ''}`}>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled || busy}
        title={selectionTitle}
        onClick={(event) => {
          event.stopPropagation()
          setOpen((current) => !current)
        }}
      >
        <Download size={14} /> Export{count > 1 ? ` (${count})` : ''}
      </button>
      {open && menuPos && (
        <div
          className="db-file-export-menu"
          role="menu"
          aria-label="Export selected files"
          style={{ top: menuPos.top, left: menuPos.left }}
        >
          {DATABASE_PROJECT_EXPORT_OPTIONS.map((option) => (
            <button
              key={option.format}
              type="button"
              role="menuitem"
              disabled={busy}
              onClick={(event) => {
                event.stopPropagation()
                void handleExport(option.format)
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
