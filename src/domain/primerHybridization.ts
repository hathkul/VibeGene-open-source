export type PrimerHybridizationParams = {
  /** Minimum number of matching bases required at the primer 3′ end. */
  minContinuousMatchLen: number
  /** Allow one isolated mismatch inside the 3′ continuous match region (not at the terminus). */
  allowMismatch: boolean
  /** Minimum melting temperature (°C) of the terminal duplex to display a binding site. */
  minMeltingTemperature: number
}

export const defaultPrimerHybridizationParams: PrimerHybridizationParams = {
  minContinuousMatchLen: 10,
  allowMismatch: true,
  minMeltingTemperature: 40,
}

export function normalizePrimerHybridizationParams(
  value?: Partial<PrimerHybridizationParams> | null,
): PrimerHybridizationParams {
  return {
    minContinuousMatchLen: clampInt(
      value?.minContinuousMatchLen ?? defaultPrimerHybridizationParams.minContinuousMatchLen,
      1,
      60,
    ),
    allowMismatch: value?.allowMismatch ?? defaultPrimerHybridizationParams.allowMismatch,
    minMeltingTemperature: clampInt(
      value?.minMeltingTemperature ?? defaultPrimerHybridizationParams.minMeltingTemperature,
      0,
      100,
    ),
  }
}

function clampInt(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min
  return Math.max(min, Math.min(max, Math.round(value)))
}

export function formatHybridizationParamsXml(params: PrimerHybridizationParams, modern = true): string {
  const normalized = normalizePrimerHybridizationParams(params)
  const allow = normalized.allowMismatch ? '1' : '0'
  const core = `minContinuousMatchLen="${normalized.minContinuousMatchLen}" allowMismatch="${allow}" minMeltingTemperature="${normalized.minMeltingTemperature}"`
  if (modern) {
    return `<HybridizationParams ${core} showAdditionalFivePrimeMatches="1" minimumFivePrimeAnnealing="15"/>`
  }
  return `<HybridizationParams ${core}/>`
}

export function parseHybridizationParamsFromXml(xml: string): PrimerHybridizationParams | null {
  const match = xml.match(/<HybridizationParams\b([^>]*)\/?>/i)
  if (!match) return null
  const attrs = match[1] ?? ''
  const read = (name: string) => {
    const found = attrs.match(new RegExp(`${name}="([^"]*)"`, 'i'))
    return found?.[1]
  }
  const minLen = Number(read('minContinuousMatchLen'))
  const minTm = Number(read('minMeltingTemperature'))
  const allowRaw = read('allowMismatch')
  return normalizePrimerHybridizationParams({
    minContinuousMatchLen: Number.isFinite(minLen) ? minLen : undefined,
    minMeltingTemperature: Number.isFinite(minTm) ? minTm : undefined,
    allowMismatch: allowRaw === undefined ? undefined : allowRaw !== '0',
  })
}
