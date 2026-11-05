type MobilePaneOption<T extends string> = {
  id: T
  label: string
}

export function MobilePaneTabs<T extends string>({
  label,
  panes,
  value,
  onChange,
  className = '',
}: {
  label: string
  panes: readonly MobilePaneOption<T>[]
  value: T
  onChange: (id: T) => void
  className?: string
}) {
  return (
    <div
      className={`mobile-cloning-pane-tabs${panes.length === 2 ? ' is-two-pane' : ''}${className ? ` ${className}` : ''}`}
      role="toolbar"
      aria-label={label}
    >
      {panes.map((pane) => (
        <button
          key={pane.id}
          type="button"
          className={value === pane.id ? 'is-active' : undefined}
          aria-pressed={value === pane.id}
          onClick={() => onChange(pane.id)}
        >
          {pane.label}
        </button>
      ))}
    </div>
  )
}
