import { useCallback, useEffect, useRef, useState, type Dispatch, type MouseEvent, type MutableRefObject, type PointerEvent, type SetStateAction } from 'react'
import { isContextMenuGesture } from '../../domain/contextMenuGesture'
import {
  areTranslationPositionsInRange,
  rangeCoveringTranslationCells,
  rangeCoveringTranslationPositions,
  translationCellMatchesAnchor,
  translationSelectionPositionsForFragment,
  translationCellStretch,
  type FeatureTranslationCell,
} from '../../domain/geneticCode'

type TranslationCell = FeatureTranslationCell & { featureId: string }
type TranslationAnchor = { featureId: string; number: number; position0: number } | null

/**
 * Handles drags across translated-AA glyphs, which are rendered outside the
 * sequence strand block. Visual glyph fragments always resolve back to one
 * canonical translation cell before this controller sees them.
 */
export function useTranslationDragSelection({
  containerRef,
  translationAaAnchor,
  setTranslationAaAnchor,
  onRangeSelect,
  topology,
  sequenceLength,
}: {
  containerRef: MutableRefObject<HTMLDivElement | null>
  translationAaAnchor: TranslationAnchor
  setTranslationAaAnchor: Dispatch<SetStateAction<TranslationAnchor>>
  onRangeSelect: (range: { start: number; end: number }, options?: { isExtend?: boolean }) => void
  topology: 'linear' | 'circular'
  sequenceLength: number
}) {
  const dragRef = useRef<{ anchor: TranslationCell; orderedCells: TranslationCell[] } | null>(null)
  const suppressClickRef = useRef(false)
  const [active, setActive] = useState(false)

  const selectStretch = useCallback((cells: FeatureTranslationCell[], options?: { isExtend?: boolean }) => {
    const range = rangeCoveringTranslationCells(cells, { topology, sequenceLength })
    if (range) onRangeSelect(range, options)
  }, [onRangeSelect, sequenceLength, topology])

  /**
   * Select the bases under one rendered glyph.
   *
   * A codon whose bases span a segment boundary is drawn as one glyph per
   * segment. Pointing at such a glyph must select only the bases under that
   * glyph, never the untranslated gap between the segments, so the selection
   * range is built from the fragment's own positions.
   */
  const selectFragment = useCallback((positions: number[], options?: { isExtend?: boolean }) => {
    const range = rangeCoveringTranslationPositions(positions, { topology, sequenceLength })
    if (range) onRangeSelect(range, options)
  }, [onRangeSelect, sequenceLength, topology])

  const finish = useCallback(() => {
    if (!dragRef.current) return
    suppressClickRef.current = true
    dragRef.current = null
    setActive(false)
  }, [])

  const begin = useCallback((cell: TranslationCell, event: PointerEvent<HTMLElement>, orderedCells: TranslationCell[], fragmentPositions?: number[]) => {
    // A context-menu press must not start a selection. The browser dispatches
    // it before `contextmenu`, so selecting here would replace the range the
    // user just dragged with the single residue under the pointer.
    if (isContextMenuGesture(event)) return
    event.preventDefault()
    event.stopPropagation()
    window.getSelection()?.removeAllRanges()
    containerRef.current?.focus()

    const extend = event.shiftKey || event.ctrlKey || event.metaKey
    const anchor =
      extend && translationAaAnchor
        ? orderedCells.find((entry) => translationCellMatchesAnchor(entry, translationAaAnchor)) ?? cell
        : cell
    if (!extend || !translationAaAnchor) {
      setTranslationAaAnchor({ featureId: cell.featureId, number: cell.number, position0: cell.positions[0] ?? 0 })
    }
    if (extend && translationAaAnchor) {
      selectStretch(translationCellStretch(orderedCells, anchor, cell), { isExtend: true })
    } else if (fragmentPositions?.length) {
      // A fragment click selects only the bases under that glyph.
      selectFragment(translationSelectionPositionsForFragment(cell, fragmentPositions))
    } else {
      selectStretch(translationCellStretch(orderedCells, anchor, cell))
    }
    dragRef.current = { anchor, orderedCells }
    suppressClickRef.current = true
    setActive(true)
  }, [containerRef, selectFragment, selectStretch, setTranslationAaAnchor, translationAaAnchor])

  const continueDrag = useCallback((cell: TranslationCell, event: PointerEvent<HTMLElement>) => {
    if (event.buttons !== 1) return
    const drag = dragRef.current
    if (!drag) return
    event.preventDefault()
    event.stopPropagation()
    selectStretch(translationCellStretch(drag.orderedCells, drag.anchor, cell))
  }, [selectStretch])

  const consumeSuppressedClick = useCallback(() => {
    if (!suppressClickRef.current) return false
    suppressClickRef.current = false
    return true
  }, [])

  /**
   * Whether the bases under one drawn glyph are inside the DNA selection.
   *
   * The check is per fragment, not per codon: a codon spanning a segment
   * boundary is drawn once per segment, and only the drawn glyph whose bases
   * are selected may look selected.
   */
  const isFragmentSelected = useCallback((positions: number[], selectedRange: { start: number; end: number } | null, hasCutStrandSelection: boolean) =>
    !hasCutStrandSelection && areTranslationPositionsInRange(positions, selectedRange), [])

  const selectClick = useCallback((cell: TranslationCell, event: MouseEvent<HTMLElement>, orderedCells: TranslationCell[], fragmentPositions?: number[]) => {
    // macOS delivers Ctrl+Click as an ordinary click after `contextmenu`.
    // Treating it as a selection would drop the range the user dragged.
    if (isContextMenuGesture(event)) return
    const extend = event.shiftKey || event.ctrlKey || event.metaKey
    if (extend && translationAaAnchor) {
      const anchor = orderedCells.find((entry) => translationCellMatchesAnchor(entry, translationAaAnchor))
      if (anchor) {
        selectStretch(translationCellStretch(orderedCells, anchor, cell), { isExtend: true })
        return
      }
    }
    setTranslationAaAnchor({ featureId: cell.featureId, number: cell.number, position0: cell.positions[0] ?? 0 })
    if (fragmentPositions?.length) {
      // A fragment click selects only the bases under that glyph.
      selectFragment(translationSelectionPositionsForFragment(cell, fragmentPositions))
      return
    }
    selectStretch([cell])
  }, [selectFragment, selectStretch, setTranslationAaAnchor, translationAaAnchor])

  useEffect(() => {
    if (!active) return
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', finish)
    return () => {
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
    }
  }, [active, finish])

  return { begin, continueDrag, finish, consumeSuppressedClick, isFragmentSelected, selectClick }
}
