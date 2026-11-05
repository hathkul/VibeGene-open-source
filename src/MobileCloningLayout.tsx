import { useState, type ReactNode } from 'react'

type MobileCloningPane = 'workspace' | 'design' | 'setup'

export function MobileCloningLayout({
  children,
  designLabel = 'Design',
  className = '',
}: {
  children: ReactNode
  designLabel?: string
  className?: string
}) {
  const [pane, setPane] = useState<MobileCloningPane>('workspace')

  return (
    <div className={`restriction-cloning-layout mobile-cloning-layout mobile-pane-${pane}${className ? ` ${className}` : ''}`}>
      <div className="mobile-cloning-pane-tabs" role="toolbar" aria-label="Cloning workspace panes">
        <button
          type="button"
          className={pane === 'workspace' ? 'is-active' : undefined}
          aria-pressed={pane === 'workspace'}
          onClick={() => setPane('workspace')}
        >
          Main
        </button>
        <button
          type="button"
          className={pane === 'design' ? 'is-active' : undefined}
          aria-pressed={pane === 'design'}
          onClick={() => setPane('design')}
        >
          {designLabel}
        </button>
        <button
          type="button"
          className={pane === 'setup' ? 'is-active' : undefined}
          aria-pressed={pane === 'setup'}
          onClick={() => setPane('setup')}
        >
          Setup
        </button>
      </div>
      {children}
    </div>
  )
}
