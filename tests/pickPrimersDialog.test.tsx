/** @vitest-environment jsdom */

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PickPrimersDialog } from '../src/PickPrimersDialog'
import { Primer3InputError, type Primer3Request, type Primer3Result } from '../src/domain/primer3'
import type { runPrimer3 as runPrimer3Client } from '../src/primer3/client'

const runPrimer3 = vi.fn<[Primer3Request, { signal?: AbortSignal } | undefined], Promise<Primer3Result>>()

vi.mock('../src/primer3/client', () => ({
  runPrimer3: (...args: Parameters<typeof runPrimer3Client>) => runPrimer3(...args),
}))

vi.mock('../src/domain/primer3', async () => {
  const actual = await vi.importActual<typeof import('../src/domain/primer3/types')>('../src/domain/primer3/types')
  class MockInputError extends Error {
    issues: string[]
    constructor(issues: string[]) {
      super(issues.join('\n'))
      this.name = 'Primer3InputError'
      this.issues = issues
    }
  }
  return {
    ...actual,
    PRIMER3_VERSION: '2.6.1',
    Primer3InputError: MockInputError,
    parsePrimer3SettingsFile: (text: string) => {
      const out: Record<string, string> = {}
      for (const line of text.split('\n')) {
        const eq = line.indexOf('=')
        if (eq > 0) out[line.slice(0, eq)] = line.slice(eq + 1)
      }
      return out
    },
    formatPrimer3SettingsFile: (tags: Record<string, string>) =>
      Object.entries(tags)
        .map(([k, v]) => `${k}=${v}`)
        .join('\n'),
  }
})

const checkPrimerPairSpecificity = vi.fn()

vi.mock('../src/domain/primer3/specificity', async () => {
  const actual = await vi.importActual<typeof import('../src/domain/primer3/specificity')>(
    '../src/domain/primer3/specificity',
  )
  return {
    ...actual,
    checkPrimerPairSpecificity: (...args: unknown[]) => checkPrimerPairSpecificity(...args),
  }
})

vi.mock('../src/ui/useClampDialogToViewport', () => ({
  useClampDialogToViewport: vi.fn(),
}))

function cannedResult(): Primer3Result {
  return {
    pairs: [
      {
        rank: 0,
        penalty: 0.5,
        productSize: 200,
        left: {
          kind: 'left',
          rank: 0,
          sequence: 'AAAAAAAACCCCCCCC',
          length: 16,
          templateStart: 0,
          templateEnd: 16,
          recordStart: 100,
          recordEnd: 116,
          tm: 58,
          gcPercent: 50,
          penalty: 0.1,
          extra: {},
        },
        right: {
          kind: 'right',
          rank: 0,
          sequence: 'GGGGGGGGTTTTTTTT',
          length: 16,
          templateStart: 180,
          templateEnd: 196,
          recordStart: 280,
          recordEnd: 296,
          tm: 59,
          gcPercent: 50,
          penalty: 0.2,
          extra: {},
        },
        extra: {},
      },
      {
        rank: 1,
        penalty: 0.8,
        productSize: 210,
        left: {
          kind: 'left',
          rank: 1,
          sequence: 'AAAAAAAAAA',
          length: 10,
          templateStart: 5,
          templateEnd: 15,
          recordStart: 105,
          recordEnd: 115,
          tm: 55,
          gcPercent: 40,
          penalty: 0.3,
          extra: {},
        },
        right: {
          kind: 'right',
          rank: 1,
          sequence: 'TTTTTTTTTT',
          length: 10,
          templateStart: 190,
          templateEnd: 200,
          recordStart: 290,
          recordEnd: 300,
          tm: 54,
          gcPercent: 40,
          penalty: 0.4,
          extra: {},
        },
        extra: {},
      },
    ],
    lefts: [],
    rights: [],
    internals: [],
    explain: { left: 'considered 10, ok 2', pair: 'considered 5, ok 2' },
    warnings: [],
    errors: [],
    raw: {},
    input: 'SEQUENCE_TEMPLATE=...\n=',
    output: 'PRIMER_PAIR_NUM_RETURNED=2\n=',
  }
}

let reactRoot: ReturnType<typeof createRoot> | null = null
let container: HTMLDivElement | null = null
let onCancel: ReturnType<typeof vi.fn>
let onAddPrimers: ReturnType<typeof vi.fn>

