import { describe, expect, it } from 'vitest'
import {
  MOBILE_CLONING_MENU_Z_INDEX,
  MOBILE_CLONING_NESTED_MODAL_Z_INDEX,
  MOBILE_CLONING_WORKSPACE_Z_INDEX,
  MOBILE_FULLSCREEN_DIALOG_Z_INDEX,
  MOBILE_SHELL_CHROME_MAX_Z_INDEX,
} from '../src/ui/mobileOverlayStacking'

describe('mobile overlay z-index ladder', () => {
  it('keeps fullscreen dialogs above mobile shell chrome', () => {
    expect(MOBILE_FULLSCREEN_DIALOG_Z_INDEX).toBeGreaterThan(MOBILE_SHELL_CHROME_MAX_Z_INDEX)
  })

  it('preserves cloning host, nested modal, and menu ordering', () => {
    expect(MOBILE_CLONING_WORKSPACE_Z_INDEX).toBeGreaterThan(MOBILE_FULLSCREEN_DIALOG_Z_INDEX)
    expect(MOBILE_CLONING_NESTED_MODAL_Z_INDEX).toBeGreaterThan(MOBILE_CLONING_WORKSPACE_Z_INDEX)
    expect(MOBILE_CLONING_MENU_Z_INDEX).toBeGreaterThan(MOBILE_CLONING_NESTED_MODAL_Z_INDEX)
  })
})
