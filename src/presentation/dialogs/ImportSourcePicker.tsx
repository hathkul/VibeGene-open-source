import { useRef, useState, type ReactNode } from 'react'
import { snapshotImportSourceTabs, type ImportSourceTab } from './importSourcePickerModel'
export type { ImportSourceTab } from './importSourcePickerModel'

type ImportSourcePickerProps = {
  title: string
  hint: string
  openTabs?: readonly ImportSourceTab[]
  onOpenTab?: (tab: ImportSourceTab) => void
  onChooseFile: (file: File) => void
  onChooseDatabase: () => void
  onCancel: () => void
  loading?: boolean
  children?: ReactNode
}

export function ImportSourcePicker({
  title,
  hint,
  openTabs = [],
  onOpenTab,
  onChooseFile,
  onChooseDatabase,
  onCancel,
  loading = false,
  children,
}: ImportSourcePickerProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [sourceTabs] = useState(() => snapshotImportSourceTabs(openTabs))

  return (
    <div className="translation-dialog-backdrop" role="presentation" onMouseDown={onCancel}>
      <div
        className="translation-dialog enzyme-dialog features-import-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h3>{title}</h3>
        <p className="features-import-hint">{hint}</p>

        {sourceTabs.length > 0 && onOpenTab ? (
          <div className="features-import-step">
            <h4>Open tabs</h4>
            <div className="features-import-projects">
              {sourceTabs.map((tab) => (
                <button
                  key={tab.tabId}
                  type="button"
                  className="features-import-project-button"
                  onClick={() => onOpenTab(tab)}
                  disabled={loading}
                  title={loading ? 'Scanning…' : `Import from ${tab.name}`}
                >
                  {tab.name}
                  {tab.molecule === 'protein' ? ' (protein)' : ''}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="features-import-actions features-import-source-actions">
          <button type="button" disabled={loading} onClick={() => fileInputRef.current?.click()}>
            Choose file…
          </button>
          <button type="button" disabled={loading} onClick={onChooseDatabase}>
            From database…
          </button>
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <input
            ref={fileInputRef}
            type="file"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) onChooseFile(file)
              event.currentTarget.value = ''
            }}
          />
        </div>
        {children}
      </div>
    </div>
  )
}
