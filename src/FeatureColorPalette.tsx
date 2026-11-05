import { featureColors } from './domain/parserRecord'

export function FeatureColorPalette({
  color,
  disabled = false,
  onChange,
}: {
  color: string
  disabled?: boolean
  onChange: (color: string) => void
}) {
  return (
    <input
      className="feature-color-input"
      type="color"
      aria-label="Feature color"
      value={/^#[0-9a-f]{6}$/i.test(color) ? color : featureColors.misc_feature}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    />
  )
}
