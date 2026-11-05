// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import {
  GUIDESCAN_DESIGN_MENU_ACTION,
  isGuideScanDesignMenuAction,
  tryOpenGuideScanDesignFromMenuAction,
} from '../src/guideScanMenuAction'

describe('GuideScan design menu action', () => {
  it('is exposed on the native CRISPR menu', () => {
    const source = readFileSync('src/desktop/nativeAppMenu.ts', 'utf8')
    expect(source).toContain(`'${GUIDESCAN_DESIGN_MENU_ACTION}'`)
    expect(source).toContain('Design sgRNA…')
  })

  it('opens the standalone design dialog through the menu dispatch helper', () => {
    expect(isGuideScanDesignMenuAction(GUIDESCAN_DESIGN_MENU_ACTION)).toBe(true)
    const open = vi.fn()
    expect(tryOpenGuideScanDesignFromMenuAction('crispr.add-sgrna', open)).toBe(false)
    expect(open).not.toHaveBeenCalled()
    expect(tryOpenGuideScanDesignFromMenuAction(GUIDESCAN_DESIGN_MENU_ACTION, open)).toBe(true)
    expect(open).toHaveBeenCalledTimes(1)
  })
})
