import { useEffect, useMemo, useState } from 'react'
import {
  DEFAULT_VECTOR_AMOUNT_NG,
  defaultLigationMultiplicity,
  formatMolarRatio,
  formatRecipeQuantity,
  ligationInsertAmountNg,
  ligationVolumeUl,
  parseRecipeNumber,
  type CloningRecipePart,
} from './domain/cloningRecipe'

type CloningRecipeDialogProps = {
  productName: string
  parts: CloningRecipePart[]
  junctionsBlunt: boolean
  /** Linear ligation uses an equimolar reference fragment, not a vector. */
  linearLigation?: boolean
  /** Multiple reactions selected from a cloning-product library. */
  recipes?: Array<{
    id: string
    productName: string
    parts: CloningRecipePart[]
    junctionsBlunt: boolean
    linearLigation?: boolean
  }>
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

function CloningRecipeGroup({
  productName,
  parts,
  junctionsBlunt,
  linearLigation = false,
  showHeading,
}: Omit<CloningRecipeDialogProps, 'onClose' | 'recipes'> & { showHeading: boolean }) {
  const vector = parts.find((part) => part.role === 'vector')
  const inserts = useMemo(() => parts.filter((part) => part.role === 'insert'), [parts])
  const multiplicityFor = (insert: CloningRecipePart) =>
    linearLigation
      ? 1
      : defaultLigationMultiplicity({
          insertLengthBp: insert.lengthBp,
          junctionsBlunt,
        })

  const [vectorAmountNg, setVectorAmountNg] = useState(String(DEFAULT_VECTOR_AMOUNT_NG))
  const [vectorConcentration, setVectorConcentration] = useState('')
  const [insertConcentrations, setInsertConcentrations] = useState<Record<string, string>>({})
  const [multiplicities, setMultiplicities] = useState<Record<string, string>>(() =>
    Object.fromEntries(inserts.map((insert) => [insert.id, String(multiplicityFor(insert))])),
  )

  if (!vector) return null

  const vectorNg = parseRecipeNumber(vectorAmountNg)
  const vectorConc = parseRecipeNumber(vectorConcentration)
  const vectorUl =
    vectorNg !== null && vectorConc !== null ? ligationVolumeUl(vectorNg, vectorConc) : null

  return (
    <>
        {showHeading ? <h4 className="cloning-recipe-member-heading">{productName.replace(/\.dna$/i, '')}</h4> : null}
        <table className="cloning-recipe-table">
          <colgroup>
            <col className="cloning-recipe-col-name" />
            <col className="cloning-recipe-col-size" />
            <col className="cloning-recipe-col-ratio" />
            <col className="cloning-recipe-col-mult" />
            <col className="cloning-recipe-col-amount" />
            <col className="cloning-recipe-col-conc" />
            <col className="cloning-recipe-col-vol" />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">Fragment</th>
              <th scope="col">Size</th>
              <th scope="col" title="Insert:vector length ratio (equimolar masses)">
                Molar ratio
              </th>
              <th scope="col" title="How many times more insert moles than vector moles">
                Multiplicity
              </th>
              <th scope="col">Amount (ng)</th>
              <th scope="col">Conc. (ng/µl)</th>
              <th scope="col">Volume (µl)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <div className="cloning-recipe-fragment">
                  <span className="cloning-recipe-name" title={vector.name}>
                    {vector.name}
                  </span>
                  <span className="cloning-recipe-role">{linearLigation ? 'reference fragment' : 'vector'}</span>
                </div>
              </td>
              <td>{vector.lengthBp.toLocaleString()} bp</td>
              <td>—</td>
              <td>1</td>
              <td>
                <NumericInput
                  value={vectorAmountNg}
                  onChange={setVectorAmountNg}
                  ariaLabel={linearLigation ? 'Reference fragment amount (ng)' : 'Vector amount (ng)'}
                  autoFocus
                />
              </td>
              <td>
                <NumericInput
                  value={vectorConcentration}
                  onChange={setVectorConcentration}
                  ariaLabel={linearLigation ? 'Reference fragment concentration (ng/µl)' : 'Vector concentration (ng/µl)'}
                />
              </td>
              <td>{formatRecipeQuantity(vectorUl)}</td>
            </tr>
            {inserts.map((insert, index) => {
              const multiplicityRaw = multiplicities[insert.id] ?? String(multiplicityFor(insert))
              const multiplicity = parseRecipeNumber(multiplicityRaw)
              const insertNg =
                vectorNg !== null && multiplicity !== null
                  ? ligationInsertAmountNg({
                      vectorAmountNg: vectorNg,
                      vectorLengthBp: vector.lengthBp,
                      insertLengthBp: insert.lengthBp,
                      multiplicity,
                    })
                  : null
              const insertConc = parseRecipeNumber(insertConcentrations[insert.id] ?? '')
              const insertUl =
                insertNg !== null && insertConc !== null
                  ? ligationVolumeUl(insertNg, insertConc)
                  : null
              const insertLabel = linearLigation ? `Fragment ${index + 2}` : inserts.length > 1 ? `Insert ${index + 1}` : 'Insert'
              return (
                <tr key={insert.id}>
                  <td>
                    <div className="cloning-recipe-fragment">
                      <span className="cloning-recipe-name" title={insert.name}>
                        {insert.name}
                      </span>
                      <span className="cloning-recipe-role">{insertLabel.toLowerCase()}</span>
                    </div>
                  </td>
                  <td>{insert.lengthBp.toLocaleString()} bp</td>
                  <td title="Insert:vector length ratio">
                    {formatMolarRatio(insert.lengthBp, vector.lengthBp)}
                  </td>
                  <td>
                    <span className="cloning-recipe-multiplicity">
                      <NumericInput
                        value={multiplicityRaw}
                        onChange={(value) =>
                          setMultiplicities((current) => ({ ...current, [insert.id]: value }))
                        }
                        ariaLabel={`${insertLabel} multiplicity`}
                      />
                      <span className="cloning-recipe-mult-suffix">: 1</span>
                    </span>
                  </td>
                  <td>{formatRecipeQuantity(insertNg)}</td>
                  <td>
                    <NumericInput
                      value={insertConcentrations[insert.id] ?? ''}
                      onChange={(value) =>
                        setInsertConcentrations((current) => ({ ...current, [insert.id]: value }))
                      }
                      ariaLabel={`${insertLabel} concentration (ng/µl)`}
                    />
                  </td>
                  <td>{formatRecipeQuantity(insertUl)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {!showHeading ? <p className="cloning-recipe-note">
          {linearLigation ? 'Fragment ng = reference ng × (fragment bp / reference bp) × multiplicity.' : 'Insert ng = vector ng × (insert bp / vector bp) × multiplicity. Default multiplicity rises'}
          {!linearLigation ? ' for shorter inserts (10:1 at ≤60 bp) and for blunt junctions (3:1 sticky / 5:1 blunt for typical fragments).' : ''}
        </p> : null}
    </>
  )
}

export function CloningRecipeDialog({
  productName,
  parts,
  junctionsBlunt,
  linearLigation,
  recipes,
  onClose,
}: CloningRecipeDialogProps) {
  const groups = recipes?.length
    ? recipes
    : [{ id: 'single', productName, parts, junctionsBlunt, linearLigation }]

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
        className="translation-dialog cloning-recipe-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cloning-recipe-title"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <h3 id="cloning-recipe-title">Cloning recipe</h3>
        {groups.length === 1 ? (
          <p className="cloning-recipe-product" title={productName}>{productName.replace(/\.dna$/i, '')}</p>
        ) : (
          <p className="cloning-recipe-product">{groups.length} selected library members</p>
        )}
        <div className={groups.length > 1 ? 'cloning-recipe-groups' : undefined}>
          {groups.map((group) => (
          <CloningRecipeGroup key={group.id} {...group} showHeading={groups.length > 1} />
          ))}
        </div>
        {groups.length > 1 ? <p className="cloning-recipe-note">
          Each section is an independent reaction.
        </p> : null}
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
