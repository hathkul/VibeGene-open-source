// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { groupSgRNAFeatures } from '../src/domain/sgrna'
import { serializeFeatureQualifiers } from '../src/domain/featureQualifiers'
import type { PrimerPaneSgRnaRow } from '../src/domain/primerPaneEntries'
import type { SequenceFeature } from '../src/domain/types'
import { usePrimerOrSgRnaDeleteCommand } from '../src/presentation/hooks/usePrimerOrSgRnaDeleteCommand'

function sgRnaFeatures(tag: string): [SequenceFeature, SequenceFeature] {
  const common = { vibegene_sgrna_id: tag, vibegene_sgrna: '1' }
  const guide: SequenceFeature = {
    id: `guide-${tag}`,
    name: tag,
    type: 'misc_feature',
    color: 'sgrna-green',
    locations: [{ start: 0, end: 20, strand: 'forward' }],
    notes: serializeFeatureQualifiers({ ...common, vibegene_sgrna_part: 'guide' }),
  }
  const pam: SequenceFeature = {
    id: `pam-${tag}`,
    name: `${tag} PAM`,
    type: 'misc_feature',
    color: 'sgrna-green',
    locations: [{ start: 20, end: 23, strand: 'forward' }],
    notes: serializeFeatureQualifiers({ ...common, vibegene_sgrna_part: 'pam' }),
  }
  return [guide, pam]
}

function sgRnaPaneRow(tag: string): PrimerPaneSgRnaRow {
  const [guide, pam] = sgRnaFeatures(tag)
  const annotation = groupSgRNAFeatures([guide, pam])[0]!
  return { kind: 'sgrna', key: `sgrna-${tag}`, memberId: null, annotation }
}

describe('usePrimerOrSgRnaDeleteCommand', () => {
  let cleanup: (() => void) | null = null
  afterEach(() => {
    cleanup?.()
    cleanup = null
  })

  function mountCommand(options: {
    selectedPaneSgRna?: PrimerPaneSgRnaRow
    deleteSelectedFeature?: () => void
    removeSelectedPrimers?: () => void
  }) {
    const deleteSelectedFeature = options.deleteSelectedFeature ?? vi.fn()
    const removeSelectedPrimers = options.removeSelectedPrimers ?? vi.fn()
    const view = { deleteSelectedPrimerOrSgRna: null as (() => void) | null }

    function Harness() {
      view.deleteSelectedPrimerOrSgRna = usePrimerOrSgRnaDeleteCommand({
        selectedPaneSgRna: options.selectedPaneSgRna,
        deleteSelectedFeature,
        removeSelectedPrimers,
      })
      return null
    }

    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    act(() => root.render(<Harness />))
    cleanup = () => act(() => root.unmount())

    return { view, deleteSelectedFeature, removeSelectedPrimers }
  }

  it('routes mixed-pane delete to feature removal when an sgRNA row is selected', () => {
    const env = mountCommand({ selectedPaneSgRna: sgRnaPaneRow('g1') })

    act(() => env.view.deleteSelectedPrimerOrSgRna!())

    expect(env.deleteSelectedFeature).toHaveBeenCalledOnce()
    expect(env.removeSelectedPrimers).not.toHaveBeenCalled()
  })

  it('routes mixed-pane delete to primer removal when no sgRNA row is selected', () => {
    const env = mountCommand({})

    act(() => env.view.deleteSelectedPrimerOrSgRna!())

    expect(env.removeSelectedPrimers).toHaveBeenCalledOnce()
    expect(env.deleteSelectedFeature).not.toHaveBeenCalled()
  })

  it('does not invoke feature deletion when sgRNA pane selection is absent', () => {
    const env = mountCommand({ selectedPaneSgRna: undefined })

    act(() => env.view.deleteSelectedPrimerOrSgRna!())

    expect(env.removeSelectedPrimers).toHaveBeenCalledOnce()
    expect(env.deleteSelectedFeature).not.toHaveBeenCalled()
  })
})
