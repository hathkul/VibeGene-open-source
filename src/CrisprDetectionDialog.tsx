import { useId, useState } from 'react'
import type { CrisprDetectionResult } from './domain/crisprDetection'
import type { Strand } from './domain/types'
import { modificationLabel, type DnaTerminalEndDetail } from './domain/dnaEnds'
import { designPreLinearizedOligos, type CrisprOligoRecipeId } from './domain/crisprOligoDesign'

function confidenceLabel(confidence: string) {
  return `${confidence} confidence`
}

function formatRange(start: number, end: number) {
  return `${start + 1}–${end}`
}

function scaffoldDistanceLabel(distance: number) {
  if (distance < 0) return `${Math.abs(distance)} nt inside scaffold`
  if (distance === 0) return 'at scaffold junction'
  return `${distance} nt upstream of scaffold`
}

function architectureLabel(architecture: CrisprDetectionResult['cassetteFindings'][number]['architecture']) {
  switch (architecture) {
    case 'direct-spacer': return 'Direct spacer insertion'
    case 'removable-stuffer': return 'Removable stuffer cassette'
    case 'single-junction': return 'Single insertion junction'
    case 'pre-linearized': return 'Pre-linearized sgRNA cloning backbone'
  }
}

function Evidence({ items }: { items: string[] }) {
  if (items.length === 0) return null
  return <ul>{items.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul>
}

function terminalEndLabel(role: string, end: DnaTerminalEndDetail) {
  const physicalSide = end.side === 'upstream' ? 'left, nt 1' : 'right, final nt'
  if (end.provenance === 'not-recorded') {
    return `${role} (${physicalSide}): end chemistry and overhang not recorded`
  }
  const chemistry = end.polarity === 'blunt'
    ? 'blunt end'
    : `${end.length} nt ${end.polarity === "5'" ? '5′' : '3′'} overhang on ${end.protrudingStrand} strand; ${end.bases5to3 ?? 'bases unresolved'} (5′→3′)`
  const enzyme = end.enzymeName ? `; enzyme ${end.enzymeName}` : '; enzyme not recorded'
  const source = end.provenance === 'snapgene-block8' ? 'SnapGene end properties'
    : end.provenance === 'snapgene-history' ? 'SnapGene history'
      : end.provenance === 'legacy-defined' ? 'legacy saved end properties'
        : 'edited end properties'
  return `${role} (${physicalSide}): ${chemistry}; ${end.modification ? modificationLabel(end.modification) : 'modification unknown'}${enzyme}; source ${source}`
}

function PreLinearizedOligoInput({ recipeId, strand }: { recipeId: CrisprOligoRecipeId; strand: Strand }) {
  const inputId = useId()
  const [target, setTarget] = useState('')
  const [copyStatus, setCopyStatus] = useState('')
  const design = target ? designPreLinearizedOligos(recipeId, target) : null
  const sensePhysicalStrand = strand === 'forward' ? 'top' : 'bottom'
  const antisensePhysicalStrand = strand === 'forward' ? 'bottom' : 'top'
  const copy = (sequence: string, label: string) => {
    if (!navigator.clipboard?.writeText) {
      setCopyStatus('Clipboard unavailable; select the sequence to copy it.')
      return
    }
    void navigator.clipboard.writeText(sequence).then(
      () => setCopyStatus(`${label} copied`),
      () => setCopyStatus('Copy failed; select the sequence to copy it.'),
    )
  }
  return (
    <div className="crispr-oligo-design">
      <label htmlFor={inputId}>Target protospacer (5′→3′, without PAM)</label>
      <input
        id={inputId}
        type="text"
        value={target}
        onChange={(event) => {
          setTarget(event.target.value.toUpperCase().replace(/\s+/g, ''))
          setCopyStatus('')
        }}
        placeholder={recipeId === 'geneart' ? '19–20 nt' : recipeId === 'aavpro-sacas9' ? '20–22 nt' : '20 nt'}
        spellCheck={false}
        autoComplete="off"
      />
      {design && !design.ok && <p role="alert">{design.error}</p>}
      {design?.ok && (
        <div className="crispr-oligo-design-result">
          <p>Expressed guide: <code>{design.expressedGuide}</code>. {design.note}</p>
          <div><span>Sense / {sensePhysicalStrand} strand in this file, 5′→3′</span><code>{design.sense}</code><button type="button" onClick={() => copy(design.sense, 'Sense oligo')}>Copy</button></div>
          <div><span>Antisense / {antisensePhysicalStrand} strand in this file, 5′→3′</span><code>{design.antisense}</code><button type="button" onClick={() => copy(design.antisense, 'Antisense oligo')}>Copy</button></div>
          {copyStatus && <p role="status">{copyStatus}</p>}
        </div>
      )}
    </div>
  )
}

export function CrisprDetectionDialog({
  recordId,
  recordName,
  result,
  onClose,
}: {
  recordId?: string
  recordName: string
  result: CrisprDetectionResult
  onClose: () => void
}) {
  const hasFindings = result.nucleaseFindings.length > 0
    || result.guideScaffoldFindings.length > 0
    || result.cassetteFindings.length > 0

  return (
    <div className="translation-dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="translation-dialog crispr-detection-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="crispr-detection-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h3 id="crispr-detection-title">CRISPR Detection: {recordName}</h3>
        <p className="crispr-detection-summary">{result.summary}</p>
        <div className="crispr-detection-sections">
          {!hasFindings && (
            <div className="crispr-detection-empty">
              No supported Cas proteins, guide scaffolds, or likely guide insertion cassettes were detected.
              Detection uses sequence evidence and may miss heavily modified or partial constructs. This is not a
              negative biological result: do not conclude that the plasmid lacks CRISPR activity or use it as a
              negative control from this result alone. Confirm the vector identity and complete sequence against its
              source documentation, then inspect its annotations and restriction map to locate an insertion site.
            </div>
          )}

          {result.nucleaseFindings.length > 0 && (
            <section className="crispr-detection-section" aria-labelledby="crispr-nucleases-heading">
              <h4 id="crispr-nucleases-heading">Cas / nuclease proteins</h4>
              {result.nucleaseFindings.map((finding, index) => (
                <article className="crispr-detection-card" key={`nuclease-${finding.name}-${finding.start}-${index}`}>
                  <div className="crispr-detection-card-title">
                    <span>{finding.name}</span>
                    <span>{confidenceLabel(finding.confidence)}</span>
                  </div>
                  <p>{finding.family} · nt {formatRange(finding.start, finding.end)} · {finding.strand} strand</p>
                  <Evidence items={finding.evidence} />
                </article>
              ))}
            </section>
          )}

          {result.guideScaffoldFindings.length > 0 && (
            <section className="crispr-detection-section" aria-labelledby="crispr-scaffolds-heading">
              <h4 id="crispr-scaffolds-heading">Guide RNA scaffolds</h4>
              {result.guideScaffoldFindings.map((finding, index) => (
                <article className="crispr-detection-card" key={`scaffold-${finding.name}-${finding.start}-${index}`}>
                  <div className="crispr-detection-card-title">
                    <span>{finding.name}</span>
                    <span>{confidenceLabel(finding.confidence)}</span>
                  </div>
                  <p>nt {formatRange(finding.start, finding.end)} · {finding.strand} strand</p>
                  <Evidence items={finding.evidence} />
                </article>
              ))}
            </section>
          )}

          {result.cassetteFindings.length > 0 && (
            <section className="crispr-detection-section" aria-labelledby="crispr-cassettes-heading">
              <h4 id="crispr-cassettes-heading">Candidate sgRNA cloning sites</h4>
              {result.cassetteFindings.map((cassette, index) => (
                <article className="crispr-detection-card" key={`cassette-${cassette.start}-${index}`}>
                  <div className="crispr-detection-card-title">
                    <span>{cassette.promoterName ? `${cassette.promoterName} → ` : ''}${cassette.scaffoldName}</span>
                    <span>{confidenceLabel(cassette.confidence)}</span>
                  </div>
                  <p>
                    {cassette.architecture === 'pre-linearized'
                      ? `Open DNA ends at nt 1 and nt ${cassette.end}`
                      : `nt ${formatRange(cassette.start, cassette.end)}`}
                    {' · '}likely spacer length {cassette.likelyGuideLengthRange
                      ? `${cassette.likelyGuideLengthRange.min}–${cassette.likelyGuideLengthRange.max}`
                      : cassette.likelyGuideLength} nt
                    {' · '}{cassette.strand} strand
                  </p>
                  <p>
                    Predicted cloning layout: {architectureLabel(cassette.architecture)}
                    {cassette.cloningPair ? ` · ${cassette.cloningPair}` : ''}
                  </p>
                  {cassette.nearbyTypeIisSites.length > 0 ? (
                    <ul>
                      {cassette.nearbyTypeIisSites.map((site, siteIndex) => (
                        <li key={`${site.enzymeName}-${site.start}-${siteIndex}`}>
                          {site.enzymeName} at nt {formatRange(site.start, site.end)}; cut {site.cutTop + 1}/{site.cutBottom + 1};
                          {' '}{site.overhangType} {site.overhangLength} nt overhang{site.overhangSequence ? ` (${site.overhangSequence})` : ''}
                          , {scaffoldDistanceLabel(site.distanceToScaffold)}
                        </li>
                      ))}
                    </ul>
                  ) : cassette.architecture === 'pre-linearized'
                    ? <p>Guide insertion is at the two physical DNA ends; there is no internal site to cut in this molecule.</p>
                    : <p>No nearby supported cloning sites were found.</p>}
                  {cassette.terminalEnds && (
                    <ul>
                      <li>{terminalEndLabel('Promoter side', cassette.terminalEnds.promoterSide)}</li>
                      <li>{terminalEndLabel('Scaffold side', cassette.terminalEnds.scaffoldSide)}</li>
                    </ul>
                  )}
                  {cassette.oligoTemplate && (
                    <>
                      <p>
                        {cassette.oligoTemplate.matchBasis === 'geometry-matched' ? 'Geometry-matched' : 'Recorded-end'} {cassette.oligoTemplate.recipe} compatible oligo templates: sense {cassette.oligoTemplate.sense};
                        {' '}antisense {cassette.oligoTemplate.antisense}. {cassette.oligoTemplate.note}
                      </p>
                      <PreLinearizedOligoInput
                        key={`${recordId ?? recordName}:${cassette.start}:${cassette.end}:${cassette.strand}:${cassette.promoterName}:${cassette.scaffoldName}:${cassette.terminalEnds?.promoterSide.bases5to3}:${cassette.terminalEnds?.scaffoldSide.bases5to3}:${cassette.oligoTemplate.recipeId}`}
                        recipeId={cassette.oligoTemplate.recipeId}
                        strand={cassette.strand}
                      />
                    </>
                  )}
                  <Evidence items={cassette.evidence} />
                </article>
              ))}
            </section>
          )}

          {result.recommendations.length > 0 && (
            <section className="crispr-detection-section" aria-labelledby="crispr-recommendations-heading">
              <h4 id="crispr-recommendations-heading">sgRNA design recommendations</h4>
              {result.recommendations.map((recommendation, index) => (
                <article className="crispr-detection-card" key={`recommendation-${index}-${recommendation.title}`}>
                  <div className="crispr-detection-card-title">
                    <span>{recommendation.title}</span>
                    <span>{confidenceLabel(recommendation.confidence)}</span>
                  </div>
                  <p>{recommendation.detail}</p>
                </article>
              ))}
            </section>
          )}
        </div>
        <div className="translation-dialog-footer">
          <div className="translation-actions">
            <button type="button" className="primary" onClick={onClose}>Done</button>
          </div>
        </div>
      </section>
    </div>
  )
}
