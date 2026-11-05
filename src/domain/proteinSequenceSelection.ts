/** Nearest inter-residue boundary for sequence-pane drag selection (matches protein map seams). */
export function proteinResidueBoundaryAtClientX(
  residueIndex: number,
  cellLeft: number,
  cellWidth: number,
  clientX: number,
): number {
  return residueIndex + (clientX >= cellLeft + cellWidth / 2 ? 1 : 0)
}

export function proteinResidueIndexFromHitElement(element: Element | null, root: Element | null): number | null {
  const cell = element?.closest('.protein-residue')
  if (!cell || !root?.contains(cell)) return null
  const raw = cell.getAttribute('data-residue-index')
  if (raw === null) return null
  const index = Number.parseInt(raw, 10)
  return Number.isInteger(index) ? index : null
}

export function proteinResidueBoundaryFromPointer(
  clientX: number,
  clientY: number,
  root: Element,
  elementFromPoint: (x: number, y: number) => Element | null = (x, y) => document.elementFromPoint(x, y),
): number | null {
  const hit = elementFromPoint(clientX, clientY)
  const cell = hit?.closest('.protein-residue')
  if (!cell || !root.contains(cell)) return null
  const index = proteinResidueIndexFromHitElement(cell, root)
  if (index === null) return null
  const rect = cell.getBoundingClientRect()
  return proteinResidueBoundaryAtClientX(index, rect.left, rect.width, clientX)
}
