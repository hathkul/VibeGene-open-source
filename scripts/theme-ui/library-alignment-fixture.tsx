import { useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import '../../src/index.css'
import { SequenceAlignmentPane } from '../../src/components/SequenceAlignmentPane'
import { SequenceRows } from '../../src/presentation/sequence/SequenceRows'
import { defaultDisplaySettings } from '../../src/presentation/sequence/sequenceShared'
import { defaultEnzymePreferences } from '../../src/domain/enzymePreferences'
import { cloneFixture } from '../../src/domain/fixtures'
import { defaultFeatureTranslationOptions } from '../../src/domain/geneticCode'
import { createSgRNAFeatures, findSgRNATargets, SGRNA_PRESETS } from '../../src/domain/sgrna'
import { alignTraceToTemplate } from '../../src/domain/traceAlignment'
import { traceRecordFromSequence } from '../../src/domain/sequenceTraceFactory'
import '../../src/App.css'
import '../../src/styles/theme-primitives.css'

const spacer = 'ACGTACGTACGTACGTACGA'
const insertGuide = (sequence: string, position: number) => sequence.slice(0, position) + spacer + 'AGG' + sequence.slice(position + 23)
const sequence = insertGuide(insertGuide('ACGT'.repeat(300), 40), 660)
const targets = findSgRNATargets(sequence, spacer, 'linear', SGRNA_PRESETS[0]!)
const guideAt = (position: number, name: string) => createSgRNAFeatures(targets.find((target) => target.guideStart === position && target.strand === 'forward')!, { name, nuclease: 'SpCas9', pamMotif: 'NGG', pamSide: '3prime', spacer })
const features = [
  { id: 'near', name: 'Near feature', type: 'gene', color: '#22a655', locations: [{ start: 15, end: 65, strand: 'forward' as const }] },
  { id: 'cds', name: 'Translated feature', type: 'CDS', color: '#eeaa33', locations: [{ start: 0, end: 150, strand: 'forward' as const }], translateInSequenceView: true, translation: defaultFeatureTranslationOptions(1) },
  ...Array.from({ length: 7 }, (_, index) => ({ id: `far-${index}`, name: `Far feature ${index + 1}`, type: 'misc_feature', color: '#5577aa', locations: [{ start: 650, end: 710, strand: 'forward' as const }] })),
  ...guideAt(40, 'Near guide'),
  ...guideAt(660, 'Far guide 1'), ...guideAt(660, 'Far guide 2'), ...guideAt(660, 'Far guide 3'),
]
const record = { ...cloneFixture(), sequence, features, primers: [], topology: 'linear' as const }
const alignment = alignTraceToTemplate(sequence, sequence)!
const initial = Array.from({ length: location.search.includes('many') ? 12 : 2 }, (_, index) => ({ ...traceRecordFromSequence(sequence, `Member ${index + 1}`), alignment, showAnnotations: true }))
const noop = () => {}
const settings = { ...defaultDisplaySettings, enzymes: { ...defaultDisplaySettings.enzymes, visible: false }, primers: { ...defaultDisplaySettings.primers, visible: false } }

export function Fixture() {
  const [traces, setTraces] = useState(initial)
  const navigator = useRef<{ scrollToViewportStart: (index: number, atEnd: boolean) => void } | null>(null)
  return <div style={{ height: '95vh', display: 'flex', flexDirection: 'column' }}>
    <div><button onClick={() => navigator.current?.scrollToViewportStart(0, false)}>Near region</button><button onClick={() => navigator.current?.scrollToViewportStart(650, false)}>Dense region</button></div>
    <SequenceAlignmentPane templateSequence={sequence} layoutActive traceFiles={traces} onTraceFilesChange={setTraces} selectedTraceId={null} onSelectTrace={noop} isLibrary
      onRegisterTemplateNavigator={(value) => { navigator.current = value }} selectedRange={null} onRangeSelect={noop} onApplyReferenceReplacement={noop}
      renderReferenceRow={() => <div>Consensus</div>}
      renderTraceAnnotationRow={(trace, { horizontalViewport, mergedLayout, onRowHeight }) => <SequenceRows
        record={record} motifHits={[]} restrictionSites={[]} primerFrameDisplays={[]} annotationFeatures={features} displaySettings={settings} enzymePreferences={defaultEnzymePreferences}
        hoveredRestrictionSiteKey={null} cutStrandSelection={null} selectedRange={null} selectedFeatureId={null} selectedPrimerId={null} layoutActive horizontalMode compactAlignmentAnnotations horizontalViewport={horizontalViewport} alignmentMergedLayout={mergedLayout}
        alignmentTraceDisplay={{ alignment: trace.alignment!, baseCalls: trace.chromatogram.baseCalls }} onHorizontalRowHeight={onRowHeight}
        onFeatureSelect={noop} onFeatureEdit={noop} onPrimerSelect={noop} onRestrictionSelect={noop} onRestrictionHover={noop} onRangeSelect={noop} onPrimerEdit={noop} onEnzymeInfo={noop}
      />}
    />
  </div>
}

createRoot(document.getElementById('root')!).render(<Fixture />)
