/** SnapGene "no color" features — open ends + mid stripe, not a solid fill. */
export function isFeatureNoColor(color: string | null | undefined) {
  if (!color) return false
  const normalized = color.trim().toLowerCase()
  return normalized === 'nocolor' || normalized === 'no color' || normalized === 'none'
}

/** Mid-body stripe thickness as a fraction of the feature band thickness. */
export const FEATURE_NOCOLOR_STRIPE_FRACTION = 1 / 3

export function featureNoColorStripeThickness(bandThicknessPx: number) {
  return Math.max(1, bandThicknessPx * FEATURE_NOCOLOR_STRIPE_FRACTION)
}
