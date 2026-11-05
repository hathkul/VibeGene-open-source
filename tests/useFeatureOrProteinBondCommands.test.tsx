// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { labPlasmid } from '../src/domain/fixtures'
import type { SequenceFeature } from '../src/domain/types'
import { useFeatureOrProteinBondCommands } from '../src/presentation/hooks/useFeatureOrProteinBondCommands'

const fixtureFeatureColor = labPlasmid.features.find((entry) => entry.type === 'misc_feature')!.color

function feature(id: string): SequenceFeature {
  return {
    id,
    name: id,
    type: 'misc_feature',
    color: fixtureFeatureColor,
    locations: [{ start: 0, end: 1, strand: 'forward' }],
  }
}

describe('useFeatureOrProteinBondCommands', () => {
  let cleanup: (() => void) | null = null
  afterEach(() => {
    cleanup?.()
    cleanup = null
  })

  function mountCommands(options: Partial<Parameters<typeof useFeatureOrProteinBondCommands>[0]> = {}) {
    const deleteProteinBond = vi.fn()
    const deleteSelectedFeature = vi.fn()
    const openProteinBondEditor = vi.fn()
    const openFeatureEditorForFeature = vi.fn()
    const view = {
      deleteSelectedFeatureOrBond: null as (() => void) | null,
      editSelectedFeatureProperties: null as (() => void) | null,
    }

    function Harness() {
      const commands = useFeatureOrProteinBondCommands({
        selectedProteinBondId: options.selectedProteinBondId ?? null,
        selectedFeature: options.selectedFeature ?? null,
        recordIsDnaLibrary: options.recordIsDnaLibrary ?? false,
        featureTabSelectionMemberId: options.featureTabSelectionMemberId,
        deleteProteinBond,
        deleteSelectedFeature,
        openProteinBondEditor,
        openFeatureEditorForFeature,
      })
      view.deleteSelectedFeatureOrBond = commands.deleteSelectedFeatureOrBond
      view.editSelectedFeatureProperties = commands.editSelectedFeatureProperties
      return null
    }

    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    act(() => root.render(<Harness />))
    cleanup = () => act(() => root.unmount())

    return { view, deleteProteinBond, deleteSelectedFeature, openProteinBondEditor, openFeatureEditorForFeature }
  }

  it('prefers bond deletion over feature deletion', () => {
    const env = mountCommands({ selectedProteinBondId: 'bond-1', selectedFeature: feature('feature-1') })
    act(() => env.view.deleteSelectedFeatureOrBond!())
    expect(env.deleteProteinBond).toHaveBeenCalledWith('bond-1')
    expect(env.deleteSelectedFeature).not.toHaveBeenCalled()
  })

  it('falls back to feature deletion when no bond is selected', () => {
    const env = mountCommands({ selectedFeature: feature('feature-1') })
    act(() => env.view.deleteSelectedFeatureOrBond!())
    expect(env.deleteSelectedFeature).toHaveBeenCalledOnce()
    expect(env.deleteProteinBond).not.toHaveBeenCalled()
  })

  it('prefers bond edit over feature edit', () => {
    const env = mountCommands({ selectedProteinBondId: 'bond-1', selectedFeature: feature('feature-1') })
    act(() => env.view.editSelectedFeatureProperties!())
    expect(env.openProteinBondEditor).toHaveBeenCalledWith('bond-1')
    expect(env.openFeatureEditorForFeature).not.toHaveBeenCalled()
  })

  it('opens the feature editor with library member context when no bond is selected', () => {
    const env = mountCommands({
      selectedFeature: feature('feature-1'),
      recordIsDnaLibrary: true,
      featureTabSelectionMemberId: 'member-1',
    })
    act(() => env.view.editSelectedFeatureProperties!())
    expect(env.openFeatureEditorForFeature).toHaveBeenCalledWith('feature-1', { libraryMemberId: 'member-1' })
  })

  it('opens the feature editor with null library member context for non-library records', () => {
    const env = mountCommands({ selectedFeature: feature('feature-1'), recordIsDnaLibrary: false })
    act(() => env.view.editSelectedFeatureProperties!())
    expect(env.openFeatureEditorForFeature).toHaveBeenCalledWith('feature-1', { libraryMemberId: null })
  })

  it('does not open editors when neither bond nor feature is selected', () => {
    const env = mountCommands()
    act(() => env.view.editSelectedFeatureProperties!())
    expect(env.openProteinBondEditor).not.toHaveBeenCalled()
    expect(env.openFeatureEditorForFeature).not.toHaveBeenCalled()
  })

  it('keeps callback identity when options are field-equivalent on rerender', () => {
    const deleteProteinBond = vi.fn()
    const deleteSelectedFeature = vi.fn()
    const openProteinBondEditor = vi.fn()
    const openFeatureEditorForFeature = vi.fn()
    const view = {
      deleteSelectedFeatureOrBond: null as (() => void) | null,
      editSelectedFeatureProperties: null as (() => void) | null,
    }

    const selectedFeature = feature('feature-1')

    function Harness() {
      const commands = useFeatureOrProteinBondCommands({
        selectedProteinBondId: null,
        selectedFeature,
        recordIsDnaLibrary: true,
        featureTabSelectionMemberId: 'member-1',
        deleteProteinBond,
        deleteSelectedFeature,
        openProteinBondEditor,
        openFeatureEditorForFeature,
      })
      view.deleteSelectedFeatureOrBond = commands.deleteSelectedFeatureOrBond
      view.editSelectedFeatureProperties = commands.editSelectedFeatureProperties
      return null
    }

    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    act(() => root.render(<Harness />))
    const firstDelete = view.deleteSelectedFeatureOrBond
    const firstEdit = view.editSelectedFeatureProperties
    act(() => root.render(<Harness />))
    expect(view.deleteSelectedFeatureOrBond).toBe(firstDelete)
    expect(view.editSelectedFeatureProperties).toBe(firstEdit)
    act(() => root.unmount())
  })

  it('routes delete to the current bond id after rerender', () => {
    const deleteProteinBond = vi.fn()
    const deleteSelectedFeature = vi.fn()
    const openProteinBondEditor = vi.fn()
    const openFeatureEditorForFeature = vi.fn()
    const selectedFeature = feature('feature-1')
    const view = {
      deleteSelectedFeatureOrBond: null as (() => void) | null,
    }

    function Harness({ bondId }: { bondId: string | null }) {
      const commands = useFeatureOrProteinBondCommands({
        selectedProteinBondId: bondId,
        selectedFeature,
        recordIsDnaLibrary: false,
        featureTabSelectionMemberId: undefined,
        deleteProteinBond,
        deleteSelectedFeature,
        openProteinBondEditor,
        openFeatureEditorForFeature,
      })
      view.deleteSelectedFeatureOrBond = commands.deleteSelectedFeatureOrBond
      return null
    }

    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    act(() => root.render(<Harness bondId="bond-1" />))
    const firstDelete = view.deleteSelectedFeatureOrBond
    act(() => root.render(<Harness bondId="bond-2" />))
    expect(view.deleteSelectedFeatureOrBond).not.toBe(firstDelete)
    act(() => view.deleteSelectedFeatureOrBond!())
    expect(deleteProteinBond).toHaveBeenCalledWith('bond-2')
    expect(deleteSelectedFeature).not.toHaveBeenCalled()
    act(() => root.unmount())
  })

  it('keeps delete stable while edit changes for library member context', () => {
    const deleteProteinBond = vi.fn()
    const deleteSelectedFeature = vi.fn()
    const openProteinBondEditor = vi.fn()
    const openFeatureEditorForFeature = vi.fn()
    const selectedFeature = feature('feature-1')
    const view = {
      deleteSelectedFeatureOrBond: null as (() => void) | null,
      editSelectedFeatureProperties: null as (() => void) | null,
    }

    function Harness({ memberId }: { memberId: string | null }) {
      const commands = useFeatureOrProteinBondCommands({
        selectedProteinBondId: null,
        selectedFeature,
        recordIsDnaLibrary: true,
        featureTabSelectionMemberId: memberId,
        deleteProteinBond,
        deleteSelectedFeature,
        openProteinBondEditor,
        openFeatureEditorForFeature,
      })
      view.deleteSelectedFeatureOrBond = commands.deleteSelectedFeatureOrBond
      view.editSelectedFeatureProperties = commands.editSelectedFeatureProperties
      return null
    }

    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    act(() => root.render(<Harness memberId="member-1" />))
    const firstDelete = view.deleteSelectedFeatureOrBond
    const firstEdit = view.editSelectedFeatureProperties
    act(() => root.render(<Harness memberId="member-2" />))
    expect(view.deleteSelectedFeatureOrBond).toBe(firstDelete)
    expect(view.editSelectedFeatureProperties).not.toBe(firstEdit)
    act(() => view.editSelectedFeatureProperties!())
    expect(openFeatureEditorForFeature).toHaveBeenCalledWith('feature-1', { libraryMemberId: 'member-2' })
    act(() => root.unmount())
  })
})
