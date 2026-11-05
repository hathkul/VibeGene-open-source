import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const APP_SOURCE_PATH = fileURLToPath(new URL('../src/App.tsx', import.meta.url))

const ROOT_DIALOG_HOST_MARKERS = [
  '<UtilityBugReportDialogsRegion',
  '<DocumentLifecycleDialogsHost',
  'databaseExitSyncProgress && <DatabaseExitSyncOverlay',
  '<HelpDialogsRegion',
  '<CloningWorkflowDialogsHost',
] as const

function markerIndex(source: string, marker: string, searchFrom: number): number {
  const index = source.indexOf(marker, searchFrom)
  expect(index, `Expected App.tsx root marker ${marker}`).toBeGreaterThanOrEqual(0)
  return index
}

describe('App root dialog host composition order', () => {
  it('keeps utility, lifecycle, exit overlay, help, then cloning hosts in source order', () => {
    const source = readFileSync(APP_SOURCE_PATH, 'utf8')
    let searchFrom = 0
    let previous = -1
    for (const marker of ROOT_DIALOG_HOST_MARKERS) {
      const index = markerIndex(source, marker, searchFrom)
      expect(index, `${marker} must follow prior root dialog hosts in App.tsx`).toBeGreaterThan(previous)
      previous = index
      searchFrom = index + marker.length
    }
  })
})
