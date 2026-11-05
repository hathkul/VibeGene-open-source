// @vitest-environment jsdom

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, describe, expect, it } from 'vitest'
import { normalizeDna } from '../src/domain/sequence'
import type { Primer, SequenceRecord } from '../src/domain/types'
import { primerPropertiesPayloadFromLibrary } from '../src/application/primerWorkflow/primerPropertiesPayload'
import { primerPropertiesPayloadFromDatabaseRow } from '../src/storage/databasePrimers'
import { readPrimerPropertiesPayload, writeHybridPayload } from '../src/desktop/hybridWindows'
import { PrimerPropertiesDialog } from '../src/PrimerPropertiesDialog'

const TEMPLATE = 'ATGCGTACGTAGCCCCGGGG'
const PRIMER_SEQ = 'TTTTTATGCGTACGTAG'
const BINDINGS: Primer['bindings'] = [
  {
    strand: 'forward',
    templateStart: 0,
    templateEnd: 12,
    components: [
      { primerBases: 'TTTTT' },
      { primerBases: 'ATGCGTACGTAG', templateStart: 0, templateEnd: 12 },
    ],
  },
]

function demoRecord(): SequenceRecord {
  return {
    id: 'demo-record',
    name: 'Demo',
    description: '',
    sequence: TEMPLATE,
    topology: 'circular',
    molecule: 'dna',
    operations: [],
    primers: [
      {
        id: 'p1',
        name: 'Demo primer',
        sequence: PRIMER_SEQ,
        color: '#7c3aed',
        bindings: BINDINGS,
      },
    ],
    features: [],
  }
}

describe('primer properties payload host wiring', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('readPrimerPropertiesPayload keeps construct annealing fields from hybrid storage', () => {
    writeHybridPayload('primer-properties', {
      name: 'Demo primer',
      sequence: PRIMER_SEQ,
      templateSequence: TEMPLATE,
      preferredStrand: 'forward',
      bindings: BINDINGS,
    })
    expect(readPrimerPropertiesPayload()).toEqual({
      name: 'Demo primer',
      sequence: PRIMER_SEQ,
      color: undefined,
      description: undefined,
      templateSequence: TEMPLATE,
      preferredStrand: 'forward',
      bindings: BINDINGS,
    })
  })

  it('builds database construct rows with the template the source construct already has', async () => {
    const record = demoRecord()
    const payload = await primerPropertiesPayloadFromDatabaseRow(
      {
        key: 'demo',
        name: 'Demo primer',
        sequence: PRIMER_SEQ,
        color: '#7c3aed',
        description: '',
        sources: [{ projectId: record.id, projectName: record.name, folderId: null }],
      },
      async (projectId) => (projectId === record.id ? record : null),
    )
    expect(payload.templateSequence).toBe(normalizeDna(TEMPLATE))
    expect(payload.bindings).toEqual(BINDINGS)
  })

  it('renders annealed bases when opened through the hybrid payload reader path', () => {
    writeHybridPayload('primer-properties', {
      name: 'Demo primer',
      sequence: PRIMER_SEQ,
      templateSequence: TEMPLATE,
      preferredStrand: 'forward',
      bindings: BINDINGS,
    })
    const payload = readPrimerPropertiesPayload()
    expect(payload?.templateSequence).toBe(TEMPLATE)

    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    act(() => {
      root.render(
        payload ? (
          <PrimerPropertiesDialog
            primer={payload}
            templateSequence={payload.templateSequence}
            preferredStrand={payload.preferredStrand}
            bindings={payload.bindings}
            onClose={() => undefined}
          />
        ) : null,
      )
    })

    expect(container.querySelectorAll('.primer-editor-sequence-highlight .is-annealed').length).toBeGreaterThan(0)
    expect(container.querySelectorAll('.primer-editor-sequence-highlight .is-overhang').length).toBeGreaterThan(0)

    act(() => root.unmount())
    container.remove()
  })

  it('recomputes mismatch coloring after an edited sequence through the database payload path', async () => {
    const record = demoRecord()
    const payload = await primerPropertiesPayloadFromDatabaseRow(
      {
        key: 'demo',
        name: 'Demo primer',
        sequence: PRIMER_SEQ,
        color: '#7c3aed',
        description: '',
        sources: [{ projectId: record.id, projectName: record.name, folderId: null }],
      },
      async (projectId) => (projectId === record.id ? record : null),
    )
    const edited = 'TTTTTATGCGTACGTAA'
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    act(() => {
      root.render(
        <PrimerPropertiesDialog
          primer={{ ...payload, sequence: edited }}
          source="construct"
          templateSequence={payload.templateSequence}
          preferredStrand={payload.preferredStrand}
          bindings={payload.bindings}
          onClose={() => undefined}
        />,
      )
    })
    const spans = [...container.querySelectorAll('.primer-editor-sequence-highlight span')]
    expect(spans.at(-1)?.className).toContain('is-overhang')
    expect(spans.slice(0, 5).every((span) => span.className.includes('is-overhang'))).toBe(true)
    expect(spans.slice(5, 15).every((span) => span.className.includes('is-annealed'))).toBe(true)
    act(() => root.unmount())
    container.remove()
  })

  it('leaves library-only primers without a template all non-annealed', () => {
    const payload = primerPropertiesPayloadFromLibrary({ name: 'Lib', sequence: 'ACGT' })
    expect(payload.templateSequence).toBeUndefined()

    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    act(() => {
      root.render(
        <PrimerPropertiesDialog
          primer={payload}
          templateSequence={payload.templateSequence}
          preferredStrand={payload.preferredStrand}
          bindings={payload.bindings}
          onClose={() => undefined}
        />,
      )
    })
    expect(container.querySelectorAll('.primer-editor-sequence-highlight .is-annealed')).toHaveLength(0)
    expect(container.querySelectorAll('.primer-editor-sequence-highlight .is-overhang')).toHaveLength(4)
    act(() => root.unmount())
    container.remove()
  })
})
