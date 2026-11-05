import type { PrimerDuplexTmConditions } from '../../domain/primerDuplexThermodynamics'

export type PrimerTmConditionValues = {
  monoMilliMolar: string
  magnesiumMilliMolar: string
  dntpMilliMolar: string
  oligoNanoMolar: string
}

export const defaultPrimerTmConditionValues: Readonly<PrimerTmConditionValues> = Object.freeze({
  monoMilliMolar: '50',
  magnesiumMilliMolar: '2',
  dntpMilliMolar: '0.8',
  oligoNanoMolar: '250',
})

export const snapGeneSaltConditionValues: Readonly<PrimerTmConditionValues> = Object.freeze({
  monoMilliMolar: '50',
  magnesiumMilliMolar: '0',
  dntpMilliMolar: '0',
  oligoNanoMolar: '250',
})

type TmConditionField = keyof PrimerTmConditionValues
type TmConditionErrors = Partial<Record<TmConditionField | 'ionicStrength', string>>

const fields: { key: TmConditionField; unit: string; min: number; max: number }[] = [
  { key: 'monoMilliMolar', unit: 'mM', min: 0, max: 1000 },
  { key: 'magnesiumMilliMolar', unit: 'mM', min: 0, max: 100 },
  { key: 'dntpMilliMolar', unit: 'mM', min: 0, max: 100 },
  { key: 'oligoNanoMolar', unit: 'nM', min: 0.1, max: 1_000_000 },
]

function numericValue(value: string) {
  return value.trim() === '' ? Number.NaN : Number(value)
}

export function primerTmConditionErrors(values: PrimerTmConditionValues): TmConditionErrors {
  const errors: TmConditionErrors = {}
  for (const field of fields) {
    const value = numericValue(values[field.key])
    if (!Number.isFinite(value)) {
      errors[field.key] = 'Enter a number.'
    } else if (value < field.min || value > field.max) {
      errors[field.key] = `Enter a value from ${field.min} to ${field.max} ${field.unit}.`
    }
  }

  if (Object.keys(errors).length === 0) {
    const monovalent = numericValue(values.monoMilliMolar)
    const magnesium = numericValue(values.magnesiumMilliMolar)
    if (monovalent === 0 && magnesium === 0) {
      errors.ionicStrength = 'Set monovalent salt or Mg²⁺ above 0 mM to calculate Tm.'
    }
  }
  return errors
}

export function primerTmConditionsForCalculation(values: PrimerTmConditionValues): PrimerDuplexTmConditions | null {
  if (Object.keys(primerTmConditionErrors(values)).length) return null
  return {
    monoConc: numericValue(values.monoMilliMolar) / 1000,
    mgConc: numericValue(values.magnesiumMilliMolar) / 1000,
    dntpConc: numericValue(values.dntpMilliMolar) / 1000,
    oligoConc: numericValue(values.oligoNanoMolar) / 1_000_000_000,
  }
}
