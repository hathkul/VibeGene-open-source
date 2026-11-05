import {
  cutEndOverhangPolarity,
  samePolarityTreatmentsConflict,
  validateCloningAssembly,
  validateFragmentDeletion,
  validateLinearLigation,
  validateSiteDestruction,
  type CloningPartConfig,
  type CloningValidation,
  type ResolvedCloningPart,
} from '../../domain/restrictionCloning'

export function calculateRestrictionValidation(
  destroying: boolean,
  deleting: boolean,
  ligating: boolean,
  resolvedVector: ResolvedCloningPart | null,
  vector: CloningPartConfig,
  resolvedInserts: Array<ResolvedCloningPart | null>,
  insertOrder: number[],
  inserts: CloningPartConfig[],
  activeInserts: Array<ResolvedCloningPart | null>,
  activeInsertOrder: number[],
): CloningValidation {
  if (destroying) return validateSiteDestruction(resolvedVector, vector)
  if (deleting) return validateFragmentDeletion(resolvedVector, vector)
  if (ligating) {
    const assembly = validateLinearLigation(resolvedInserts, insertOrder)
    for (let index = 0; index < inserts.length; index += 1) {
      const config = inserts[index]!
      if (!samePolarityTreatmentsConflict(config.leftCut, config.rightCut)) continue
      const polarity = cutEndOverhangPolarity(config.leftCut)
      const polarityLabel = polarity === "5'" ? '5′' : polarity === "3'" ? '3′' : 'sticky'
      return {
        ready: false,
        closed: false,
        message: `Fragment ${index + 1}: cannot fill one ${polarityLabel} overhang and remove the other on the same fragment — choose one treatment for both ${polarityLabel} ends.`,
        issues: [
          {
            leftLabel: `Fragment ${index + 1}`,
            rightLabel: `Fragment ${index + 1}`,
            message: `Conflicting ${polarityLabel} overhang treatments.`,
          },
        ],
        productLength: assembly.productLength,
      }
    }
    return assembly
  }

  const assembly = validateCloningAssembly(resolvedVector, activeInserts, activeInsertOrder)
  const conflictConfigs: Array<{ label: string; config: CloningPartConfig }> = [
    { label: 'Vector', config: vector },
    ...inserts.map((config, index) => ({
      label: `Insert ${index + 1}`,
      config,
    })),
  ]
  for (const { label, config } of conflictConfigs) {
    if (!samePolarityTreatmentsConflict(config.leftCut, config.rightCut)) continue
    const polarity = cutEndOverhangPolarity(config.leftCut)
    const polarityLabel = polarity === "5'" ? '5′' : polarity === "3'" ? '3′' : 'sticky'
    return {
      ready: false,
      closed: false,
      message: `${label}: cannot fill one ${polarityLabel} overhang and remove the other on the same fragment — choose one treatment for both ${polarityLabel} ends.`,
      issues: [
        {
          leftLabel: label,
          rightLabel: label,
          message: `Conflicting ${polarityLabel} overhang treatments.`,
        },
      ],
      productLength: assembly.productLength,
    }
  }
  return assembly
}
