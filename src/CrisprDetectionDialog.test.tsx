// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CrisprDetectionDialog } from './CrisprDetectionDialog'
import type { CrisprDetectionResult } from './domain/crisprDetection'

const noFindings: CrisprDetectionResult = {
  nucleaseFindings: [],
  guideScaffoldFindings: [],
  cassetteFindings: [],
  recommendations: [{
    title: 'Nuclease not identified',
    detail: 'No supported Cas nuclease or guide scaffold was confidently recognized.',
    confidence: 'low',
  }],
  summary: '0 nuclease findings · 0 guide scaffolds · 0 candidate cassettes',
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})

describe('CrisprDetectionDialog', () => {
  it('does not present an empty detection as evidence of a biological negative control', async () => {
    await act(async () => {
      root.render(createElement(CrisprDetectionDialog, {
        recordName: 'unknown vector.dna',
        result: noFindings,
        onClose: vi.fn(),
      }))
    })

    expect(container.textContent).toContain('This is not a negative biological result')
    expect(container.textContent).toContain('do not conclude that the plasmid lacks CRISPR activity')
    expect(container.textContent).toContain('negative control from this result alone')
    expect(container.textContent).toContain('Confirm the vector identity and complete sequence')
  })
})
