import { createRoot } from 'react-dom/client'
import { useState } from 'react'
import '../../src/index.css'
import { AmbiguityDetails, SangerAllelesDialog } from '../../src/SangerAllelesDialog'
import { IndependentReadResults } from '../../src/IndependentReadResults'
import { CrisprWorkflowHelpDialog } from '../../src/CrisprWorkflowHelpDialog'
import '../../src/App.css'
import '../../src/styles/theme-primitives.css'
import { cloneFixture } from '../../src/domain/fixtures'
import type { TraceFileRecord } from '../../src/domain/traceTypes'

const traces = ['34_gp2_F10.ab1', '9_gp1_G07.ab1', 'a-long-trace-name-with-sample-details-and-orientation.ab1'].map((fileName, index) => ({
  id: `trace-${index}`, fileName, sequence: 'ACGT', enabled: true, expanded: false, showAnnotations: false,
  alignment: { orientation: index === 0 ? 'reverse' : 'forward' },
} as TraceFileRecord))

export function AmbiguityFixture() {
  const [selected, setSelected] = useState([0, 1])
  return <div className="translation-dialog-backdrop"><section className="translation-dialog sanger-alleles-dialog" role="dialog">
    <h3>Alleles from Sanger data</h3><div className="sanger-alleles-results"><section>
      <strong>clone 9: read1.ab1 + read2.ab1</strong>
      <ul><li>Segment deletion: −199 bp at 26399 · 51.5% · competing alternatives
        <AmbiguityDetails reference={'ACGT'.repeat(100)} allele={{ edit: { start: 100, end: 200, inserted: '', label: 'Reported' }, fraction: 0.515, ambiguous: true, alternatives: [{ edit: { start: 101, end: 201, inserted: '', label: 'Segment deletion: −100 bp at 102' }, reason: 'similar-fit' }], alternativesTruncated: false }} selected={selected} disabled={false} onToggle={(index, checked) => setSelected((previous) => checked ? [...previous, index] : previous.filter((value) => value !== index))} />
      </li></ul>
      <button type="button" disabled={!selected.length}>Open allele library</button>
    </section></div>
  </section></div>
}

const independentFit = (start: number) => ({ fit: 0.96, positions: 100, perRead: [], warnings: [], alleles: [{ edit: { start, end: start + 2, inserted: '', label: `Deletion at ${start + 1}` }, fraction: 1, ambiguous: false, alternatives: [], alternativesTruncated: false }] })
export function IndependentFixture() {
  return <div className="translation-dialog-backdrop"><section className="translation-dialog sanger-alleles-dialog" role="dialog">
    <h3>Alleles from Sanger data</h3><div className="sanger-alleles-results"><section>
      <IndependentReadResults reference="ACGTACGTACGT" group={{ label: 'clone', traceNames: ['forward', 'reverse'], independentReads: [{ name: 'long-forward-chromatogram-name.ab1', orientation: 'forward', result: independentFit(0) }, { name: 'long-reverse-chromatogram-name.ab1', orientation: 'reverse', result: independentFit(1) }] }} />
    </section></div>
  </section></div>
}

createRoot(document.getElementById('root')!).render(location.search.includes('help') ? <CrisprWorkflowHelpDialog onDismiss={() => {}} /> : location.search.includes('comparison') ? <IndependentFixture /> : location.search.includes('ambiguity') ? <AmbiguityFixture /> : <SangerAllelesDialog
  record={{ ...cloneFixture(), topology: 'linear' }} traces={traces}
  onCancel={() => {}} onOpenLibrary={async () => {}}
/>)