beforeEach(() => {
  checkPrimerPairSpecificity.mockReset()
  runPrimer3.mockReset()
  runPrimer3.mockResolvedValue(cannedResult())
  onCancel = vi.fn()
  onAddPrimers = vi.fn()
  window.localStorage.clear()
})

afterEach(() => {
  if (reactRoot) act(() => reactRoot!.unmount())
  container?.remove()
  reactRoot = null
  container = null
})

function renderDialog() {
  container = document.createElement('div')
  document.body.append(container)
  reactRoot = createRoot(container)
  act(() => {
    reactRoot!.render(
      <PickPrimersDialog
        recordName="Test.dna"
        sequence={'A'.repeat(500)}
        topology="linear"
        selection={{ start: 100, end: 300 }}
        onCancel={onCancel}
        onAddPrimers={onAddPrimers}
      />,
    )
  })
}

function clickPick() {
  const btn = [...container!.querySelectorAll('button')].find((b) => b.textContent?.includes('Pick Primers'))
  expect(btn).toBeTruthy()
  act(() => btn!.click())
}

describe('PickPrimersDialog', () => {
  it('renders tabs and switches between them', () => {
    renderDialog()
    expect(container!.textContent).toContain('General')
    const adv = [...container!.querySelectorAll('.pick-primers-tabs [role="tab"]')].find((t) => t.textContent === 'Advanced')
    act(() => adv!.click())
    expect(container!.querySelector('.pick-primers-tabs [role="tab"][aria-selected="true"]')?.textContent).toBe('Advanced')
  })

  it('switches to Results after a run and back to Configure on demand', async () => {
    renderDialog()
    const paneTab = (label: string) =>
      [...container!.querySelectorAll('.pick-primers-pane-tabs [role="tab"]')].find((t) =>
        t.textContent?.startsWith(label),
      ) as HTMLButtonElement
    expect(paneTab('Configure').getAttribute('aria-selected')).toBe('true')
    expect(container!.querySelector('.pick-primers-results-table')).toBeNull()
    await act(async () => {
      clickPick()
      await Promise.resolve()
    })
    await act(async () => {
      await Promise.resolve()
    })
    expect(paneTab('Results').getAttribute('aria-selected')).toBe('true')
    expect(paneTab('Results').textContent).toBe('Results (2)')
    expect(container!.querySelector('.pick-primers-settings-pane')).toBeNull()
    expect(container!.querySelector('.pick-primers-results-table')).toBeTruthy()
    act(() => paneTab('Configure').click())
    expect(container!.querySelector('.pick-primers-results-table')).toBeNull()
    expect(container!.querySelector('.pick-primers-settings-pane')).toBeTruthy()
    expect([...container!.querySelectorAll('.pick-primers-footer button')].map((b) => b.textContent)).not.toContain(
      'Check all',
    )
  })

  it('passes changed settings and selection mode to runPrimer3', async () => {
    renderDialog()
    const targetLabel = [...container!.querySelectorAll('label')].find((l) =>
      l.textContent?.includes('Target (flank it)'),
    )
    act(() => {
      targetLabel!.querySelector('input')!.click()
    })
    const optSize = container!.querySelector('.pick-primers-num-return input') as HTMLInputElement | null
    expect(optSize).toBeTruthy()
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      setter?.call(optSize, '7')
      optSize!.dispatchEvent(new Event('input', { bubbles: true }))
      optSize!.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await act(async () => {
      clickPick()
      await Promise.resolve()
    })
    expect(runPrimer3).toHaveBeenCalled()
    const request = runPrimer3.mock.calls[0]![0]
    expect(request.context.mode).toBe('target')
    expect(request.settings.PRIMER_NUM_RETURN).toBe('7')
  })

  it('shows result rows with 1-based coordinates and adds selected primers', async () => {
    renderDialog()
    await act(async () => {
      clickPick()
      await Promise.resolve()
    })
    await act(async () => {
      await Promise.resolve()
    })
    const rows = container!.querySelectorAll('.pick-primers-results-table tbody tr')
    expect(rows.length).toBe(2)
    expect(rows[0]?.textContent).toContain('101')
    const checkbox = rows[0]?.querySelector('input[type="checkbox"]') as HTMLInputElement
    act(() => {
      checkbox.checked = true
      checkbox.dispatchEvent(new Event('change', { bubbles: true }))
    })
    const addBtn = [...container!.querySelectorAll('button')].find((b) => b.textContent?.includes('Add Selected'))
    await act(async () => {
      addBtn!.click()
    })
    expect(onAddPrimers).toHaveBeenCalled()
    const primers = onAddPrimers.mock.calls[0]![0]
    expect(primers.some((p: { name: string }) => p.name.endsWith('_F'))).toBe(true)
    expect(primers.some((p: { name: string }) => p.name.endsWith('_R'))).toBe(true)
  })

  it('checks and unchecks all result rows', async () => {
    renderDialog()
    await act(async () => {
      clickPick()
      await Promise.resolve()
    })
    await act(async () => {
      await Promise.resolve()
    })
    const rowChecks = () =>
      [...container!.querySelectorAll('.pick-primers-results-table tbody input[type="checkbox"]')].map(
        (input) => (input as HTMLInputElement).checked,
      )
    const footerButton = (label: string) =>
      [...container!.querySelectorAll('.pick-primers-footer button')].find((b) => b.textContent === label) as
        | HTMLButtonElement
        | undefined
    act(() => footerButton('Check all')!.click())
    expect(rowChecks()).toEqual([true, true])
    act(() => footerButton('Uncheck all')!.click())
    expect(rowChecks()).toEqual([false, false])
    const headerCheck = container!.querySelector(
      '.pick-primers-results-table thead input[type="checkbox"]',
    ) as HTMLInputElement
    act(() => headerCheck.click())
    expect(rowChecks()).toEqual([true, true])
    await act(async () => {
      footerButton('Add Selected to Primers')!.click()
    })
    const names = onAddPrimers.mock.calls[0]![0].map((p: { name: string }) => p.name)
    expect(names).toHaveLength(4)
  })

  it('checks specificity of selected pairs and toggles per-pair results', async () => {
    checkPrimerPairSpecificity.mockImplementation(async (pairs: { key: string }[], searchSet: unknown) =>
      pairs.map((pair) => ({
        key: pair.key,
        searchSet,
        truncated: false,
        leftSites: 1,
        rightSites: 1,
        verdict: 'offtarget',
        products: [
          {
            accession: 'NM_000999.2',
            title: 'Homo sapiens off-target gene, mRNA',
            subjectLength: 900,
            start: 10,
            end: 409,
            size: 400,
            forward: { role: 'left', site: { mismatches: 1, threePrimeMismatches: 0 } },
            reverse: { role: 'right', site: { mismatches: 0, threePrimeMismatches: 0 } },
            kind: 'offtarget',
          },
        ],
      })),
    )
    renderDialog()
    await act(async () => {
      clickPick()
      await Promise.resolve()
    })
    await act(async () => {
      await Promise.resolve()
    })
    const specButton = () =>
      [...container!.querySelectorAll('button')].find((b) => b.textContent?.startsWith('Check specificity'))
    expect(specButton()?.textContent).toBe('Check specificity (1)')
    const organism = container!.querySelector('select[aria-label="Organism"]') as HTMLSelectElement
    act(() => {
      organism.value = '10090'
      organism.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await act(async () => {
      specButton()!.click()
      await Promise.resolve()
    })
    await act(async () => {
      await Promise.resolve()
    })
    expect(checkPrimerPairSpecificity).toHaveBeenCalledTimes(1)
    const [pairs, searchSet] = checkPrimerPairSpecificity.mock.calls[0]!
    expect(pairs).toEqual([{ key: 'AAAAAAAACCCCCCCC|GGGGGGGGTTTTTTTT', left: 'AAAAAAAACCCCCCCC', right: 'GGGGGGGGTTTTTTTT', productSize: 200 }])
    expect(searchSet).toEqual({ database: 'refseq_rna', organism: '10090' })
    const toggle = container!.querySelector('.pick-primers-spec-toggle') as HTMLButtonElement
    expect(toggle.textContent).toContain('1 off-target')
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(container!.querySelector('.pick-primers-spec-table')?.textContent).toContain('NM_000999.2')
    act(() => toggle.click())
    expect(container!.querySelector('.pick-primers-spec-table')).toBeNull()
    const firstRow = container!.querySelector('.pick-primers-results-table tbody input[type="checkbox"]') as HTMLInputElement
    act(() => firstRow.click())
    expect(specButton()).toBeUndefined()
  })

  it('turns on Fast search for large searches and warns when it is switched off', async () => {
    checkPrimerPairSpecificity.mockResolvedValue([])
    renderDialog()
    await act(async () => {
      clickPick()
      await Promise.resolve()
    })
    await act(async () => {
      await Promise.resolve()
    })
    const warning = () => container!.querySelector('.pick-primers-spec-status.is-warning')
    const fast = () =>
      [...container!.querySelectorAll('label')].find((l) => l.textContent === 'Fast search')!.querySelector('input') as HTMLInputElement
    const choose = (label: string, value: string) => {
      const select = container!.querySelector(`select[aria-label="${label}"]`) as HTMLSelectElement
      act(() => {
        select.value = value
        select.dispatchEvent(new Event('change', { bubbles: true }))
      })
    }
    expect(fast().checked).toBe(false)
    expect(warning()).toBeNull()
    choose('Sequence collection', 'refseq_representative_genomes')
    expect(fast().checked).toBe(true)
    expect(fast().closest('label')?.getAttribute('title')).toContain('11-base BLAST seeds')
    expect(warning()).toBeNull()
    act(() => fast().click())
    expect(fast().checked).toBe(false)
    expect(warning()?.textContent).toContain('Large search')
    choose('Organism', '')
    expect(fast().checked).toBe(true)
    await act(async () => {
      ;[...container!.querySelectorAll('button')].find((b) => b.textContent?.startsWith('Check specificity'))!.click()
      await Promise.resolve()
    })
    expect(checkPrimerPairSpecificity.mock.calls[0]![2]).toMatchObject({ fast: true })
  })

  it('shows elapsed queue time and a countdown to the next NCBI status check', async () => {
    renderDialog()
    await act(async () => {
      clickPick()
      await Promise.resolve()
    })
    await act(async () => {
      await Promise.resolve()
    })
    vi.useFakeTimers()
    let onStatus: ((status: string) => void) | undefined
    try {
      vi.setSystemTime(5_000_000)
      checkPrimerPairSpecificity.mockImplementation(
        (_pairs: unknown, _searchSet: unknown, options: { onStatus: (status: string) => void }) => {
          onStatus = options.onStatus
          options.onStatus('RID:BRZ5945X014')
          options.onStatus(`WAITING:60:${5_000_000 + 60_000}:0:`)
          return new Promise(() => {})
        },
      )
      const specButton = [...container!.querySelectorAll('button')].find((b) =>
        b.textContent?.startsWith('Check specificity'),
      )
      await act(async () => {
        specButton!.click()
        await Promise.resolve()
      })
      const status = () => container!.querySelector('.pick-primers-spec-status')?.textContent
      expect(status()).toBe(
        'Queued at NCBI (RID BRZ5945X014) · 0:00 elapsed (stops at 10 min) · next status check in 60 s · NCBI estimated ~1 min',
      )
      await act(async () => {
        await vi.advanceTimersByTimeAsync(75_000)
      })
      expect(status()).toBe(
        'Queued at NCBI (RID BRZ5945X014) · 1:15 elapsed (stops at 10 min) · checking status… · NCBI estimated ~1 min',
      )
      await act(async () => {
        onStatus!(`WAITING:60:${5_000_000 + 135_000}:1:Searching`)
      })
      expect(status()).toBe(
        'NCBI: Searching (RID BRZ5945X014) · 1:15 elapsed (stops at 10 min) · next status check in 60 s · NCBI estimated ~1 min',
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it('shows Primer3InputError issues', async () => {
    runPrimer3.mockRejectedValueOnce(new Primer3InputError(['Bad template', 'Missing target']))
    renderDialog()
    await act(async () => {
      clickPick()
      await Promise.resolve()
    })
    await act(async () => {
      await Promise.resolve()
    })
    expect(container!.textContent).toContain('Bad template')
  })

  it('refuses to run when conflicting settings are both changed', async () => {
    window.localStorage.setItem(
      'vibegene.primer3.dialog.v1',
      JSON.stringify({
        settings: { PRIMER_MIN_THREE_PRIME_DISTANCE: '3', PRIMER_MIN_LEFT_THREE_PRIME_DISTANCE: '2' },
      }),
    )
    renderDialog()
    await act(async () => {
      clickPick()
      await Promise.resolve()
    })
    expect(runPrimer3).not.toHaveBeenCalled()
    expect(container!.textContent).toContain('cannot both be set')
  })

  it('calls onCancel on Escape', () => {
    renderDialog()
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    expect(onCancel).toHaveBeenCalled()
  })
})
