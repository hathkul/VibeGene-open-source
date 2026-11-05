import { themeFixturePalette } from './test-support/themeFixturePalette'
// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultConstructProperties } from './domain/constructProperties'
import crisprReferences from './data/crisprReferences.json'
import type { SgRNAAnnotation } from './domain/sgrna'
import type { SequenceFeature, SequenceRecord } from './domain/types'
import { useConstructSources } from './cloning/useConstructSources'
import { SgRNACloningDialog } from './SgRNACloningDialog'

vi.mock('./cloning/useConstructSources', async (importOriginal) => {
  const original = await importOriginal<typeof import('./cloning/useConstructSources')>()
  return { ...original, useConstructSources: vi.fn() }
})
vi.mock('./ui/useClampDialogToViewport', () => ({ useClampDialogToViewport: vi.fn() }))

const spacer = 'ACGTACGTACGTACGTACGT'
const scaffold = crisprReferences.scaffolds.find((entry) => entry.name === 'SpCas9 standard sgRNA scaffold')!.sequence

function record(name: string, sequence: string, features: SequenceFeature[], topology: SequenceRecord['topology'] = 'circular'): SequenceRecord {
  return {
    id: name, name, description: '', molecule: 'dna', topology, sequence, features,
    primers: [], operations: [], construct: defaultConstructProperties,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

function px330LikeVector(): SequenceRecord {
  const promoter = `${'A'.repeat(96)}CACC`
  const prefix = 'C'.repeat(40)
  const cassette = 'GGGTCTTCGAGAAGACCT'
  const sequence = `${prefix}${promoter}${cassette}${scaffold}${'C'.repeat(100)}`
  return record('pX330 test vector', sequence, [
    { id: 'u6', name: 'U6 promoter', type: 'promoter', color: themeFixturePalette.gray, locations: [{ start: prefix.length, end: prefix.length + promoter.length, strand: 'forward' }] },
    { id: 'scaffold', name: 'gRNA scaffold', type: 'misc_RNA', color: themeFixturePalette.gray, locations: [{ start: prefix.length + promoter.length + cassette.length, end: prefix.length + promoter.length + cassette.length + scaffold.length, strand: 'forward' }] },
  ])
}

function unrecordedLinearVector(): SequenceRecord {
  const promoter = 'A'.repeat(120)
  const sequence = `GTTT${scaffold.slice(4)}${'C'.repeat(2200)}${promoter}CACC`
  return record('unknown-end vector', sequence, [
    { id: 'scaffold', name: 'gRNA scaffold', type: 'misc_RNA', color: themeFixturePalette.gray, locations: [{ start: 0, end: scaffold.length, strand: 'forward' }] },
    { id: 'u6', name: 'U6 promoter', type: 'promoter', color: themeFixturePalette.gray, locations: [{ start: sequence.length - promoter.length - 4, end: sequence.length - 4, strand: 'forward' }] },
  ], 'linear')
}

function guide(): SgRNAAnnotation {
  const feature: SequenceFeature = {
    id: 'guide', name: 'guide 1', type: 'misc_feature', color: themeFixturePalette.greenPrimary, locations: [],
  }
  const pam: SequenceFeature = {
    id: 'pam', name: 'guide 1 PAM', type: 'misc_feature', color: themeFixturePalette.greenPrimary, locations: [],
  }
  return { id: 'guide-1', guide: feature, pam, nuclease: 'SpCas9', pamMotif: 'NGG', pamSide: '3prime', spacer, observedPam: 'TGG' }
}

let container: HTMLDivElement
let root: Root

async function renderDialog(vector: SequenceRecord) {
  const onClone = vi.fn()
  vi.mocked(useConstructSources).mockReturnValue({
    options: [{ kind: 'current', label: vector.name, record: vector }],
    groups: { current: [], open: [], recent: [], drafts: [] },
    refresh: vi.fn(),
  })
  await act(async () => {
    root.render(createElement(SgRNACloningDialog, {
      source: record('source', 'ACGT', []),
      currentTabId: 'tab',
      guides: [guide()],
      onCancel: vi.fn(),
      onClone,
      onOpenAnnealedInsert: vi.fn(),
      renderWorkspace: ({ record: workspaceRecord, title }) => createElement('div', { 'data-testid': 'workspace' }, workspaceRecord ? title : 'Choose a cloning vector'),
    }))
  })
  const select = container.querySelector('select')
  if (!select) throw new Error('The vector source selector did not render.')
  const optionValue = `current:${vector.id}`
  await act(async () => {
    select.value = optionValue
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
  return onClone
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.clearAllMocks()
})

describe('SgRNACloningDialog', () => {
  it('renders a pX330-style valid plan with exact oligos and enabled product output', async () => {
    const onClone = await renderDialog(px330LikeVector())

    expect(container.textContent).toContain('Cloning vector · pX330 test vector')
    expect(container.textContent).toContain('BbsI · direct-spacer')
    expect(container.textContent).toContain(`5′ added: CACC`)
    expect(container.textContent).toContain(`CACCG${spacer}`)
    expect(container.textContent).toContain(`AAAC${'ACGT'.repeat(5)}C`)
    expect(container.querySelector('.sgrna-cloning-layout')).not.toBeNull()
    expect(container.textContent).toContain('1 / 1 constructs ready')
    const cloneButton = [...container.querySelectorAll('button')].find((button) => button.textContent?.includes('Clone 1 sgRNA'))
    expect(cloneButton?.disabled).toBe(false)
    expect(container.querySelector('[aria-label="Guide oligos and products"]')).not.toBeNull()
    expect([...container.querySelectorAll('button')].some((button) => button.textContent === 'Open as sequence')).toBe(true)
    await act(async () => cloneButton?.click())
    expect(onClone).toHaveBeenCalledOnce()
    expect(onClone.mock.calls[0]?.[0]).toHaveLength(1)
    expect(onClone.mock.calls[0]?.[0][0]?.name).toContain('guide 1')
  })

  it('shows the blocked chemistry warning and disables cloning when terminal ends are unrecorded', async () => {
    await renderDialog(unrecordedLinearVector())

    expect(container.textContent).toContain('Terminal end chemistry was not recorded')
    expect(container.textContent).toContain('0 / 1 constructs ready')
    const cloneButton = [...container.querySelectorAll('button')].find((button) => button.textContent?.includes('Clone 1 sgRNA'))
    expect(cloneButton?.disabled).toBe(true)
    expect(container.querySelector('[role="alert"]')).not.toBeNull()
  })
})
