function stripPositionFromLabel(label: string) {
  return label.replace(/^\s*\([-+]?[\d,.\s]+\)\s*/, '').replace(/\s*\([-+]?[\d,.\s]+\)\s*$/, '')
}

export function enzymeNamesFromLabel(label: string) {
  return label
    .split(/,\s+/)
    .map((name) => stripMethylationMarkerFromLabelName(stripPositionFromLabel(name.trim()).trim()))
    .filter(Boolean)
}

export function stripMethylationMarkerFromLabelName(name: string) {
  if (name.endsWith('(*)')) return name
  return name.replace(/\*$/, '')
}

export function enzymeNameAtCharIndex(label: string, charIndex: number) {
  const rawSegments = label.split(/,\s+/)
  if (rawSegments.length <= 1) return enzymeNamesFromLabel(label)[0] ?? label.trim()

  let offset = 0
  for (let index = 0; index < rawSegments.length; index++) {
    const segment = `${index > 0 ? ', ' : ''}${rawSegments[index]}`
    const start = offset
    const end = offset + segment.length
    if (charIndex >= start && charIndex < end) {
      return stripPositionFromLabel(rawSegments[index]!.trim()).trim().replace(/(?<!\(\))\*$/, '')
    }
    offset = end
  }

  const names = enzymeNamesFromLabel(label)
  return names[names.length - 1]!
}

export function svgCharIndexAtClientPoint(textElement: SVGTextElement, clientX: number, clientY: number) {
  const svg = textElement.ownerSVGElement
  if (!svg) return null

  const point = svg.createSVGPoint()
  point.x = clientX
  point.y = clientY
  const ctm = textElement.getScreenCTM()
  if (!ctm) return null

  const local = point.matrixTransform(ctm.inverse())
  const direct = textElement.getCharNumAtPosition(local)
  if (direct >= 0) return direct

  const count = textElement.getNumberOfChars()
  if (count <= 0) return null

  const lastIndex = count - 1
  const lastExtent = textElement.getExtentOfChar(lastIndex)
  const withinLastGlyph =
    local.y >= lastExtent.y - 2 &&
    local.y <= lastExtent.y + lastExtent.height + 2 &&
    local.x >= lastExtent.x - 1
  if (withinLastGlyph) return lastIndex

  const firstExtent = textElement.getExtentOfChar(0)
  const withinFirstGlyph =
    local.y >= firstExtent.y - 2 &&
    local.y <= firstExtent.y + firstExtent.height + 2 &&
    local.x >= firstExtent.x - 2 &&
    local.x <= firstExtent.x + firstExtent.width + 2
  if (withinFirstGlyph) return 0

  const bbox = textElement.getBBox()
  const withinBBox =
    local.x >= bbox.x &&
    local.x <= bbox.x + bbox.width &&
    local.y >= bbox.y &&
    local.y <= bbox.y + bbox.height
  if (!withinBBox) return null

  const ratio = bbox.width > 0 ? (local.x - bbox.x) / bbox.width : 0
  return Math.min(lastIndex, Math.max(0, Math.round(ratio * lastIndex)))
}

function enzymeIndexFromLabelRatio(names: string[], ratio: number) {
  if (names.length <= 1) return 0
  return Math.min(names.length - 1, Math.max(0, Math.floor(ratio * names.length)))
}

export function resolveEnzymeNameFromLabelClick(
  textElement: SVGTextElement,
  label: string,
  clientX: number,
  clientY: number,
) {
  const names = enzymeNamesFromLabel(label)
  if (names.length <= 1) return names[0] ?? label.trim()

  const charIndex = svgCharIndexAtClientPoint(textElement, clientX, clientY)
  if (charIndex !== null) return enzymeNameAtCharIndex(label, charIndex)

  const svg = textElement.ownerSVGElement
  if (svg) {
    const point = svg.createSVGPoint()
    point.x = clientX
    point.y = clientY
    const ctm = textElement.getScreenCTM()
    if (ctm) {
      const local = point.matrixTransform(ctm.inverse())
      const bbox = textElement.getBBox()
      if (bbox.width > 0) {
        const ratio = Math.max(0, Math.min(1, (local.x - bbox.x) / bbox.width))
        return names[enzymeIndexFromLabelRatio(names, ratio)]!
      }
    }
  }

  return names[0]!
}
