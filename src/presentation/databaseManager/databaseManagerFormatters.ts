import { calculateAnnealTemperature } from '../../domain/primerThermodynamics'
import { gcContent } from '../../domain/sequence'
import { peptideMassDa } from '../../domain/commonFeatures'

export function formatPrimerOligoTm(sequence: string): string {
  const tm = calculateAnnealTemperature(sequence).tmC
  if (tm === null || !Number.isFinite(tm)) return '—'
  return `${tm.toFixed(1)} °C`
}

export function formatPrimerGcPercent(sequence: string): string {
  return `${gcContent(sequence).toFixed(0)}%`
}

export function proteinMassLabelFromSequence(sequence: string): string {
  const mass = peptideMassDa(sequence)
  if (!mass) return '—'
  if (mass >= 1000) return `${(mass / 1000).toFixed(1)} kDa`
  return `${Math.round(mass)} Da`
}

export function projectConstructNameVisible(
  constructName: string,
  fileName: string,
): boolean {
  const trimmed = constructName.trim()
  const fileStem = fileName.replace(/\.[^.]+$/, '').trim()
  return (
    trimmed.localeCompare(fileName, undefined, { sensitivity: 'base' }) !== 0 &&
    trimmed.localeCompare(fileStem, undefined, { sensitivity: 'base' }) !== 0
  )
}
