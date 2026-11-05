// @vitest-environment jsdom

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAnalysisToolDialogsController } from './useAnalysisToolDialogsController'

describe('useAnalysisToolDialogsController', () => {
  let host: HTMLDivElement | undefined
  let root: ReturnType<typeof createRoot> | undefined

  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
  })

  it('retains DNA MW open state independently from double digest', () => {
    let controller: ReturnType<typeof useAnalysisToolDialogsController> | undefined
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    function Harness() {
      controller = useAnalysisToolDialogsController()
      return null
    }
    act(() => { root!.render(<Harness />) })
    act(() => { controller!.setDoubleDigestOpen(true) })
    act(() => { controller!.setDnaMwOpen(true) })
    expect(controller!.openSnapshot.dnaMwOpen).toBe(true)
    expect(controller!.openSnapshot.doubleDigestOpen).toBe(true)
    act(() => { controller!.setDnaMwOpen(false) })
    expect(controller!.openSnapshot.dnaMwOpen).toBe(false)
    expect(controller!.openSnapshot.doubleDigestOpen).toBe(true)
  })

  it('falls back to in-app letter codes when hybrid focus fails', async () => {
    const tryOpenLetterCodesHybridWindow = vi.fn(async () => false)
    let controller: ReturnType<typeof useAnalysisToolDialogsController> | undefined
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    function Harness() {
      controller = useAnalysisToolDialogsController()
      return null
    }
    act(() => { root!.render(<Harness />) })
    await act(async () => {
      controller!.openLetterCodesWindow({ tryOpenLetterCodesHybridWindow })
      await Promise.resolve()
    })
    expect(tryOpenLetterCodesHybridWindow).toHaveBeenCalledOnce()
    expect(controller!.openSnapshot.letterCodesOpen).toBe(true)
  })

  it('does not open in-app letter codes when hybrid window succeeds', async () => {
    const tryOpenLetterCodesHybridWindow = vi.fn(async () => true)
    let controller: ReturnType<typeof useAnalysisToolDialogsController> | undefined
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    function Harness() {
      controller = useAnalysisToolDialogsController()
      return null
    }
    act(() => { root!.render(<Harness />) })
    await act(async () => {
      controller!.openLetterCodesWindow({ tryOpenLetterCodesHybridWindow })
      await Promise.resolve()
    })
    expect(controller!.openSnapshot.letterCodesOpen).toBe(false)
  })
})
