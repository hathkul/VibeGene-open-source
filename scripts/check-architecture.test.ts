import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { findImportViolations, legacyFileCeiling } from './check-architecture.mjs'

const presentationProbe = join(process.cwd(), 'src/presentation/architecture-probe.tsx')
const domainProbe = join(process.cwd(), 'src/domain/architecture-probe.ts')
const applicationProbe = join(process.cwd(), 'src/application/architecture-probe.ts')
const workerProbe = join(process.cwd(), 'src/workers/architecture-probe.ts')
const uiProbe = join(process.cwd(), 'src/ui/architecture-probe.tsx')

describe('legacy large-file headroom', () => {
  it('keeps at least 100 lines and rounds the ceiling to a 50-line boundary', () => {
    expect(legacyFileCeiling(1783)).toBe(1900)
  })

  it('uses proportional headroom for the largest composition roots', () => {
    expect(legacyFileCeiling(4237)).toBe(4450)
  })

  it('accepts an explicit policy for deterministic checker tests', () => {
    expect(legacyFileCeiling(1000, { minimumLines: 20, percent: 2, roundToLines: 10 })).toBe(1020)
  })
})

describe('inward dependency direction', () => {
  it('rejects domain imports from application and presentation', () => {
    expect(findImportViolations({
      sourcePath: domainProbe,
      source: `
        import '../application/documentOpen'
        import '../presentation/workspace/SelectionStatusBar'
      `,
    })).toHaveLength(2)
  })

  it('rejects application imports from the presentation layer', () => {
    expect(findImportViolations({
      sourcePath: applicationProbe,
      source: "import '../presentation/workspace/SelectionStatusBar'",
    })).toEqual([expect.stringContaining('forbidden application import:')])
  })

  it('keeps workers away from application and presentation orchestration', () => {
    expect(findImportViolations({
      sourcePath: workerProbe,
      source: `
        import '../application/documentOpen'
        import '../presentation/workspace/SelectionStatusBar'
      `,
    })).toHaveLength(2)
  })

  it('rejects direct adapter imports from presentation and UI primitives', () => {
    expect(findImportViolations({
      sourcePath: presentationProbe,
      source: `
        import '../wasm/primer3/engine'
        import '../workers/enzymeScan.worker'
      `,
    })).toHaveLength(2)
    expect(findImportViolations({
      sourcePath: uiProbe,
      source: `
        import '../presentation/workspace/SelectionStatusBar'
        import '../wasm/primer3/engine'
        import { invoke } from '@tauri-apps/api/core'
        import Dexie from 'dexie'
      `,
    })).toHaveLength(4)
  })
})

describe('presentation architecture scanner', () => {
  it('rejects static, type-only, dynamic, and mock adapter edges', () => {
    const violations = findImportViolations({
      sourcePath: presentationProbe,
      source: `
        import storage from '../storage/projects'
        import type { StoredProject } from '../storage/projects'
        void import('../desktop/fileIo')
        vi.mock('../desktop/fileIo')
        jest.mock('../storage/sessionDraft')
      `,
    })

    expect(violations).toHaveLength(5)
    expect(violations.every((message) => message.startsWith('forbidden presentation import:'))).toBe(true)
  })

  it('rejects spaced and multiline dynamic imports and mock variants', () => {
    const violations = findImportViolations({
      sourcePath: presentationProbe,
      source: `
        void import (
          '../storage/projects'
        )
        vi.mock (
          '../desktop/fileIo'
        )
        jest.doMock(
          '../storage/sessionDraft'
        )
        vi.doMock ( '../desktop/fileIo' )
      `,
    })

    expect(violations).toHaveLength(4)
    expect(violations.every((message) => message.startsWith('forbidden presentation import:'))).toBe(true)
  })

  it('rejects direct Tauri and Dexie package imports from presentation', () => {
    const violations = findImportViolations({
      sourcePath: presentationProbe,
      source: `
        import { invoke } from '@tauri-apps/api/core'
        import Dexie from 'dexie'
      `,
    })

    expect(violations).toEqual([
      expect.stringContaining("@tauri-apps/api/core"),
      expect.stringContaining('dexie'),
    ])
  })

  it('allows presentation imports to application and domain modules', () => {
    const violations = findImportViolations({
      sourcePath: presentationProbe,
      source: `
        import { normalizeSequenceRecord } from '../domain/constructProperties'
        import type { RecentFileEntry } from '../application/ports/recentFiles'
      `,
    })

    expect(violations).toEqual([])
  })
})

