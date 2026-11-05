// @vitest-environment jsdom
import { act, Component, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { lazyDialog } from './lazyDialog'

class OuterBoundary extends Component<{ children: ReactNode }, { error: unknown }> {
  state = { error: null }

  static getDerivedStateFromError(error: unknown) {
    return { error }
  }

  render() {
    if (this.state.error !== null) {
      return <div data-testid="outer-error">{(this.state.error as Error).message}</div>
    }
    return this.props.children
  }
}

function GreetingDialog({ label }: { label: string }) {
  return <div role="dialog">{label}</div>
}

type GreetingModule = { GreetingDialog: typeof GreetingDialog }

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function lazyGreeting(load: () => Promise<GreetingModule>) {
  return lazyDialog(load, (module) => module.GreetingDialog)
}

describe('lazyDialog', () => {
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  beforeEach(() => {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })

  it('does not start loading until the dialog is rendered', () => {
    const load = vi.fn(() => deferred<GreetingModule>().promise)
    const LazyGreeting = lazyGreeting(load)
    function Harness({ open }: { open: boolean }) {
      return open ? <LazyGreeting label="hidden" /> : null
    }
    act(() => {
      root.render(<Harness open={false} />)
    })
    expect(load).not.toHaveBeenCalled()
  })

  it('shows a status fallback while loading, then the dialog content', async () => {
    const pending = deferred<GreetingModule>()
    const LazyGreeting = lazyGreeting(() => pending.promise)
    act(() => {
      root.render(<LazyGreeting label="hello" />)
    })
    const status = host.querySelector('[role="status"]')!
    expect(status.textContent).toBe('Loading…')
    expect(host.querySelector('.translation-dialog-backdrop')).toBeTruthy()

    await act(async () => {
      pending.resolve({ GreetingDialog })
      await pending.promise
    })
    expect(host.querySelector('[role="status"]')).toBeNull()
    expect(host.querySelector('[role="dialog"]')?.textContent).toBe('hello')
  })

  it('reports a failed import through onLoadError and unmounts the dialog', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const pending = deferred<GreetingModule>()
      const onLoadError = vi.fn()
      const LazyGreeting = lazyGreeting(() => pending.promise)
      act(() => {
        root.render(<LazyGreeting label="hello" onLoadError={onLoadError} />)
      })
      expect(host.querySelector('[role="status"]')).toBeTruthy()

      const failure = new Error('chunk unavailable')
      await act(async () => {
        pending.reject(failure)
        await pending.promise.catch(() => {})
      })
      expect(onLoadError).toHaveBeenCalledTimes(1)
      expect(onLoadError).toHaveBeenCalledWith(failure)
      expect(host.querySelector('[role="status"]')).toBeNull()
      expect(host.querySelector('[role="dialog"]')).toBeNull()
    } finally {
      consoleError.mockRestore()
    }
  })

  it('rethrows a render crash from the loaded dialog without calling onLoadError', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      function CrashingDialog(): ReactNode {
        throw new Error('render crash')
      }
      const pending = deferred<{ CrashingDialog: typeof CrashingDialog }>()
      const onLoadError = vi.fn()
      const LazyCrashing = lazyDialog(() => pending.promise, (module) => module.CrashingDialog)
      act(() => {
        root.render(
          <OuterBoundary>
            <LazyCrashing onLoadError={onLoadError} />
          </OuterBoundary>,
        )
      })
      expect(host.querySelector('[role="status"]')).toBeTruthy()

      await act(async () => {
        pending.resolve({ CrashingDialog })
        await pending.promise
      })
      // The crash happened after the import resolved, so it is not a load
      // failure: it propagates to the outer boundary like any render error.
      expect(onLoadError).not.toHaveBeenCalled()
      expect(host.querySelector('[data-testid="outer-error"]')?.textContent).toBe('render crash')
    } finally {
      consoleError.mockRestore()
    }
  })
})
