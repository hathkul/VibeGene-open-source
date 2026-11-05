import { useEffect, useMemo, useState } from 'react'
import { readAppPreferences } from './domain/appPreferences'
import {
  DEFAULT_PCR_MIX_SETTINGS,
  DEFAULT_REACTION_COUNT,
  formatPcrDuration,
  formatPcrTemperature,
  formatPcrTm,
  formatRecipeQuantity,
  mixVolumeForReactions,
  parseRecipeNumber,
  pcrMixComponents,
  type PcrMixSettings,
  type PcrRecipeContext,
} from './domain/pcrRecipe'

type PcrRecipeDialogProps = {
  recipe: PcrRecipeContext
  mixDefaults?: PcrMixSettings
  onClose: () => void
}

function NumericInput({
  value,
  onChange,
  ariaLabel,
  autoFocus,
}: {
  value: string
  onChange: (value: string) => void
  ariaLabel: string
  autoFocus?: boolean
}) {
  return (
    <input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      spellCheck={false}
      aria-label={ariaLabel}
      autoFocus={autoFocus}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  )
}

function PcrRecipeReaction({
  recipe,
  defaults,
  heading,
  autoFocus = false,
}: {
  recipe: PcrRecipeContext
  defaults: PcrMixSettings
  heading?: string
  autoFocus?: boolean
}) {
  const [volumeUl, setVolumeUl] = useState(String(defaults.reactionVolumeUl))
  const [reactions, setReactions] = useState(String(DEFAULT_REACTION_COUNT))
  const [primerStockuM, setPrimerStockuM] = useState(String(defaults.primerStockuM))
  const [bufferFold, setBufferFold] = useState(String(defaults.bufferFold))
  const [dntpStockmM, setDntpStockmM] = useState(String(defaults.dntpStockmM))
  const [polymeraseUl, setPolymeraseUl] = useState(String(defaults.polymeraseUl))
  const [templateUl, setTemplateUl] = useState(String(defaults.templateUl))

  const volume = parseRecipeNumber(volumeUl)
  const reactionCount = parseRecipeNumber(reactions)
  const stock = parseRecipeNumber(primerStockuM)
  const buffer = parseRecipeNumber(bufferFold)
  const dntp = parseRecipeNumber(dntpStockmM)
  const polymerase = parseRecipeNumber(polymeraseUl)
  const template = parseRecipeNumber(templateUl)
  const mix = useMemo(() => {
    if (volume === null || stock === null) return []
    return pcrMixComponents({
      volumeUl: volume,
      enzymeFamily: recipe.enzymeFamily,
      primerNames: recipe.primers.map((primer) => primer.name),
      primerStockuM: stock,
      primerFinaluM: recipe.primerFinaluM,
      bufferFold: buffer ?? undefined,
      dntpStockmM: dntp ?? undefined,
      dntpFinalmM: defaults.dntpFinalmM,
      polymeraseUl: polymerase ?? undefined,
      templateUl: template ?? undefined,
    })
  }, [
    buffer,
    defaults.dntpFinalmM,
    dntp,
    polymerase,
    recipe.enzymeFamily,
    recipe.primerFinaluM,
    recipe.primers,
    stock,
    template,
    volume,
  ])

  const enzymeLabel = recipe.enzymeFamily === 'taq' ? 'Taq (A-overhang)' : 'High-fidelity'
  const cycleCount = recipe.program.filter((step) => step.inCycle).length

  return (
    <section className={heading ? 'pcr-recipe-reaction' : undefined}>
        {heading ? <h4 className="pcr-recipe-stage-heading">{heading}</h4> : null}
        <p className="pcr-recipe-product" title={recipe.productName}>
          {recipe.productName}
          <span>
            {recipe.productLengthBp.toLocaleString()} bp
            {recipe.productGcPercent !== null ? ` · ${recipe.productGcPercent.toFixed(0)}% GC` : ''}
            {` · ${enzymeLabel}`}
          </span>
        </p>

        {recipe.primers.some((primer) => primer.sequence) ? (
          <table className="pcr-recipe-table">
            <thead>
              <tr>
                <th scope="col">Primer</th>
                <th scope="col">Length</th>
                <th scope="col" title="Nearest-neighbor Tm of the 3′ annealing stretch">
                  Tm
                </th>
              </tr>
            </thead>
            <tbody>
              {recipe.primers.map((primer) => (
                <tr key={primer.id}>
                  <td>
                    <span className="pcr-recipe-name" title={primer.name}>
                      {primer.name}
                    </span>
                  </td>
                  <td>
                    {primer.length ? `${primer.length} nt` : '—'}
                    {primer.annealLength > 0 && primer.annealLength < primer.length
                      ? ` (anneal ${primer.annealLength})`
                      : ''}
                  </td>
                  <td>{formatPcrTm(primer.tmC)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}

        <h4 className="pcr-recipe-heading">
          Program
          <span>
            {recipe.cycles} cycles
            {recipe.twoStep ? ' · two-step' : ''}
          </span>
        </h4>
        <table className="pcr-recipe-table">
          <thead>
            <tr>
              <th scope="col">Step</th>
              <th scope="col">Temp</th>
              <th scope="col">Time</th>
            </tr>
          </thead>
          <tbody>
            {recipe.program.map((step) => (
              <tr key={step.id} className={step.inCycle ? 'is-cycle' : undefined}>
                <td>
                  {step.label}
                  {step.inCycle && step.id === 'cycle-denature' ? ` × ${recipe.cycles}` : ''}
                </td>
                <td>{formatPcrTemperature(step.temperatureC)}</td>
                <td>{formatPcrDuration(step.durationSeconds)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {cycleCount > 0 ? (
          <p className="pcr-recipe-note">
            Shaded steps repeat for {recipe.cycles} cycles.
            {recipe.enzymeFamily === 'taq'
              ? ' Taq profile: Ta ≈ Tm − 5 °C, 1 min/kb extension.'
              : ' High-fidelity profile: Ta ≈ primer Tm, 20 s/kb extension.'}
          </p>
        ) : null}

        {recipe.notes.length > 0 ? (
          <ul className="pcr-recipe-warnings">
            {recipe.notes.map((note) => (
              <li key={note.text} className={note.severity === 'warning' ? 'is-warning' : undefined}>
                {note.text}
              </li>
            ))}
          </ul>
        ) : null}

        <h4 className="pcr-recipe-heading">Mix</h4>
        <div className="pcr-recipe-controls">
          <label>
            Volume (µl)
            <NumericInput value={volumeUl} onChange={setVolumeUl} ariaLabel="PCR volume (µl)" autoFocus={autoFocus} />
          </label>
          <label>
            Reactions
            <NumericInput value={reactions} onChange={setReactions} ariaLabel="Number of reactions" />
          </label>
          <label>
            Primer stock (µM)
            <NumericInput
              value={primerStockuM}
              onChange={setPrimerStockuM}
              ariaLabel="Primer stock concentration (µM)"
            />
          </label>
          <label>
            Buffer (×)
            <NumericInput value={bufferFold} onChange={setBufferFold} ariaLabel="PCR buffer fold" />
          </label>
          <label>
            dNTP (mM)
            <NumericInput value={dntpStockmM} onChange={setDntpStockmM} ariaLabel="dNTP stock concentration (mM)" />
          </label>
          <label>
            Polymerase (µl)
            <NumericInput
              value={polymeraseUl}
              onChange={setPolymeraseUl}
              ariaLabel="Polymerase volume (µl per reaction)"
            />
          </label>
          <label>
            Template DNA (µl)
            <NumericInput
              value={templateUl}
              onChange={setTemplateUl}
              ariaLabel="Template DNA volume (µl per reaction)"
            />
          </label>
        </div>
        <table className="pcr-recipe-table pcr-recipe-mix">
          <thead>
            <tr>
              <th scope="col">Component</th>
              <th scope="col">Stock</th>
              <th scope="col">1× (µl)</th>
              <th scope="col">
                {reactionCount !== null && reactionCount !== 1
                  ? `${formatRecipeQuantity(reactionCount)}× (µl)`
                  : 'Total (µl)'}
              </th>
            </tr>
          </thead>
          <tbody>
            {mix.map((row) => (
              <tr key={row.id}>
                <td>
                  <span className="pcr-recipe-name" title={row.name}>
                    {row.name}
                  </span>
                </td>
                <td>{row.stock}</td>
                <td>{formatRecipeQuantity(row.ulPerReaction)}</td>
                <td>{formatRecipeQuantity(mixVolumeForReactions(row.ulPerReaction, reactionCount ?? 0))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="pcr-recipe-note">
          Primer final concentration is {formatRecipeQuantity(recipe.primerFinaluM)} µM each. Buffer volume is
          reaction ÷ fold; dNTP volume uses {formatRecipeQuantity(defaults.dntpFinalmM)} mM final from Preferences.
          Polymerase and template DNA are µl per reaction. Aim for ~1–10 ng plasmid or 20–100 ng genomic DNA per
          20 µl.
        </p>
    </section>
  )
}

export function PcrRecipeDialog({ recipe, mixDefaults, onClose }: PcrRecipeDialogProps) {
  const defaults = mixDefaults ?? readAppPreferences().pcr ?? DEFAULT_PCR_MIX_SETTINGS
  const primaryReactions = recipe.primaryReactions ?? []

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  return (
    <div className="translation-dialog-backdrop" role="presentation" onPointerDown={onClose}>
      <div
        className="translation-dialog pcr-recipe-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pcr-recipe-title"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <h3 id="pcr-recipe-title">PCR recipe</h3>
        {primaryReactions.length ? <p className="pcr-recipe-note">Prepare the primary overlapping fragments first, then use them as templates for the joining PCR.</p> : null}
        {primaryReactions.map((primary, index) => (
          <PcrRecipeReaction
            key={`${primary.productName}:${index}`}
            recipe={primary}
            defaults={defaults}
            heading={`Step 1 · Primary PCR — fragment ${index + 1}`}
          />
        ))}
        <PcrRecipeReaction
          recipe={recipe}
          defaults={defaults}
          heading={primaryReactions.length ? 'Step 2 · Overlap-extension PCR' : undefined}
          autoFocus
        />
        <div className="translation-dialog-footer">
          <span />
          <button type="button" className="primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
