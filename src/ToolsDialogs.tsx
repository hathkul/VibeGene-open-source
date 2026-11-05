import { useMemo, useState, type ReactNode } from 'react'
import {
  dnaLetterCodes,
  getEnzymeByName,
  listCatalogEnzymeNames,
  manufacturersForEnzyme,
  proteinLetterCodes,
} from './domain/enzymeCatalog'
import { recommendDoubleDigest } from './domain/doubleDigest'
import {
  codonFrequencyForOrganism,
  codonUsageOrganismOptions,
  type CodonUsageOrganism,
} from './domain/codonUsage'
import {
  dnaMwStats,
  dsDnaMolecularWeightDa,
  formatMwDa,
  formatPmolPerUg,
  formatUgPerPmol,
  stickyDsDnaMolecularWeightDa,
} from './domain/dnaMolecularWeight'
import {
  codonMapForGeneticCode,
  formatAminoAcidCode,
  GENETIC_CODE_NAMES,
} from './domain/geneticCode'
import { extractRange } from './domain/sequence'
import type { EnzymeManufacturerId, Topology } from './domain/types'

const CODON_BASES = ['T', 'C', 'A', 'G'] as const

export type ToolsMwSelection =
  | {
      kind: 'range'
      start: number
      end: number
      label: string
    }
  | {
      kind: 'sticky'
      forward: { start: number; end: number }
      reverse: { start: number; end: number }
      lengthBp: number
      label: string
    }

type DnaMolecularWeightDialogProps = {
  name: string
  sequence: string
  topology: Topology
  selection: ToolsMwSelection | null
  onClose: () => void
}

function MwBlock({
  heading,
  stats,
}: {
  heading: string
  stats: ReturnType<typeof dnaMwStats>
}) {
  return (
    <div className="tools-mw-block">
      <div className="tools-mw-heading">{heading}</div>
      <div className="tools-mw-line">
        <span className="tools-mw-key">MW</span>
        <span className="tools-mw-eq">=</span>
        <span>
          {formatMwDa(stats.mwDa)} Da
        </span>
      </div>
      <div className="tools-mw-line">
        <span className="tools-mw-key">1 pmol</span>
        <span className="tools-mw-eq">=</span>
        <span>{formatUgPerPmol(stats.ugPerPmol)} µg</span>
      </div>
      <div className="tools-mw-line">
        <span className="tools-mw-key">1 µg</span>
        <span className="tools-mw-eq">=</span>
        <span>{formatPmolPerUg(stats.pmolPerUg)} pmol</span>
      </div>
    </div>
  )
}

