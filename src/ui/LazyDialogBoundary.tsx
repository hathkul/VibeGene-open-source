import { Component, Suspense, type ReactNode } from 'react'
import { DialogBackdrop } from './DialogPrimitives'

export type LazyDialogLoadErrorProps = {
  onLoadError?: (error: unknown) => void
}

export type LazyDialogBoundaryProps = LazyDialogLoadErrorProps & {
  /**
   * Decides whether a caught error is a load failure the boundary should
   * absorb. When it returns false the error is rethrown so it propagates to
   * an outer boundary exactly as it would without this boundary.
   */
  shouldHandleError?: () => boolean
  children: ReactNode
}

type ErrorBoundaryProps = {
  onError?: (error: unknown) => void
  shouldHandleError: () => boolean
  children: ReactNode
}

class LazyDialogErrorBoundary extends Component<ErrorBoundaryProps, { error: unknown }> {
  state = { error: null }

  static getDerivedStateFromError(error: unknown) {
    return { error }
  }

  componentDidCatch(error: unknown) {
    if (this.props.shouldHandleError()) this.props.onError?.(error)
  }

  render() {
    const { error } = this.state
    if (error !== null) {
      if (this.props.shouldHandleError()) return null
      throw error
    }
    return this.props.children
  }
}

function LazyDialogFallback() {
  return (
    <DialogBackdrop>
      <div className="lazy-dialog-status" role="status">
        Loading…
      </div>
    </DialogBackdrop>
  )
}

/**
 * Boundary for lazily imported dialogs: keeps a modal loading placeholder on
 * screen while the chunk downloads and routes import failures to `onLoadError`
 * instead of crashing the shell. `shouldHandleError` distinguishes load
 * failures (absorbed) from post-load render errors inside the loaded dialog
 * (rethrown, preserving normal error propagation); it defaults to absorbing
 * every error.
 *
 * Standard wiring: the caller's `onLoadError` should both clear the dialog's
 * open state (so this boundary unmounts and the UI does not stick on an
 * invisible dialog) and surface a status message. React.lazy caches a rejected
 * import, so re-opening the dialog only re-reports the failure — a true retry
 * requires reloading the app.
 */
export function LazyDialogBoundary({ onLoadError, shouldHandleError, children }: LazyDialogBoundaryProps) {
  return (
    <LazyDialogErrorBoundary onError={onLoadError} shouldHandleError={shouldHandleError ?? (() => true)}>
      <Suspense fallback={<LazyDialogFallback />}>{children}</Suspense>
    </LazyDialogErrorBoundary>
  )
}
