import { describe, expect, it } from 'vitest'
import { isContextMenuGesture, isMacLikePlatform } from './contextMenuGesture'

const MAC = { platform: 'MacIntel', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' }
const WINDOWS = { platform: 'Win32', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }

describe('isMacLikePlatform', () => {
  it('detects macOS from the platform string', () => {
    expect(isMacLikePlatform(MAC.platform, MAC.userAgent)).toBe(true)
  })

  it('detects macOS from the user agent when the platform is unavailable', () => {
    expect(isMacLikePlatform(undefined, 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe(true)
  })

  it('does not treat Windows as macOS', () => {
    expect(isMacLikePlatform(WINDOWS.platform, WINDOWS.userAgent)).toBe(false)
  })
})

describe('isContextMenuGesture', () => {
  it('treats a secondary press as a context-menu gesture', () => {
    expect(isContextMenuGesture({ button: 2, ctrlKey: false }, WINDOWS.platform, WINDOWS.userAgent)).toBe(true)
  })

  it('treats a primary press as a selection gesture', () => {
    expect(isContextMenuGesture({ button: 0, ctrlKey: false }, WINDOWS.platform, WINDOWS.userAgent)).toBe(false)
  })

  it('treats ctrl+click as a context-menu gesture on macOS', () => {
    expect(isContextMenuGesture({ button: 0, ctrlKey: true }, MAC.platform, MAC.userAgent)).toBe(true)
  })

  it('keeps ctrl+click as a selection gesture on Windows', () => {
    expect(isContextMenuGesture({ button: 0, ctrlKey: true }, WINDOWS.platform, WINDOWS.userAgent)).toBe(false)
  })
})
