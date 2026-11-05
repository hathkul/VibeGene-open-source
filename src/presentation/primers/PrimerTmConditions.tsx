import { useId } from 'react'
import {
  defaultPrimerTmConditionValues,
  primerTmConditionErrors,
  snapGeneSaltConditionValues,
  type PrimerTmConditionValues,
} from './PrimerTmConditionsModel'
import './PrimerTmConditions.css'

const fields: { key: keyof PrimerTmConditionValues; label: string; unit: string; min: number; max: number; step: string }[] = [
  { key: 'monoMilliMolar', label: 'Monovalent salt (Na⁺ equivalent)', unit: 'mM', min: 0, max: 1000, step: 'any' },
  { key: 'magnesiumMilliMolar', label: 'Mg²⁺', unit: 'mM', min: 0, max: 100, step: 'any' },
  { key: 'dntpMilliMolar', label: 'Total dNTP', unit: 'mM', min: 0, max: 100, step: 'any' },
  { key: 'oligoNanoMolar', label: 'Oligo concentration', unit: 'nM', min: 0.1, max: 1_000_000, step: 'any' },
]

function shownValue(value: string) {
  return value === '' ? '—' : value
}

export function PrimerTmConditions({
  value,
  onChange,
}: {
  value: PrimerTmConditionValues
  onChange: (next: PrimerTmConditionValues) => void
}) {
  const id = useId()
  const errors = primerTmConditionErrors(value)
  const allErrors = Object.values(errors)

  return (
    <details className="primer-tm-conditions">
      <summary>
        Tm reaction assumptions: Na {shownValue(value.monoMilliMolar)} mM, Mg²⁺ {shownValue(value.magnesiumMilliMolar)} mM, dNTP {shownValue(value.dntpMilliMolar)} mM, oligo {shownValue(value.oligoNanoMolar)} nM
      </summary>
      <div className="primer-tm-conditions__body" role="group" aria-label="Primer Tm reaction assumptions">
        <div className="primer-tm-conditions__fields">
          {fields.map((field) => {
            const inputId = `${id}-${field.key}`
            const errorId = `${inputId}-error`
            const error = errors[field.key]
            const ionicError = field.key === 'monoMilliMolar' ? errors.ionicStrength : undefined
            const describedBy = [error && errorId, ionicError && `${id}-ionic-error`].filter(Boolean).join(' ') || undefined
            return (
              <label className="primer-tm-conditions__field" key={field.key} htmlFor={inputId}>
                <span>{field.label} ({field.unit})</span>
                <input
                  id={inputId}
                  type="number"
                  min={field.min}
                  max={field.max}
                  step={field.step}
                  inputMode="decimal"
                  value={value[field.key]}
                  aria-invalid={Boolean(error || ionicError)}
                  aria-describedby={describedBy}
                  onChange={(event) => onChange({ ...value, [field.key]: event.currentTarget.value })}
                />
                {error && <span className="primer-tm-conditions__field-error" id={errorId}>{error}</span>}
              </label>
            )
          })}
        </div>
        {errors.ionicStrength && <p className="primer-tm-conditions__error" id={`${id}-ionic-error`} role="alert">{errors.ionicStrength}</p>}
        {allErrors.length > 0 && <p className="primer-tm-conditions__note" role="status">Tm values are unavailable until the reaction assumptions are valid.</p>}
        <div className="primer-tm-conditions__presets">
          <button type="button" onClick={() => onChange({ ...defaultPrimerTmConditionValues })}>Use defaults</button>
          <button type="button" onClick={() => onChange({ ...snapGeneSaltConditionValues })}>50 mM Na, no Mg preset</button>
        </div>
        <p className="primer-tm-conditions__note">
          These assumptions apply only while this primer editor is open. The preset sets salt conditions; it does not select or reproduce SnapGene’s calculation algorithm.
        </p>
      </div>
    </details>
  )
}
