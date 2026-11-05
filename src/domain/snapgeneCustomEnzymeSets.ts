import { createSavedEnzymeSetId, type SavedEnzymeSet } from './enzymePreferences'
import { enzymes } from './enzymes'

/**
 * SnapGene `.dna` block 14 (`CustomEnzymeSets`) XML.
 * Reads SnapGene's CustomEnzymeSet entries and older VibeGene variants.
 */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

export function serializeCustomEnzymeSetsXml(sets: SavedEnzymeSet[]): string {
  if (!sets.length) return '<?xml version="1.0"?><CustomEnzymeSets/>'
  const body = sets
    .map((set) => {
      const type = set.name === 'Unsaved Enzyme Set' ? '2' : '1'
      return `<CustomEnzymeSet type="${type}" name="${escapeXml(set.name)}" enzymeNames="${escapeXml(set.enzymeNames.join(' '))}"/>`
    })
    .join('')
  return `<?xml version="1.0"?><CustomEnzymeSets>${body}</CustomEnzymeSets>`
}

function canonicalizeNames(names: string[]): string[] {
  const known = new Set(enzymes.map((enzyme) => enzyme.name))
  const byLower = new Map(enzymes.map((enzyme) => [enzyme.name.toLowerCase(), enzyme.name]))
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of names) {
    const trimmed = raw.trim()
    if (!trimmed) continue
    const canonical = known.has(trimmed) ? trimmed : byLower.get(trimmed.toLowerCase()) ?? trimmed
    const key = canonical.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(canonical)
  }
  return out.toSorted((left, right) => left.localeCompare(right))
}

function parseEnzymeNamesFromSetXml(setXml: string): string[] {
  const names: string[] = []
  const attrRe = /<(?:Enzyme|E|RestrictionEnzyme)\b[^>]*\bname\s*=\s*"([^"]+)"/gi
  let match: RegExpExecArray | null
  while ((match = attrRe.exec(setXml))) {
    names.push(decodeXmlEntities(match[1]!))
  }
  const textRe = /<(?:Enzyme|E|RestrictionEnzyme)\b[^>]*>([^<]+)<\//gi
  while ((match = textRe.exec(setXml))) {
    names.push(decodeXmlEntities(match[1]!.trim()))
  }
  const listAttr = setXml.match(/\benzymes\s*=\s*"([^"]*)"/i)
  if (listAttr?.[1]) {
    for (const part of listAttr[1].split(/[,;]+/)) names.push(decodeXmlEntities(part.trim()))
  }
  const snapGeneList = setXml.match(/\benzymeNames\s*=\s*"([^"]*)"/i)
  if (snapGeneList?.[1]) names.push(...decodeXmlEntities(snapGeneList[1]).split(/\s+/))
  return canonicalizeNames(names)
}

export function parseCustomEnzymeSetsXml(xml: string): SavedEnzymeSet[] {
  const text = xml.trim()
  if (!text || !/<CustomEnzymeSets\b/i.test(text)) return []
  const sets: SavedEnzymeSet[] = []
  const setRe = /<(?:CustomEnzymeSet|EnzymeSet|Set)\b([^>]*?)(?<!\/)>([\s\S]*?)<\/(?:CustomEnzymeSet|EnzymeSet|Set)>/gi
  let match: RegExpExecArray | null
  while ((match = setRe.exec(text))) {
    const attrs = match[1] ?? ''
    const body = match[2] ?? ''
    const nameMatch = attrs.match(/\bname\s*=\s*"([^"]*)"/i)
    const name = decodeXmlEntities((nameMatch?.[1] ?? '').trim())
    if (!name) continue
    sets.push({
      id: createSavedEnzymeSetId(),
      name,
      enzymeNames: parseEnzymeNamesFromSetXml(`${attrs} ${body}`),
    })
  }
  // Self-closing / attribute-only variants: <EnzymeSet name="X" enzymes="EcoRI,BamHI"/>
  const selfClosingRe = /<(?:CustomEnzymeSet|EnzymeSet|Set)\b([^>]*?)\/>/gi
  while ((match = selfClosingRe.exec(text))) {
    const attrs = match[1] ?? ''
    const nameMatch = attrs.match(/\bname\s*=\s*"([^"]*)"/i)
    const name = decodeXmlEntities((nameMatch?.[1] ?? '').trim())
    if (!name) continue
    if (sets.some((entry) => entry.name === name)) continue
    sets.push({
      id: createSavedEnzymeSetId(),
      name,
      enzymeNames: parseEnzymeNamesFromSetXml(attrs),
    })
  }
  return sets
}

export function customEnzymeSetsPacketPayload(sets: SavedEnzymeSet[]): Uint8Array {
  return new TextEncoder().encode(serializeCustomEnzymeSetsXml(sets))
}
