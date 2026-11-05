import { calculateAnnealTemperature } from '../../domain/primerThermodynamics'

export function primerOligoTm(sequence: string): number | null {
  const tm = calculateAnnealTemperature(sequence).tmC
  return tm !== null && Number.isFinite(tm) ? tm : null
}
