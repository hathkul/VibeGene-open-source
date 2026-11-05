import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

type PointerTarget = {
  addEventListener: (type: 'pointermove' | 'pointerup', listener: (event: globalThis.PointerEvent) => void) => void
  removeEventListener: (type: 'pointermove' | 'pointerup', listener: (event: globalThis.PointerEvent) => void) => void
}

type PanelLayoutOptions = {
  recordId: string
  traceDocument: boolean
  initialMapAlignmentSidebarWidthPx: number
  initialDescriptionPanelWidthPx: number
  initiallyDescriptionVisible: boolean
  isMobileShell: () => boolean
  shouldShowDescriptionPanelOnOpen: () => boolean
  persistDescriptionPanelWidth: (width: number) => void
  pointerTarget: PointerTarget
  bodyClassList: { add: (className: string) => void; remove: (className: string) => void }
}

/** Owns workspace panel widths, persisted description width, and pointer-drag lifecycles. */
export function useWorkspacePanelLayoutController(options: PanelLayoutOptions) {
  const { recordId, traceDocument, isMobileShell, shouldShowDescriptionPanelOnOpen, persistDescriptionPanelWidth } = options
  const [mapAlignmentSidebarWidthPx, setMapAlignmentSidebarWidthPx] = useState(options.initialMapAlignmentSidebarWidthPx)
  const [descriptionPanelVisible, setDescriptionPanelVisible] = useState(options.initiallyDescriptionVisible)
  const [descriptionPanelWidthPx, setDescriptionPanelWidthPx] = useState(options.initialDescriptionPanelWidthPx)
  const mapAlignmentSplitDragRef = useRef<{ startX: number; startWidth: number } | null>(null)
  const descriptionPanelSplitDragRef = useRef<{ startX: number; startWidth: number } | null>(null)

  useEffect(() => {
    const onPointerMove = (event: globalThis.PointerEvent) => {
      const drag = mapAlignmentSplitDragRef.current
      if (!drag) return
      setMapAlignmentSidebarWidthPx(Math.max(240, Math.min(640, drag.startWidth + (event.clientX - drag.startX))))
    }
    const onPointerUp = () => { mapAlignmentSplitDragRef.current = null }
    options.pointerTarget.addEventListener('pointermove', onPointerMove)
    options.pointerTarget.addEventListener('pointerup', onPointerUp)
    return () => {
      options.pointerTarget.removeEventListener('pointermove', onPointerMove)
      options.pointerTarget.removeEventListener('pointerup', onPointerUp)
    }
  }, [options.pointerTarget])

  const startMapAlignmentSplitDrag = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    mapAlignmentSplitDragRef.current = { startX: event.clientX, startWidth: mapAlignmentSidebarWidthPx }
    event.currentTarget.setPointerCapture(event.pointerId)
  }, [mapAlignmentSidebarWidthPx])

  useEffect(() => {
    const onPointerMove = (event: globalThis.PointerEvent) => {
      const drag = descriptionPanelSplitDragRef.current
      if (!drag) return
      setDescriptionPanelWidthPx(Math.max(220, Math.min(560, drag.startWidth - (event.clientX - drag.startX))))
    }
    const onPointerUp = () => {
      if (!descriptionPanelSplitDragRef.current) return
      descriptionPanelSplitDragRef.current = null
      options.bodyClassList.remove('description-panel-resizing')
    }
    options.pointerTarget.addEventListener('pointermove', onPointerMove)
    options.pointerTarget.addEventListener('pointerup', onPointerUp)
    return () => {
      options.pointerTarget.removeEventListener('pointermove', onPointerMove)
      options.pointerTarget.removeEventListener('pointerup', onPointerUp)
    }
  }, [options.bodyClassList, options.pointerTarget])

  useEffect(() => {
    persistDescriptionPanelWidth(descriptionPanelWidthPx)
  }, [descriptionPanelWidthPx, persistDescriptionPanelWidth])

  useEffect(() => {
    if (traceDocument) return
    const nextVisible = isMobileShell() ? false : shouldShowDescriptionPanelOnOpen()
    queueMicrotask(() => setDescriptionPanelVisible((current) => current === nextVisible ? current : nextVisible))
    // Panel visibility is seeded only when opening another document, not on unrelated renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordId, traceDocument])

  const startDescriptionPanelSplitDrag = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    descriptionPanelSplitDragRef.current = { startX: event.clientX, startWidth: descriptionPanelWidthPx }
    options.bodyClassList.add('description-panel-resizing')
    event.currentTarget.setPointerCapture(event.pointerId)
  }, [descriptionPanelWidthPx, options.bodyClassList])

  return {
    mapAlignmentSidebarWidthPx,
    descriptionPanelVisible,
    setDescriptionPanelVisible,
    descriptionPanelWidthPx,
    startMapAlignmentSplitDrag,
    startDescriptionPanelSplitDrag,
  }
}
