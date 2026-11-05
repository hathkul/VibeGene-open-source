import { ChevronDown } from 'lucide-react'
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

export type DbToolbarModeOption<T extends string> = {
  id: T
  label: string
  title: string
  icon: ReactNode
  available?: boolean
  disabled?: boolean
}

const DbToolbarMenuContext = createContext<{
  openMenuId: string | null
  setOpenMenuId: (id: string | null) => void
} | null>(null)

export function DbToolbarMenuProvider({ children }: { children: ReactNode }) {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const value = useMemo(() => ({ openMenuId, setOpenMenuId }), [openMenuId])
  return <DbToolbarMenuContext.Provider value={value}>{children}</DbToolbarMenuContext.Provider>
}

export function DbToolbarModeGroup<T extends string>({
  menuId,
  modes,
  value,
  onChange,
  disabled,
  onRun,
}: {
  menuId: string
  modes: DbToolbarModeOption<T>[]
  value: T
  onChange: (id: T) => void
  disabled?: boolean
  onRun: (id: T, event: { shiftKey: boolean }) => void
}) {
  const menuContext = useContext(DbToolbarMenuContext)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const available = modes.filter((mode) => mode.available !== false)
  const active = available.find((mode) => mode.id === value) ?? available[0]
  const open = menuContext?.openMenuId === menuId

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        menuContext?.setOpenMenuId(null)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') menuContext?.setOpenMenuId(null)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [menuContext, open])

  if (!active) return null

  return (
    <div className={`db-toolbar-mode-group${open ? ' is-open' : ''}`} ref={rootRef}>
      <button
        type="button"
        className="db-toolbar-mode-main"
        disabled={disabled || active.disabled}
        title={active.title}
        onClick={(event) => onRun(active.id, event)}
      >
        {active.icon}
        <span>{active.label}</span>
      </button>
      {available.length > 1 && (
        <>
          <button
            type="button"
            className={`db-toolbar-mode-chevron${open ? ' is-open' : ''}`}
            disabled={disabled}
            aria-label={`Choose ${active.label} mode`}
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={() => menuContext?.setOpenMenuId(open ? null : menuId)}
          >
            <ChevronDown size={14} />
          </button>
          {open && (
            <div className="db-toolbar-mode-menu" role="menu">
              {available.map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  role="menuitem"
                  className={mode.id === active.id ? 'is-active' : undefined}
                  title={mode.title}
                  disabled={disabled || mode.disabled}
                  onClick={(event) => {
                    if (mode.disabled) return
                    onChange(mode.id)
                    menuContext?.setOpenMenuId(null)
                    onRun(mode.id, event)
                  }}
                >
                  {mode.icon}
                  <span>{mode.label}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
