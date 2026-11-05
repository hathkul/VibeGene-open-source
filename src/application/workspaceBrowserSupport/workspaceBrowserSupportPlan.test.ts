import { describe, expect, it } from 'vitest'
import {
  isNativeNewWorkspaceWindowOpened,
  KOFI_SUPPORT_BLOCKED_STATUS,
  KOFI_SUPPORT_OPENED_STATUS,
  NEW_VIBEGENE_WINDOW_BLOCKED_STATUS,
  NEW_VIBEGENE_WINDOW_OPENED_STATUS,
  planKofiSupportErrorStatus,
  planKofiSupportOpenedStatus,
  planNewVibegeneWindowBrowserStatus,
  planNewWorkspaceBrowserUrl,
} from './workspaceBrowserSupportPlan'

describe('workspaceBrowserSupportPlan', () => {
  it('maps Ko-fi popup outcomes to exact status messages', () => {
    expect(planKofiSupportOpenedStatus(true)).toBe(KOFI_SUPPORT_OPENED_STATUS)
    expect(planKofiSupportOpenedStatus(false)).toBe(KOFI_SUPPORT_BLOCKED_STATUS)
    expect(planKofiSupportErrorStatus(new Error('network'))).toBe(
      'Could not open Support page: network',
    )
  })

  it('builds bootSplash workspace URLs for browser new-window routing', () => {
    expect(planNewWorkspaceBrowserUrl('https://app.test', '/workspace')).toBe(
      'https://app.test/workspace?bootSplash=0',
    )
  })

  it('maps browser new-window popup outcomes to exact status messages', () => {
    expect(planNewVibegeneWindowBrowserStatus(true)).toBe(NEW_VIBEGENE_WINDOW_OPENED_STATUS)
    expect(planNewVibegeneWindowBrowserStatus(false)).toBe(NEW_VIBEGENE_WINDOW_BLOCKED_STATUS)
  })

  it('treats native focused and opened results as success', () => {
    expect(isNativeNewWorkspaceWindowOpened('focused')).toBe(true)
    expect(isNativeNewWorkspaceWindowOpened('opened')).toBe(true)
    expect(isNativeNewWorkspaceWindowOpened(false)).toBe(false)
  })
})
