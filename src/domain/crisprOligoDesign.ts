import { reverseComplement } from './sequence'

export type CrisprOligoRecipeId = 'geneart' | 'guide-it-sgrna1' | 'guide-it-ccgg' | 'aavpro-sacas9'

export type CrisprOligoDesignResult =
  | { ok: false; normalizedTarget: string; error: string }
  | {
      ok: true
      normalizedTarget: string
      expressedGuide: string
      sense: string
      antisense: string
      note: string
    }

/** Final strand sequences for an entered protospacer, without its genomic PAM. */
export function designPreLinearizedOligos(
  recipe: CrisprOligoRecipeId,
  input: string,
): CrisprOligoDesignResult {
  const target = input.toUpperCase().replace(/\s+/g, '')
  if (!target) return { ok: false, normalizedTarget: target, error: 'Enter a target sequence without its PAM.' }
  if (!/^[ACGT]+$/.test(target)) return {
    ok: false,
    normalizedTarget: target,
    error: 'Use only A, C, G, and T; do not include a PAM or punctuation.',
  }
  const minLength = recipe === 'geneart' ? 19 : 20
  const maxLength = recipe === 'geneart' ? 20 : recipe === 'aavpro-sacas9' ? 22 : 20
  if (target.length < minLength || target.length > maxLength) return {
    ok: false,
    normalizedTarget: target,
    error: `Enter ${minLength === maxLength ? minLength : `${minLength}–${maxLength}`} nt for this vector recipe (received ${target.length} nt).`,
  }

  if (recipe === 'geneart') return {
    ok: true,
    normalizedTarget: target,
    expressedGuide: `G${target}`,
    sense: `${target}GTTTT`,
    antisense: `${reverseComplement(target)}CGGTG`,
    note: 'The promoter end supplies the leading transcriptional G; it is not repeated in the sense oligo.',
  }

  if (recipe === 'guide-it-sgrna1') {
    const expressedGuide = target.startsWith('G') ? target : `G${target}`
    return {
      ok: true,
      normalizedTarget: target,
      expressedGuide,
      sense: `CACC${expressedGuide}`,
      antisense: `AAAC${reverseComplement(expressedGuide)}`,
      note: target.startsWith('G')
        ? 'The target begins with the U6 initiation G.'
        : 'A leading G was added for U6 initiation, with its complementary terminal C on the antisense oligo.',
    }
  }

  if (recipe === 'guide-it-ccgg') return {
    ok: true,
    normalizedTarget: target,
    expressedGuide: `G${target}`,
    sense: `CCGG${target}`,
    antisense: `AAAC${reverseComplement(target)}`,
    note: 'The CCGG promoter junction supplies the initiation G.',
  }

  return {
    ok: true,
    normalizedTarget: target,
    expressedGuide: `G${target}`,
    sense: `ACCG${target}`,
    antisense: `AAAC${reverseComplement(target)}`,
    note: 'The ACCG promoter junction supplies the initiation G for this SaCas9 guide.',
  }
}
