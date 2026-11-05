import { compareIndependentReads, readComparisonMessage } from './domain/sangerAlleles/readComparison'
import type { AlleleGroupResult } from './domain/sangerAlleles/savedAnalysis'

export function IndependentReadResults({ group, reference }: { group: AlleleGroupResult; reference: string }) {
  if (group.traceNames.length !== 2) return null
  const comparison = compareIndependentReads(reference, group.independentReads)
  return <div className="sanger-independent-results">
    <h4>Independent read fits</h4>
    <p className={comparison === 'different' ? 'sanger-alleles-below-threshold' : 'sanger-alleles-caution'}>{readComparisonMessage(comparison)}</p>
    <p className="sanger-alleles-caution">Candidates and approximate fractions are fitted separately for each read. Different edits can produce the same sequence; competing alternatives and incomplete coverage can also affect the comparison.</p>
    {group.independentReads?.map((read, index) => <div className="sanger-independent-read" key={`${read.name}-${index}`}>
      <strong>{read.name} ({read.orientation})</strong>
      {read.error ? <p role="alert">Could not fit this read: {read.error}</p> : read.result && <>
        <p>Independent peak-fit similarity: {(read.result.fit * 100).toFixed(1)}%{read.result.fit < 0.8 ? ' · below the 80% heuristic threshold' : ''}.</p>
        <ul>{read.result.alleles.map((allele, alleleIndex) => <li key={alleleIndex}>
          {allele.edit.label} · {(allele.fraction * 100).toFixed(1)}%{allele.ambiguous ? ' · competing alternatives' : ''}
          {allele.alternatives.length > 0 && <details><summary>Show competing edits{allele.alternativesTruncated ? ' (list incomplete)' : ''}</summary><ul>{allele.alternatives.map((alternative, alternativeIndex) => <li key={alternativeIndex}>{alternative.edit.label} · {alternative.reason === 'same-profile' ? 'same predicted bases' : 'similar fit'}</li>)}</ul></details>}
        </li>)}</ul>
      </>}
    </div>)}
  </div>
}
