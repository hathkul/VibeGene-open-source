export type VivantisTableBufferCode = 'v1' | 'v2' | 'v3' | 'v4' | 'v5' | 'ub05' | 'ub' | 'ub15' | 'ub2'

const preferredBufferOrder: Array<VivantisTableBufferCode | 'specific'> = [
  'v1',
  'v2',
  'v3',
  'v4',
  'v5',
  'ub',
]

export const vivantisBufferColumns: VivantisTableBufferCode[] = [
  'v1',
  'v2',
  'v3',
  'v4',
  'v5',
  'ub05',
  'ub',
  'ub15',
  'ub2',
]

function activityScore(value: string | undefined) {
  if (!value) return -1
  const normalized = value.replace(/\([^)]*\)/g, '').replace(/–/g, '-').trim()
  if (!normalized || normalized.startsWith('NR')) return -1
  if (normalized === '100') return 100
  const range = normalized.match(/^(\d+)-(\d+)$/)
  if (range) return (Number(range[1]) + Number(range[2])) / 2
  const parsed = Number(normalized.replace('%', ''))
  return Number.isFinite(parsed) ? parsed : -1
}

export function vivantisEnzymeSpecificBufferName(suppliedBuffer: string | null | undefined) {
  if (!suppliedBuffer) return null
  const match = suppliedBuffer.match(
    /10X Buffer\s+((?:V[1-5]|UB)|[A-Za-z][A-Za-z0-9]*(?:\s+[A-Za-z0-9]+)*)(?=\s*,|\s+and\b|[.\s]*$)/i,
  )
  if (!match) return null
  const token = match[1]!.trim()
  if (/^V[1-5]$/i.test(token) || /^UB$/i.test(token)) return null
  return token
}

export function vivantisEnzymeSpecificBufferLabel(suppliedBuffer: string | null | undefined) {
  const name = vivantisEnzymeSpecificBufferName(suppliedBuffer)
  return name ? `Buffer ${name}` : null
}

export function vivantisSuppliedTableBufferCode(suppliedBuffer: string | null | undefined) {
  if (!suppliedBuffer) return null
  const match = suppliedBuffer.match(/10X Buffer\s+(V[1-5])\b/i)
  return match ? (match[1]!.toLowerCase() as VivantisTableBufferCode) : null
}

export function isVivantisUbOnlySupply(suppliedBuffer: string | null | undefined) {
  if (!suppliedBuffer) return false
  const normalized = suppliedBuffer.trim()
  return (
    /^10X Buffer UB\b/i.test(normalized) &&
    !/10X Buffer V[1-5]/i.test(normalized) &&
    !vivantisEnzymeSpecificBufferName(suppliedBuffer)
  )
}

export function normalizeVivantisSuppliedBuffer(raw: string | null | undefined) {
  if (!raw) {
    return { suppliedBuffer: null as string | null, catalogNotes: [] as string[], warnings: [] as string[] }
  }

  let text = raw.trim()
  const catalogNotes: string[] = []
  const warnings: string[] = []

  const storagePatterns = [
    /Enzyme is stable for up to[^.]*\./i,
    /It is recommended that the enzyme is kept in small aliquots?[^.]*(?:\.|$)/i,
  ]
  for (const pattern of storagePatterns) {
    const match = text.match(pattern)
    if (!match) continue
    catalogNotes.push(match[0]!.trim().replace(/\.$/, '') + (match[0]!.endsWith('.') ? '' : ''))
    text = text.replace(match[0], '').trim()
  }

  if (/High enzyme contraction may result in Star Activity/i.test(text)) {
    warnings.push('High enzyme concentration may result in star activity.')
    text = text.replace(/High enzyme contraction may result in Star Activity\.?/i, '').trim()
  }

  text = text.replace(/\s{2,}/g, ' ').replace(/\s+\./g, '.').trim()

  return { suppliedBuffer: text || null, catalogNotes, warnings }
}

export function sanitizeVivantisHeatInactivation(value: string | null | undefined) {
  if (!value) return null
  const trimmed = value.trim()
  if (/Quality Control|Digestion Reaction|Product Datasheet|Sterile Distilled Water|Example of Digestion/i.test(trimmed)) {
    return null
  }
  if (/^no\.?$/i.test(trimmed)) return 'NO'
  if (/^none\.?$/i.test(trimmed)) return 'NO'
  if (!/°\s*C|°C|\bC\s+for\b/i.test(trimmed)) return null
  const match = trimmed.match(/(\d+\s*°?\s*C(?:\s+for\s+\d+\s*(?:minutes?|mins?|hours?|hrs?))?)/i)
  return match ? match[1]!.trim().replace(/\.$/, '') : null
}

export function vivantisBufferColumnsFromActivity(
  _activity: Partial<Record<VivantisTableBufferCode, string>>,
) {
  void _activity
  return vivantisBufferColumns
}

export function bestPopulatedVivantisTableBuffer(
  activity: Partial<Record<VivantisTableBufferCode, string>>,
) {
  let best: VivantisTableBufferCode = 'v3'
  let bestScore = -1
  for (const code of preferredBufferOrder) {
    if (code === 'specific') continue
    const score = activityScore(activity[code])
    if (score > bestScore) {
      bestScore = score
      best = code
    }
  }
  return best
}

