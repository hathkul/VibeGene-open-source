import { createElement, lazy, type ComponentType } from 'react'
import { LazyDialogBoundary, type LazyDialogLoadErrorProps } from './LazyDialogBoundary'

/**
 * Defers loading a dialog module until the returned component is first
 * rendered, so call sites mount it only while the dialog is open. A failed
 * import surfaces through the `onLoadError` prop and unmounts the dialog.
 * Errors thrown by the dialog after its module has loaded (render crashes)
 * are not load failures: they rethrow past the boundary and propagate exactly
 * as they would without lazy loading.
 */
export function lazyDialog<M, P extends object>(
  load: () => Promise<M>,
  pick: (module: M) => ComponentType<P>,
): ComponentType<P & LazyDialogLoadErrorProps> {
  let resolved = false
  const LazyComponent = lazy(async () => {
    const module = await load()
    resolved = true
    return { default: pick(module) }
  })
  function LazyDialog(props: P & LazyDialogLoadErrorProps) {
    const { onLoadError, ...dialogProps } = props
    return createElement(LazyDialogBoundary, {
      onLoadError,
      shouldHandleError: () => !resolved,
      children: createElement(LazyComponent, dialogProps as P),
    })
  }
  LazyDialog.displayName = 'LazyDialog'
  return LazyDialog
}