const databaseManagerDialogProbe = join(process.cwd(), 'src/databaseManagerDialog/ExampleRegion.tsx')
const productionProbe = join(process.cwd(), 'src/App.tsx')
const testSupportProbe = join(process.cwd(), 'src/themeFixture.test.ts')

describe('databaseManagerDialog presentation layer guard', () => {
  it('classifies src/databaseManagerDialog/ as presentation and rejects adapter edges', () => {
    const violations = findImportViolations({
      sourcePath: databaseManagerDialogProbe,
      source: `
        import storage from '../storage/projects'
        import type { StoredProject } from '../storage/projects'
        void import('../desktop/fileIo')
        vi.mock('../desktop/fileIo')
        jest.mock('../storage/sessionDraft')
        import { invoke } from '@tauri-apps/api/core'
        import Dexie from 'dexie'
      `,
    })

    expect(violations).toHaveLength(7)
    expect(
      violations.filter((message) => message.startsWith('forbidden presentation import:')),
    ).toHaveLength(5)
    expect(violations.some((message) => message.includes('@tauri-apps/api/core'))).toBe(true)
    expect(violations.some((message) => message.includes('dexie'))).toBe(true)
  })

  it('allows databaseManagerDialog modules to import application and domain modules', () => {
    const violations = findImportViolations({
      sourcePath: databaseManagerDialogProbe,
      source: `
        import { buildDatabaseManagerGoToPageCommand } from '../application/databaseManager/paginationRouting'
        import type { DatabaseManagerPaginationModel } from '../application/databaseManager/presentation/neutralTypes'
      `,
    })

    expect(violations).toEqual([])
  })
})

describe('test-support layer guard', () => {
  it('reports production imports clearly and allows test imports', () => {
    const productionViolations = findImportViolations({
      sourcePath: productionProbe,
      source: "import { themeFixturePalette } from './test-support/themeFixturePalette'",
    })
    expect(productionViolations).toEqual([
      'production module imports test-support: src/App.tsx -> src/test-support/themeFixturePalette.ts',
    ])

    const testViolations = findImportViolations({
      sourcePath: testSupportProbe,
      source: "import { themeFixturePalette } from './test-support/themeFixturePalette'",
    })
    expect(testViolations).toEqual([])
  })
})

describe('storage and worker construction guards', () => {
  const storageProbe = join(process.cwd(), 'src/storage/probe.ts')
  it('rejects presentation and React dependencies in storage', () => {
    expect(findImportViolations({ sourcePath: storageProbe, source: `
      export type { X } from '../presentation/example'
      import type { ReactNode } from 'react'
      void import('react-dom/client')
    ` })).toHaveLength(3)
  })
  it('detects worker URLs without interpreting comments or strings as code', () => {
    expect(findImportViolations({ sourcePath: domainProbe, source: `
      // new Worker(new URL('../workers/no.ts', import.meta.url))
      const text = "import '../storage/fake'"
      new Worker(new URL('../workers/traceAlignment.worker.ts', import.meta.url), { type: 'module' })
    ` })).toEqual([expect.stringContaining('src/workers/traceAlignment.worker.ts')])
    expect(findImportViolations({ sourcePath: domainProbe, source: `
      const text = "vi.mock('../storage/fake')"
      new URL('../workers/traceAlignment.worker.ts', import.meta.url)
    ` })).toEqual([])
  })
})

describe('worker adapter boundary', () => {
  it('rejects direct imports from protected layers', () => {
    for (const sourcePath of [domainProbe, applicationProbe, presentationProbe]) {
      expect(findImportViolations({ sourcePath, source: "import '../workerAdapters/traceAlignment'" })).toHaveLength(1)
    }
  })
})
