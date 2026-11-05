// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AlignmentTraceFileList } from '../src/components/AlignmentTraceFileList'
import { TraceInspectorOverlay } from '../src/presentation/workspace/TraceInspectorOverlay'
import type { TraceFileRecord } from '../src/domain/traceTypes'

const traceFiles: TraceFileRecord[] = [
  {
    id: 'trace-a',
    fileName: 'read-a.ab1',
    sequence: 'ATGCATGC',
    chromatogram: {
      aTrace: Array.from({ length: 80 }, (_, index) => (index % 8 === 0 ? 8 : 0)),
      tTrace: Array.from({ length: 80 }, (_, index) => (index % 8 === 1 ? 8 : 0)),
      gTrace: Array.from({ length: 80 }, (_, index) => (index % 8 === 2 ? 8 : 0)),
      cTrace: Array.from({ length: 80 }, (_, index) => (index % 8 === 3 ? 8 : 0)),
      basePos: [0, 10, 20, 30, 40, 50, 60, 70],
      baseCalls: ['A', 'T', 'G', 'C', 'A', 'T', 'G', 'C'],
      qualNums: [40, 35, 30, 25, 20, 15, 10, 5],
    },
    enabled: true,
    expanded: false,
    showAnnotations: false,
    // Reverse-aligned so the viewer is expected to open in reverse orientation.
    alignment: {
      templateStart: 0,
      templateEnd: 8,
      traceStart: 0,
      traceEnd: 8,
      mismatchCount: 0,
      gapCount: 0,
      orientation: 'reverse',
      alignmentScore: 16,
      columns: Array.from({ length: 8 }, (_, index) => ({
        kind: 'match' as const,
        templateIndex: index,
        traceIndex: 7 - index,
        match: true,
      })),
    },
  },
  {
    id: 'trace-broken',
    fileName: 'broken.ab1',
    sequence: '',
    chromatogram: { aTrace: [], tTrace: [], gTrace: [], cTrace: [], basePos: [], baseCalls: [] },
    enabled: true,
    expanded: false,
    showAnnotations: false,
    alignment: null,
    parseError: 'No base calls found',
  },
]

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})

afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

describe('AlignmentTraceFileList View action', () => {
  it('exposes View beside Remove and routes only the clicked read', async () => {
    const onViewTrace = vi.fn()
    await act(async () => root.render(createElement(AlignmentTraceFileList, {
      traceFiles,
      templateSequence: 'ATGCATGC',
      onTraceFilesChange: vi.fn(),
      onViewTrace,
    })))
    const viewButtons = host.querySelectorAll<HTMLButtonElement>('.alignment-file-view')
    expect(viewButtons).toHaveLength(2)
    expect(viewButtons[0]!.getAttribute('aria-label')).toBe('View read-a.ab1 in trace viewer')
    expect(viewButtons[0]!.disabled).toBe(false)
    expect(viewButtons[1]!.disabled).toBe(true)
    await act(async () => viewButtons[0]!.click())
    expect(onViewTrace).toHaveBeenCalledWith('trace-a')
    expect(host.querySelectorAll('.alignment-file-remove')).toHaveLength(2)
  })

  it('does not offer chromatogram viewing for comparative sequence sources', async () => {
    await act(async () => root.render(createElement(AlignmentTraceFileList, {
      traceFiles,
      templateSequence: 'ATGCATGC',
      onTraceFilesChange: vi.fn(),
      mode: 'comparative',
      onViewTrace: vi.fn(),
    })))
    expect(host.querySelectorAll('.alignment-file-view')).toHaveLength(0)
  })
})

describe('TraceInspectorOverlay', () => {
  it('maps the current template selection into reverse-oriented viewer ordinals', async () => {
    const onClose = vi.fn()
    await act(async () => root.render(createElement(TraceInspectorOverlay, {
      target: { trace: traceFiles[0]!, templateRange: { start: 0, end: 2 } },
      onClose,
    })))
    expect(host.querySelector('.trace-inspector-backdrop')).not.toBeNull()
    // Reverse orientation: template 0..1 covers stored calls 7 and 6, which display as 0..1.
    expect(host.querySelector('.trace-viewer__selection-text')?.textContent).toBe('GCATGCAT')
    const highlight = host.querySelector<HTMLElement>('.trace-viewer__selection-highlight')
    expect(highlight).not.toBeNull()
    expect(Number(highlight!.dataset.selectionStart)).toBe(0)
    expect(Number(highlight!.dataset.selectionEnd)).toBe(1)
    const closeButton = [...host.querySelectorAll('button')].find((button) => button.getAttribute('aria-label') === 'Close trace viewer')!
    await act(async () => closeButton.click())
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('opens forward with no selection when there is no workspace range', async () => {
    await act(async () => root.render(createElement(TraceInspectorOverlay, {
      target: { trace: traceFiles[0]!, templateRange: null },
      onClose: vi.fn(),
    })))
    expect(host.querySelector('.trace-viewer__selection-text')?.textContent).toBe('ATGCATGC')
    expect(host.querySelector('.trace-viewer__selection-highlight')).toBeNull()
  })
})
