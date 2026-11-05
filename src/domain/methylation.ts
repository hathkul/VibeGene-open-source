import { effectiveHostMethylation } from './constructProperties'
import {
  buildMethylationContext,
  methylationRulesForEnzyme,
  resolveSiteMethylationFromRules,
  type MethylationContext,
} from './methylationRules'
import type { ConstructProperties, HostMethylationStatus, RestrictionEnzyme, RestrictionSite, SiteMethylationDisplay, Topology } from './types'

export type MethylaseSensitivity = 'none' | 'blocked' | 'required'

export function parseMethylationSensitivity(note: string): MethylaseSensitivity {
  const normalized = note.trim().toLowerCase()
  if (!normalized || normalized === 'no effect') return 'none'
  if (normalized.includes('cleaves methylated and unmethylated')) return 'none'
  if (normalized.includes('requires') || normalized.includes('cleaves only')) return 'required'
  if (normalized.includes('blocked') || normalized.includes('inhibition')) return 'blocked'
  if (normalized.includes('sensitive') && normalized.includes('neb chart substrate')) return 'none'
  if (normalized.includes('sensitive')) return 'blocked'
  return 'none'
}

export function enzymeMethylationSensitivity(enzyme: RestrictionEnzyme) {
  const rules = methylationRulesForEnzyme(enzyme)
  const toSensitivity = (effect: (typeof rules)['dam']['effect']): MethylaseSensitivity => {
    if (effect === 'requires' || effect === 'requires_5mc') return 'required'
    if (effect === 'blocked_context' || effect === 'blocked_overlap') return 'blocked'
    return 'none'
  }
  return {
    dam: toSensitivity(rules.dam.effect),
    dcm: toSensitivity(rules.dcm.effect),
    ecoKI: toSensitivity(rules.ecoKI.effect),
  }
}

export function resolveSiteMethylationDisplay(
  site: RestrictionSite,
  sequence: string,
  host: HostMethylationStatus,
  context?: MethylationContext,
): SiteMethylationDisplay {
  return resolveSiteMethylationFromRules(site, sequence, host, context)
}

export function annotateRestrictionSiteMethylation(
  sites: RestrictionSite[],
  sequence: string,
  construct: ConstructProperties,
  topology: Topology = 'circular',
): RestrictionSite[] {
  const host = effectiveHostMethylation(construct)
  const context = buildMethylationContext(sequence, topology)
  return sites.map((site) => ({
    ...site,
    methylationDisplay: resolveSiteMethylationDisplay(site, sequence, host, context),
  }))
}

export function formatEnzymeLabelName(enzymeName: string, methylationDisplay: SiteMethylationDisplay = 'normal') {
  if (methylationDisplay === 'blocked' || methylationDisplay === 'methyl-required-available') {
    return `${enzymeName}*`
  }
  return enzymeName
}

export function enzymeSiteDisplayName(
  site: RestrictionSite,
  showPositions: boolean,
  positionMode: 'start' | 'cut' = 'start',
) {
  const name = formatEnzymeLabelName(site.enzyme.name, site.methylationDisplay ?? 'normal')
  if (!showPositions) return name
  const position = positionMode === 'cut' ? site.cutTop + 1 : site.start + 1
  return `${name} (${position})`
}
