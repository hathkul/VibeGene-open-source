// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cloneFixture } from '../../domain/fixtures'
import { LIBRARY_MEMBER_ROW_ATTR } from '../../domain/libraryMemberReorderDrag'
import type { LibraryMemberTabRow } from '../../domain/libraryMemberTab'
import type { TraceFileRecord } from '../../domain/traceTypes'
import { MembersTabPane, type MembersTabPaneProps } from './MembersTabPane'

function makeMember(overrides: Partial<TraceFileRecord> = {}): TraceFileRecord {
  return {
    id: 'm1',
    fileName: 'member.ab1',
    sequence: 'ACGTACGT',
    chromatogram: { aTrace: [], tTrace: [], gTrace: [], cTrace: [], basePos: [], baseCalls: [] },
    enabled: true,
    expanded: false,
    showAnnotations: true,
    alignment: null,
    ...overrides,
  }
}

function makeRow(member: TraceFileRecord): LibraryMemberTabRow {
  return {
    member,
    lengthBp: member.sequence.length,
    readCount: member.reads?.length ?? 0,
    orientation: member.alignment?.orientation ?? null,
    alignedSpan: '—',
    mismatchCount: null,
    featureCount: member.features?.length ?? 0,
    primerCount: member.primers?.length ?? 0,
    status: 'unaligned',
  }
}

function makeProps(overrides: Partial<MembersTabPaneProps> = {}): MembersTabPaneProps {
  const base = cloneFixture()
  return {
    record: { ...base, dna: { ...base.dna, documentRole: 'library' } },
    traceFiles: [makeMember()],
    rows: [makeRow(makeMember())],
    selection: { selectedMemberIds: [], selectedAlignmentTraceId: null },
    addMenu: { open: false, busy: false },
    addMenuRef: { current: null },
    reorder: { dropBeforeId: undefined, sourceId: null, dragActiveRef: { current: false } },
    nameEdit: { editingMemberId: null, draft: '' },
    columns: {
      widths: { ref: 44, on: 44, name: 200, length: 76, reads: 56, strand: 64, aligned: 90, mismatches: 88, features: 68, primers: 68, status: 160, actions: 96 },
      minWidthPx: 1000,
      sortMode: 'manual',
      sortDirection: 'asc',
    },
    actions: {
      onToggleAddMenu: vi.fn(),
      onCloseAddMenu: vi.fn(),
      onAddMembersFromFiles: vi.fn(),
      onAddMembersFromDatabase: vi.fn(),
      onDeleteSelected: vi.fn(),
      onDeduplicate: vi.fn(),
      onSetAllEnabled: vi.fn(),
      onSelectAnnotationReference: vi.fn(),
      onSetConsensusEnabled: vi.fn(),
      onSetMemberEnabled: vi.fn(),
      onBeginReorderDrag: vi.fn(),
      onSelectRow: vi.fn(),
      onOpenMemberSequence: vi.fn(),
      onBeginNameEdit: vi.fn(),
      onCommitNameEdit: vi.fn(),
      onCancelNameEdit: vi.fn(),
      onNameDraftChange: vi.fn(),
      onOpenMemberAsConstruct: vi.fn(),
      onFlipMember: vi.fn(),
      onRemoveMembers: vi.fn(),
      onResizeColumn: vi.fn(),
      onSort: vi.fn(),
    },
    ...overrides,
  }
}

describe('MembersTabPane', () => {
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
  })

  function render(props: MembersTabPaneProps) {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    act(() => root.render(<MembersTabPane {...props} />))
    return host
  }

  it('always renders the consensus row and reports missing members', () => {
    const props = makeProps({ rows: [], traceFiles: [] })
    const dom = render(props)
    const consensusRow = dom.querySelector<HTMLTableRowElement>('.members-consensus-row')
    expect(consensusRow).not.toBeNull()
    expect(consensusRow?.cells).toHaveLength(12)
    expect(consensusRow?.cells[8]?.textContent).toBe(String(props.record.features.length || '—'))
    expect(consensusRow?.cells[9]?.textContent).toBe(String(props.record.primers.length || '—'))
    expect(consensusRow?.cells[10]?.textContent).toBe('Annotation reference template')
    expect(dom.textContent).toContain('No library members yet. Add AB1, FASTA, GenBank, or .seq files.')
  })

  it('renders a row per member carrying the reorder attribute', () => {
    const dom = render(makeProps())
    const row = dom.querySelector(`[${LIBRARY_MEMBER_ROW_ATTR}="m1"]`)
    expect(row).not.toBeNull()
    expect(row?.textContent).toContain('member.ab1')
  })

  it('marks selected members and keeps Delete disabled without a selection', () => {
    const props = makeProps({ selection: { selectedMemberIds: ['m1'], selectedAlignmentTraceId: null } })
    const dom = render(props)
    expect(dom.querySelector('tr.selected-row')).not.toBeNull()
    const deleteButton = Array.from(dom.querySelectorAll('button')).find((button) => button.textContent?.includes('Delete'))! as HTMLButtonElement
    expect(deleteButton.disabled).toBe(false)
  })

  it('delegates enablement toggles per member', () => {
    const props = makeProps()
    const dom = render(props)
    const enabled = dom.querySelectorAll<HTMLInputElement>('tbody input[type="checkbox"]')[1]!
    expect(enabled.checked).toBe(true)
    act(() => enabled.click())
    expect(props.actions.onSetMemberEnabled).toHaveBeenCalledWith('m1', false)
  })

  it('delegates the annotation reference radio to the selected member', () => {
    const props = makeProps()
    const dom = render(props)
    const radios = dom.querySelectorAll<HTMLInputElement>('tbody input[type="radio"]')
    expect(radios.length).toBe(2)
    act(() => radios[1]!.click())
    expect(props.actions.onSelectAnnotationReference).toHaveBeenCalledWith('m1')
  })

  it('shows the name editor when the row is in edit mode', () => {
    const props = makeProps({ nameEdit: { editingMemberId: 'm1', draft: 'renamed' } })
    const dom = render(props)
    const input = dom.querySelector<HTMLInputElement>('.members-name-input')!
    expect(input.value).toBe('renamed')
    expect(props.actions.onNameDraftChange).not.toHaveBeenCalled()
  })

  it('opens the add-members menu and routes file adds', () => {
    const props = makeProps({ addMenu: { open: true, busy: false } })
    const dom = render(props)
    const fromFiles = Array.from(dom.querySelectorAll('button')).find((button) => button.textContent?.includes('From files…'))!
    act(() => fromFiles.click())
    expect(props.actions.onCloseAddMenu).toHaveBeenCalled()
  })

  it('routes row clicks through the selection port', () => {
    const props = makeProps()
    const dom = render(props)
    const row = dom.querySelector(`[${LIBRARY_MEMBER_ROW_ATTR}="m1"]`)!
    act(() => row.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(props.actions.onSelectRow).toHaveBeenCalledWith('m1', expect.anything(), ['m1'])
  })
})
