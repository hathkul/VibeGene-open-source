// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultConstructProperties } from '../../domain/constructProperties'
import { defaultEnzymePreferences } from '../../domain/enzymePreferences'
import type { SequenceRecord } from '../../domain/types'
import type { EnzymeSetWorkflowController } from '../hooks/useEnzymeSetWorkflowController'
import { EnzymeDialogsHost } from './EnzymeDialogsHost'

function dnaRecord(): SequenceRecord {
  return {
    id: 'rec-1',
    name: 'Test.dna',
    description: '',
    molecule: 'dna',
    topology: 'linear',
    sequence: 'ACGT',
    features: [],
    primers: [],
    operations: [],
    construct: { ...defaultConstructProperties },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

function emptyWorkflow(overrides: Partial<EnzymeSetWorkflowController> = {}): EnzymeSetWorkflowController {
  return {
    chooseDraft: null,
    setChooseDraft: vi.fn(),
    applyChooseDraftPatch: vi.fn(),
    openChoose: vi.fn(),
    confirmChoose: vi.fn(),
    selectSet: vi.fn(),
    selectSupplier: vi.fn(),
    selectSavedSet: vi.fn(),
    selectFileSet: vi.fn(),
    toggleVisibility: vi.fn(),
    activeEnzymeSetExport: { name: 'All', enzymeNames: [] },
    saveSetOpen: false,
    setSaveSetOpen: vi.fn(),
    saveSetName: '',
    setSaveSetName: vi.fn(),
    saveSetScope: 'global',
    setSaveSetScope: vi.fn(),
    openSaveSet: vi.fn(),
    confirmSaveSet: vi.fn(),
    exportSet: vi.fn(),
    manageSetsOpen: false,
    setManageSetsOpen: vi.fn(),
    confirmManageSets: vi.fn(),
    updateFileEnzymeSets: vi.fn(),
    noncuttersOpen: false,
    setNoncuttersOpen: vi.fn(),
    ...overrides,
  }
}

describe('EnzymeDialogsHost', () => {
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  beforeEach(() => {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })

  it('renders enzyme info dialog when a name is set', () => {
    act(() => {
      root.render(
        <EnzymeDialogsHost
          record={dnaRecord()}
          selectedRange={null}
          enzymePreferences={defaultEnzymePreferences}
          onPreferencesChange={vi.fn()}
          enzymeSetWorkflow={emptyWorkflow()}
          enzymeInfoName="EcoRI"
          setEnzymeInfoName={vi.fn()}
          enzymePrioritiesOpen={false}
          setEnzymePrioritiesOpen={vi.fn()}
          onSavePriorities={vi.fn()}
          parentalCounts={{}}
          noncutters={[]}
          onEnzymeInfo={vi.fn()}
          onDownloadText={vi.fn()}
        />,
      )
    })
    expect(host.querySelector('.enzyme-info-dialog')).toBeTruthy()
  })

  it('calls enzymeSetWorkflow.confirmSaveSet from the save-set dialog', () => {
    const confirmSaveSet = vi.fn()
    act(() => {
      root.render(
        <EnzymeDialogsHost
          record={dnaRecord()}
          selectedRange={null}
          enzymePreferences={defaultEnzymePreferences}
          onPreferencesChange={vi.fn()}
          enzymeSetWorkflow={emptyWorkflow({
            saveSetOpen: true,
            saveSetName: 'Lab set',
            activeEnzymeSetExport: { name: 'All', enzymeNames: ['EcoRI'] },
            confirmSaveSet,
          })}
          enzymeInfoName={null}
          setEnzymeInfoName={vi.fn()}
          enzymePrioritiesOpen={false}
          setEnzymePrioritiesOpen={vi.fn()}
          onSavePriorities={vi.fn()}
          parentalCounts={{}}
          noncutters={[]}
          onEnzymeInfo={vi.fn()}
          onDownloadText={vi.fn()}
        />,
      )
    })
    const saveButton = host.querySelector('.enzyme-save-set-dialog button.primary') as HTMLButtonElement | null
    expect(saveButton).toBeTruthy()
    act(() => {
      saveButton!.click()
    })
    expect(confirmSaveSet).toHaveBeenCalledOnce()
  })
})