function reactionTableBufferCode(text: string) {
  const reactionMatch = text.match(/Reaction Conditions:\s*(?:1X\s+)?Buffer\s+(V[1-5]|UB)\b/i)
  if (reactionMatch) {
    return reactionMatch[1]!.toLowerCase() as VivantisTableBufferCode
  }
  if (/1X Buffer\s+UB\b/i.test(text)) return 'ub' as const
  return null
}

function populatedOrNull(
  code: VivantisTableBufferCode | null | undefined,
  activity: Partial<Record<VivantisTableBufferCode, string>>,
) {
  if (!code) return null
  return activity[code] ? code : null
}

export function reconcileVivantisPreferredBuffer(profile: {
  preferredBuffer: VivantisTableBufferCode | 'specific'
  suppliedBuffer: string | null | undefined
  bufferActivity: Partial<Record<VivantisTableBufferCode, string>>
  enzymeSpecificBuffer?: string | null
}) {
  const enzymeSpecificBuffer = profile.enzymeSpecificBuffer ?? vivantisEnzymeSpecificBufferLabel(profile.suppliedBuffer)
  if (enzymeSpecificBuffer) return 'specific' as const

  if (isVivantisUbOnlySupply(profile.suppliedBuffer) && profile.bufferActivity.ub) {
    return 'ub'
  }

  const suppliedCode = vivantisSuppliedTableBufferCode(profile.suppliedBuffer)
  let current = profile.preferredBuffer
  if (current === 'specific') current = suppliedCode ?? bestPopulatedVivantisTableBuffer(profile.bufferActivity)

  if (!populatedOrNull(current, profile.bufferActivity)) {
    if (suppliedCode && profile.bufferActivity[suppliedCode]) return suppliedCode
    return bestPopulatedVivantisTableBuffer(profile.bufferActivity)
  }

  if (suppliedCode && current !== suppliedCode && activityScore(profile.bufferActivity[current]) < 100) {
    if (profile.bufferActivity[suppliedCode]) return suppliedCode
  }

  return current
}

export function preferredVivantisTableBuffer(
  text: string,
  activity: Partial<Record<VivantisTableBufferCode, string>>,
  suppliedBuffer: string | null | undefined,
): VivantisTableBufferCode | 'specific' {
  if (vivantisEnzymeSpecificBufferName(suppliedBuffer)) return 'specific'
  if (isVivantisUbOnlySupply(suppliedBuffer) && activity.ub) return 'ub'

  const reactionCode = reactionTableBufferCode(text)
  const suppliedCode = vivantisSuppliedTableBufferCode(suppliedBuffer)

  if (reactionCode && suppliedCode && reactionCode !== suppliedCode) {
    const reactionScore = activityScore(activity[reactionCode])
    if (reactionScore < 100 && activity[suppliedCode]) return suppliedCode
  }

  const reactionPick = populatedOrNull(reactionCode, activity)
  if (reactionPick) return reactionPick

  const suppliedPick = populatedOrNull(suppliedCode, activity)
  if (suppliedPick) return suppliedPick

  return bestPopulatedVivantisTableBuffer(activity)
}

export function vivantisBufferPanelTitle(
  enzymeName: string,
  preferredBuffer: VivantisTableBufferCode | 'specific',
  enzymeSpecificBuffer: string | null | undefined,
) {
  if (enzymeSpecificBuffer) return `${enzymeName} Buffer: ${enzymeSpecificBuffer}`
  if (preferredBuffer !== 'specific') {
    if (preferredBuffer === 'ub') return `${enzymeName} Buffer: 1.0× Buffer UB`
    return `${enzymeName} Buffer: Buffer ${preferredBuffer.toUpperCase()}`
  }
  return `${enzymeName} Buffer`
}

export function finalizeVivantisProfile<
  T extends {
    suppliedBuffer: string | null
    preferredBuffer: VivantisTableBufferCode | 'specific'
    bufferActivity: Partial<Record<VivantisTableBufferCode, string>>
    heatInactivation: string | null
    enzymeSpecificBuffer?: string | null
    catalogNotes?: string[]
  },
>(profile: T, manualText = '') {
  const normalized = normalizeVivantisSuppliedBuffer(profile.suppliedBuffer)
  const suppliedBuffer = normalized.suppliedBuffer
  const enzymeSpecificBuffer =
    profile.enzymeSpecificBuffer ?? vivantisEnzymeSpecificBufferLabel(suppliedBuffer)
  const catalogNotes = [...(profile.catalogNotes ?? []), ...normalized.catalogNotes, ...normalized.warnings]
  const preferredBuffer = reconcileVivantisPreferredBuffer({
    preferredBuffer: manualText
      ? preferredVivantisTableBuffer(manualText, profile.bufferActivity, suppliedBuffer)
      : profile.preferredBuffer,
    suppliedBuffer,
    bufferActivity: profile.bufferActivity,
    enzymeSpecificBuffer,
  })

  return {
    ...profile,
    suppliedBuffer,
    enzymeSpecificBuffer,
    catalogNotes,
    preferredBuffer,
    heatInactivation: sanitizeVivantisHeatInactivation(profile.heatInactivation),
  }
}