export function DnaMolecularWeightDialog({
  name,
  sequence,
  topology,
  selection,
  onClose,
}: DnaMolecularWeightDialogProps) {
  const length = sequence.length
  const topologyLabel = topology === 'circular' ? 'Circular' : 'Linear'
  const wholeMw = dsDnaMolecularWeightDa(sequence, topology)
  const wholeStats = dnaMwStats(wholeMw, length)

  const selectionStats = useMemo(() => {
    if (!selection) return null
    if (selection.kind === 'range') {
      const frag = extractRange(sequence, selection.start, selection.end)
      const mw = dsDnaMolecularWeightDa(frag, 'linear')
      return dnaMwStats(mw, frag.length)
    }
    const mw = stickyDsDnaMolecularWeightDa(sequence, selection.forward, selection.reverse)
    return dnaMwStats(mw, selection.lengthBp)
  }, [selection, sequence])

  return (
    <div className="translation-dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="translation-dialog tools-mw-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="DNA molecular weight"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <MwBlock
          heading={`${name} (${topologyLabel} / ${length.toLocaleString()} bp):`}
          stats={wholeStats}
        />
        {selection && selectionStats && (
          <MwBlock heading={`Selected: ${selection.label}`} stats={selectionStats} />
        )}
        <hr />
        <div className="tools-mw-constants">
          <div>1 A260 unit double-stranded DNA = 50 µg/ml</div>
          <div>1 A260 unit single-stranded DNA = 33 µg/ml</div>
          <div>1 A260 unit single-stranded RNA = 40 µg/ml</div>
        </div>
        <div className="translation-actions tools-dialog-actions">
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

export function LetterCodesDialog({ onClose }: { onClose: () => void }) {
  const [dnaOpen, setDnaOpen] = useState(true)
  const [proteinOpen, setProteinOpen] = useState(true)

  return (
    <div className="translation-dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="translation-dialog tools-letter-codes-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Letter codes"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="tools-letter-section-toggle"
          onClick={() => setDnaOpen((open) => !open)}
        >
          <span aria-hidden>{dnaOpen ? '▾' : '▸'}</span> DNA Letter Codes
        </button>
        {dnaOpen && (
          <div className="tools-letter-grid tools-letter-grid-two-col">
            {dnaLetterCodes.map((entry) => (
              <div key={entry.code}>
                <strong>{entry.code}</strong> = {entry.meaning}
              </div>
            ))}
          </div>
        )}
        <button
          type="button"
          className="tools-letter-section-toggle"
          onClick={() => setProteinOpen((open) => !open)}
        >
          <span aria-hidden>{proteinOpen ? '▾' : '▸'}</span> Protein Letter Codes
        </button>
        {proteinOpen && (
          <div className="tools-letter-grid tools-letter-grid-two-col">
            {proteinLetterCodes.map((entry) => (
              <div key={entry.code}>
                <strong>{entry.code}</strong> = {entry.meaning}
              </div>
            ))}
          </div>
        )}
        <div className="translation-actions tools-dialog-actions">
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

export type GeneticCodeAaFormat = 'both' | 'three' | 'one'
export type GeneticCodeSeqType = 'DNA' | 'RNA'

type GeneticCodeTablesDialogProps = {
  onClose: () => void
}

function formatCodonDisplay(codon: string, seqType: GeneticCodeSeqType): string {
  return seqType === 'RNA' ? codon.replaceAll('T', 'U') : codon
}

function formatAaMapping(aa: string, format: GeneticCodeAaFormat): ReactNode {
  if (aa === '*') {
    return <span className="tools-genetic-stop" aria-label="Stop">*</span>
  }
  if (format === 'one') return aa
  if (format === 'three') return formatAminoAcidCode(aa, 'three-letter')
  return (
    <>
      {formatAminoAcidCode(aa, 'three-letter')} ({aa})
    </>
  )
}

export function GeneticCodeTablesDialog({ onClose }: GeneticCodeTablesDialogProps) {
  const [geneticCode, setGeneticCode] = useState('Standard')
  const [seqType, setSeqType] = useState<GeneticCodeSeqType>('DNA')
  const [aaFormat, setAaFormat] = useState<GeneticCodeAaFormat>('both')
  const [organism, setOrganism] = useState<CodonUsageOrganism>('mammals')
  const [hoveredAa, setHoveredAa] = useState<string | null>(null)

  const codonMap = useMemo(() => codonMapForGeneticCode(geneticCode), [geneticCode])

  return (
    <div className="translation-dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="translation-dialog tools-genetic-code-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Genetic code tables"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <label className="tools-genetic-toolbar">
          <span>Genetic Code:</span>
          <select value={geneticCode} onChange={(event) => setGeneticCode(event.target.value)}>
            {GENETIC_CODE_NAMES.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>

        <div className="tools-genetic-table-wrap">
          <table className="tools-genetic-table">
            <thead>
              <tr>
                <th rowSpan={2} className="tools-genetic-corner">
                  First
                  <br />
                  Position
                </th>
                <th colSpan={4}>Second Position</th>
                <th rowSpan={2} className="tools-genetic-third-head">
                  Third
                  <br />
                  Position
                </th>
              </tr>
              <tr>
                {CODON_BASES.map((base) => (
                  <th key={base}>{formatCodonDisplay(base, seqType)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CODON_BASES.map((first) =>
                CODON_BASES.map((third, thirdIndex) => (
                  <tr key={`${first}-${third}`}>
                    {thirdIndex === 0 && (
                      <th rowSpan={4} className="tools-genetic-first">
                        {formatCodonDisplay(first, seqType)}
                      </th>
                    )}
                    {CODON_BASES.map((second) => {
                      const codon = `${first}${second}${third}`
                      const aa = codonMap[codon] ?? 'X'
                      const freq = codonFrequencyForOrganism(codon, organism)
                      const highlighted = hoveredAa !== null && hoveredAa === aa
                      return (
                        <td
                          key={second}
                          className={highlighted ? 'is-aa-highlight' : undefined}
                          onMouseEnter={() => setHoveredAa(aa)}
                          onMouseLeave={() => setHoveredAa(null)}
                        >
                          <div className="tools-genetic-codon-line">
                            <span className="tools-genetic-codon">{formatCodonDisplay(codon, seqType)}</span>
                            <span className="tools-genetic-arrow">→</span>
                            {formatAaMapping(aa, aaFormat)}
                            {freq !== null && (
                              <span className="tools-genetic-freq" title={`${organism} codon usage`}>
                                {freq}%
                              </span>
                            )}
                          </div>
                        </td>
                      )
                    })}
                    <th className="tools-genetic-third">{formatCodonDisplay(third, seqType)}</th>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>

        <div className="tools-genetic-footer">
          <label className="tools-genetic-toolbar">
            <span>Format:</span>
            <select
              value={seqType}
              onChange={(event) => setSeqType(event.target.value as GeneticCodeSeqType)}
            >
              <option value="DNA">DNA</option>
              <option value="RNA">RNA</option>
            </select>
            <select
              value={aaFormat}
              onChange={(event) => setAaFormat(event.target.value as GeneticCodeAaFormat)}
            >
              <option value="both">GCA → Ala (A)</option>
              <option value="three">GCA → Ala</option>
              <option value="one">GCA → A</option>
            </select>
          </label>
          <label className="tools-genetic-toolbar">
            <span>Frequency:</span>
            <select
              value={organism}
              onChange={(event) => setOrganism(event.target.value as CodonUsageOrganism)}
            >
              {codonUsageOrganismOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

type DoubleDigestDialogProps = {
  onClose: () => void
}

const doubleDigestEnzymeNames = listCatalogEnzymeNames()

function defaultDoubleDigestEnzyme(preferred: string, fallbackIndex: number) {
  return doubleDigestEnzymeNames.includes(preferred)
    ? preferred
    : (doubleDigestEnzymeNames[fallbackIndex] ?? doubleDigestEnzymeNames[0] ?? '')
}

export function DoubleDigestDialog({ onClose }: DoubleDigestDialogProps) {
  const [firstName, setFirstName] = useState(() => defaultDoubleDigestEnzyme('BamHI', 0))
  const [secondName, setSecondName] = useState(() => defaultDoubleDigestEnzyme('EcoRI', 1))
  const firstEnzyme = getEnzymeByName(firstName)
  const secondEnzyme = getEnzymeByName(secondName)
  const firstManufacturers = firstEnzyme ? manufacturersForEnzyme(firstEnzyme) : []
  const secondManufacturers = secondEnzyme ? manufacturersForEnzyme(secondEnzyme) : []
  const [firstManufacturer, setFirstManufacturer] = useState<EnzymeManufacturerId>(
    () => firstEnzyme?.manufacturers[0]?.id ?? 'neb',
  )
  const [secondManufacturer, setSecondManufacturer] = useState<EnzymeManufacturerId>(
    () => secondEnzyme?.manufacturers[0]?.id ?? 'neb',
  )

  const firstProfile = firstManufacturers.find((profile) => profile.id === firstManufacturer) ?? null
  const secondProfile = secondManufacturers.find((profile) => profile.id === secondManufacturer) ?? null
  const recommendation = useMemo(
    () => {
      const selectedFirst = getEnzymeByName(firstName)
      const selectedSecond = getEnzymeByName(secondName)
      return selectedFirst && selectedSecond
        ? recommendDoubleDigest(
            { enzyme: selectedFirst, manufacturerId: firstManufacturer },
            { enzyme: selectedSecond, manufacturerId: secondManufacturer },
          )
        : null
    },
    [firstName, firstManufacturer, secondName, secondManufacturer],
  )

  const chooseEnzyme = (slot: 'first' | 'second', name: string) => {
    const enzyme = getEnzymeByName(name)
    const manufacturer = enzyme?.manufacturers[0]?.id ?? 'neb'
    if (slot === 'first') {
      setFirstName(name)
      setFirstManufacturer(manufacturer)
    } else {
      setSecondName(name)
      setSecondManufacturer(manufacturer)
    }
  }

  const renderSelector = (
    label: string,
    slot: 'first' | 'second',
    name: string,
    manufacturer: EnzymeManufacturerId,
    profiles: ReturnType<typeof manufacturersForEnzyme>,
  ) => (
    <fieldset className="tools-double-digest-selector">
      <legend>{label}</legend>
      <label>
        <span>Restriction enzyme</span>
        <select
          value={name}
          autoFocus={slot === 'first'}
          onChange={(event) => chooseEnzyme(slot, event.target.value)}
        >
          {doubleDigestEnzymeNames.map((enzymeName) => (
            <option key={enzymeName} value={enzymeName}>{enzymeName}</option>
          ))}
        </select>
      </label>
      <label>
        <span>Manufacturer</span>
        <select
          value={manufacturer}
          onChange={(event) => {
            const id = event.target.value as EnzymeManufacturerId
            if (slot === 'first') setFirstManufacturer(id)
            else setSecondManufacturer(id)
          }}
        >
          {profiles.map((profile) => (
            <option key={profile.id} value={profile.id}>{profile.name}</option>
          ))}
        </select>
      </label>
    </fieldset>
  )

  return (
    <div className="translation-dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="translation-dialog tools-double-digest-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tools-double-digest-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id="tools-double-digest-title">Double digest</h2>
        <p className="tools-double-digest-intro">
          Choose the exact enzyme products you will use. A common buffer is recommended only when both
          activities are strictly greater than 70%.
        </p>

        <div className="tools-double-digest-selectors">
          {renderSelector('Enzyme 1', 'first', firstName, firstManufacturer, firstManufacturers)}
          {renderSelector('Enzyme 2', 'second', secondName, secondManufacturer, secondManufacturers)}
        </div>

        {recommendation && (
          <section
            className={`tools-double-digest-result is-${recommendation.kind}`}
            aria-live="polite"
          >
            <h3>{recommendation.kind === 'simultaneous' ? 'Recommended common buffer' : 'Sequential digestion recommended'}</h3>
            {recommendation.best ? (
              <>
                <div className="tools-double-digest-buffer">{recommendation.best.bufferLabel}</div>
                <div className="tools-double-digest-evidence">
                  <span>{firstName}: <strong>{recommendation.best.first.activity}</strong></span>
                  <span>{secondName}: <strong>{recommendation.best.second.activity}</strong></span>
                </div>
                <p>{recommendation.reason}</p>
              </>
            ) : (
              <p>{recommendation.reason}</p>
            )}
            {recommendation.warnings.length > 0 && (
              <ul className="tools-double-digest-warnings">
                {recommendation.warnings.map((warning) => <li key={warning}>{warning}</li>)}
              </ul>
            )}
          </section>
        )}

        <div className="tools-double-digest-sources">
          <strong>Manufacturer sources</strong>
          {[firstProfile, secondProfile].map((profile, index) => profile && (
            <div key={`${profile.id}-${index}`}>
              <a href={profile.websiteUrl} target="_blank" rel="noreferrer">
                {index === 0 ? firstName : secondName} — {profile.name} product page
              </a>
              {profile.doubleDigest && <span> · {profile.doubleDigest}</span>}
            </div>
          ))}
        </div>
        <p className="tools-double-digest-disclaimer">
          Inferred activities are estimates. Verify the current manufacturer protocol, temperature,
          additives, and star-activity guidance before use.
        </p>
        <div className="translation-actions tools-dialog-actions">
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
