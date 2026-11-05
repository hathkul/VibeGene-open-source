import { describe, expect, it } from 'vitest'
import {
  addThreePrimeBase,
  adjustDnaEndsForSequenceReplacement,
  deleteAtSelection,
  deleteSingleStrand,
  dnaStrandVisibleRanges,
  dnaTerminalEndDetail,
  dnaEndsProvenanceAfterSequenceReplacement,
  exportSnapGeneBlock8Xml,
  insertBasesAtSelection,
  isDnaEndBaseVisible,
  makeDoubleStranded,
  parseSnapGeneBlock8DnaEnds,
  resolveDnaEnds,
  snapGeneBlock8HasExplicitDnaEnds,
  type DnaEndsEditorDraft,
} from '../src/domain/dnaEnds'

function draft(sequence: string, stickiness = { upstream: 0, downstream: 0 }): DnaEndsEditorDraft {
  return {
    sequence,
    features: [],
    dnaEnds: {
      upstream: { modification: 'fivePrimePhosphorylated', stickiness: stickiness.upstream },
      downstream: { modification: 'fivePrimePhosphorylated', stickiness: stickiness.downstream },
    },
    selection: null,
  }
}

describe('dnaEnds', () => {
  it.each([
    { side: 'upstream' as const, stickiness: 4, strand: 'top', polarity: "5'", bases: 'ACGT' },
    { side: 'upstream' as const, stickiness: -4, strand: 'bottom', polarity: "3'", bases: 'ACGT' },
    { side: 'downstream' as const, stickiness: 4, strand: 'bottom', polarity: "5'", bases: 'AACC' },
    { side: 'downstream' as const, stickiness: -4, strand: 'top', polarity: "3'", bases: 'GGTT' },
  ])('resolves $side $polarity overhang from the physical $strand strand in 5′→3′ order', ({ side, stickiness, strand, polarity, bases }) => {
    const ends = {
      upstream: { modification: 'unmodified' as const, stickiness: side === 'upstream' ? stickiness : 0 },
      downstream: { modification: 'fivePrimePhosphorylated' as const, stickiness: side === 'downstream' ? stickiness : 0 },
    }
    const detail = dnaTerminalEndDetail({ sequence: 'ACGTAAAAGGTT', dnaEnds: ends, dnaEndsProvenance: 'snapgene-block8' }, side)
    expect(detail).toMatchObject({ side, polarity, protrudingStrand: strand, bases5to3: bases, length: 4 })
  })

  it('distinguishes explicit blunt chemistry from absent end metadata', () => {
    const ends = {
      upstream: { modification: 'unmodified' as const, stickiness: 0, enzymeName: 'BamHI' },
      downstream: { modification: 'fivePrimePhosphorylated' as const, stickiness: 0 },
    }
    expect(dnaTerminalEndDetail({ sequence: 'ACGT', dnaEnds: ends, dnaEndsProvenance: 'snapgene-block8' }, 'upstream'))
      .toMatchObject({ polarity: 'blunt', length: 0, bases5to3: null, modification: 'unmodified', enzymeName: 'BamHI' })
    expect(dnaTerminalEndDetail({ sequence: 'ACGT', dnaEnds: ends }, 'upstream'))
      .toMatchObject({ provenance: 'not-recorded', polarity: 'unknown', length: null, modification: null, enzymeName: null })
  })

  it('downgrades recorded end provenance when sequence edits touch an overhang', () => {
    const record = {
      sequence: 'ACGTAAAAGGTT',
      dnaEnds: {
        upstream: { modification: 'fivePrimePhosphorylated' as const, stickiness: 4 },
        downstream: { modification: 'unmodified' as const, stickiness: -4 },
      },
      dnaEndsProvenance: 'snapgene-block8' as const,
    }
    expect(dnaEndsProvenanceAfterSequenceReplacement(record, 5, 6, 1, record.dnaEnds)).toBe('snapgene-block8')
    expect(dnaEndsProvenanceAfterSequenceReplacement(record, 2, 3, 1, record.dnaEnds)).toBe('user-defined')
    expect(dnaEndsProvenanceAfterSequenceReplacement(record, 9, 10, 1, record.dnaEnds)).toBe('user-defined')
    expect(dnaEndsProvenanceAfterSequenceReplacement(record, 12, 12, 1, record.dnaEnds)).toBe('user-defined')
    expect(dnaEndsProvenanceAfterSequenceReplacement(record, 5, 6, 1, {
      ...record.dnaEnds,
      upstream: { ...record.dnaEnds.upstream, stickiness: 3 },
    })).toBe('user-defined')
    expect(dnaEndsProvenanceAfterSequenceReplacement({ ...record, dnaEndsProvenance: undefined }, 2, 3, 1, record.dnaEnds)).toBeUndefined()
  })
  it('parses and exports SnapGene block 8 properties', () => {
    const xml =
      '<AdditionalSequenceProperties><UpstreamEnzymeName>MfeI</UpstreamEnzymeName><DownstreamEnzymeName>BbvCI</DownstreamEnzymeName><UpstreamStickiness>4</UpstreamStickiness><DownstreamStickiness>-2</DownstreamStickiness><UpstreamModification>Unmodified</UpstreamModification><DownstreamModification>CovalentlyClosed</DownstreamModification></AdditionalSequenceProperties>'
    const ends = parseSnapGeneBlock8DnaEnds(xml)
    expect(ends.upstream).toEqual({ modification: 'unmodified', stickiness: 4, enzymeName: 'MfeI' })
    expect(ends.downstream).toEqual({ modification: 'covalentlyClosed', stickiness: -2, enzymeName: 'BbvCI' })
    expect(exportSnapGeneBlock8Xml(ends)).toContain('<UpstreamEnzymeName>MfeI</UpstreamEnzymeName>')
    expect(exportSnapGeneBlock8Xml(ends)).toContain('<DownstreamEnzymeName>BbvCI</DownstreamEnzymeName>')
    expect(exportSnapGeneBlock8Xml(ends)).toContain('<UpstreamStickiness>4</UpstreamStickiness>')
    expect(exportSnapGeneBlock8Xml(ends)).toContain('CovalentlyClosed')
    expect(snapGeneBlock8HasExplicitDnaEnds(xml)).toBe(true)
    expect(snapGeneBlock8HasExplicitDnaEnds('<AdditionalSequenceProperties><UpstreamStickiness>4</UpstreamStickiness></AdditionalSequenceProperties>')).toBe(false)
  })

  it('defaults missing ends to 5′-phosphorylated blunt', () => {
    expect(resolveDnaEnds({})).toEqual({
      upstream: { modification: 'fivePrimePhosphorylated', stickiness: 0 },
      downstream: { modification: 'fivePrimePhosphorylated', stickiness: 0 },
    })
  })

  it('hides the recessed strand for sticky overhangs', () => {
    const ends = {
      upstream: { modification: 'fivePrimePhosphorylated' as const, stickiness: 3 },
      downstream: { modification: 'fivePrimePhosphorylated' as const, stickiness: -2 },
    }
    expect(isDnaEndBaseVisible(0, 'forward', ends, 20)).toBe(true)
    expect(isDnaEndBaseVisible(0, 'reverse', ends, 20)).toBe(false)
    expect(isDnaEndBaseVisible(18, 'forward', ends, 20)).toBe(true)
    expect(isDnaEndBaseVisible(18, 'reverse', ends, 20)).toBe(false)
    expect(isDnaEndBaseVisible(10, 'forward', ends, 20)).toBe(true)
    expect(isDnaEndBaseVisible(10, 'reverse', ends, 20)).toBe(true)
  })

  it('reports contiguous strand ranges for overhang gaps and ssDNA', () => {
    const sticky = {
      upstream: { modification: 'fivePrimePhosphorylated' as const, stickiness: 3 },
      downstream: { modification: 'fivePrimePhosphorylated' as const, stickiness: -2 },
    }
    expect(dnaStrandVisibleRanges('forward', sticky, 20)).toEqual([{ start: 0, end: 20 }])
    expect(dnaStrandVisibleRanges('reverse', sticky, 20)).toEqual([{ start: 3, end: 18 }])

    const ssForward = {
      upstream: { modification: 'fivePrimePhosphorylated' as const, stickiness: 20 },
      downstream: { modification: 'fivePrimePhosphorylated' as const, stickiness: 0 },
    }
    expect(dnaStrandVisibleRanges('forward', ssForward, 20)).toEqual([{ start: 0, end: 20 }])
    expect(dnaStrandVisibleRanges('reverse', ssForward, 20)).toEqual([])
  })

  it('adds a single 3′ base on the left end', () => {
    const next = addThreePrimeBase(draft('ACGT'), 'upstream', 'A')
    // Bottom 3′ A → prepend top-strand complement T; stickiness becomes −1.
    expect(next.sequence).toBe('TACGT')
    expect(next.dnaEnds.upstream.stickiness).toBe(-1)
  })

  it('creates a 3′ overhang by deleting the top strand at the left end', () => {
    let state = draft('ABCDEFGH')
    state = {
      ...state,
      selection: { side: 'upstream', strand: 'forward', start: 0, end: 3 },
    }
    const next = deleteSingleStrand(state)
    expect(next.dnaEnds.upstream.stickiness).toBe(-3)
    expect(next.sequence).toBe('ABCDEFGH')
  })

  it('deletes single strand for an interior terminal-window selection', () => {
    const state: DnaEndsEditorDraft = {
      ...draft('ABCDEFGHIJKLMNOPQRST'),
      selection: { side: 'upstream', strand: 'forward', start: 2, end: 5 },
    }
    const next = deleteSingleStrand(state)
    expect(next.dnaEnds.upstream.stickiness).toBe(-5)
    expect(next.sequence).toBe('ABCDEFGHIJKLMNOPQRST')
  })

  it('keeps an overhang when deleting more protruding-strand bases than the overhang', () => {
    let state: DnaEndsEditorDraft = {
      ...draft('ABCDEFGHIJKLMNOP'),
      selection: { side: 'upstream', strand: 'forward', start: 0, end: 3 },
    }
    state = deleteSingleStrand(state)
    expect(state.dnaEnds.upstream.stickiness).toBe(-3)

    // Reverse protrudes; deleting 5 (>3) removes the ss DNA then hides reverse for the extra 2.
    state = {
      ...state,
      selection: { side: 'upstream', strand: 'reverse', start: 0, end: 5 },
    }
    state = deleteSingleStrand(state)
    expect(state.sequence).toBe('DEFGHIJKLMNOP')
    expect(state.dnaEnds.upstream.stickiness).toBe(2)
    expect(isDnaEndBaseVisible(0, 'forward', state.dnaEnds, state.sequence.length)).toBe(true)
    expect(isDnaEndBaseVisible(0, 'reverse', state.dnaEnds, state.sequence.length)).toBe(false)
  })

  it('keeps an overhang when deleting more recessed-then-opposite strand bases (vice versa)', () => {
    let state: DnaEndsEditorDraft = {
      ...draft('ABCDEFGHIJKLMNOP'),
      selection: { side: 'upstream', strand: 'reverse', start: 0, end: 2 },
    }
    state = deleteSingleStrand(state)
    expect(state.dnaEnds.upstream.stickiness).toBe(2)

    state = {
      ...state,
      selection: { side: 'upstream', strand: 'forward', start: 0, end: 5 },
    }
    state = deleteSingleStrand(state)
    expect(state.sequence).toBe('CDEFGHIJKLMNOP')
    expect(state.dnaEnds.upstream.stickiness).toBe(-3)
    expect(isDnaEndBaseVisible(0, 'forward', state.dnaEnds, state.sequence.length)).toBe(false)
    expect(isDnaEndBaseVisible(0, 'reverse', state.dnaEnds, state.sequence.length)).toBe(true)
  })

  it('trims exactly the selected tip of a protruding 3′ overhang', () => {
    let state: DnaEndsEditorDraft = {
      ...draft('ABCDEFGHIJKLMNOP'),
      selection: { side: 'upstream', strand: 'forward', start: 0, end: 5 },
    }
    state = deleteSingleStrand(state)
    expect(state.dnaEnds.upstream.stickiness).toBe(-5)

    // Select the first 2 bases of the ss reverse overhang and delete them.
    state = {
      ...state,
      selection: { side: 'upstream', strand: 'reverse', start: 0, end: 2 },
    }
    state = deleteSingleStrand(state)
    expect(state.sequence).toBe('CDEFGHIJKLMNOP')
    expect(state.dnaEnds.upstream.stickiness).toBe(-3)
    expect(isDnaEndBaseVisible(0, 'forward', state.dnaEnds, state.sequence.length)).toBe(false)
    expect(isDnaEndBaseVisible(0, 'reverse', state.dnaEnds, state.sequence.length)).toBe(true)
  })

  it('extends a recessed-strand deletion through the terminus', () => {
    let state: DnaEndsEditorDraft = {
      ...draft('ABCDEFGHIJKLMNOP'),
      selection: { side: 'upstream', strand: 'forward', start: 0, end: 3 },
    }
    state = deleteSingleStrand(state)
    state = {
      ...state,
      selection: { side: 'upstream', strand: 'forward', start: 0, end: 5 },
    }
    state = deleteSingleStrand(state)
    expect(state.sequence).toBe('ABCDEFGHIJKLMNOP')
    expect(state.dnaEnds.upstream.stickiness).toBe(-5)
    expect(isDnaEndBaseVisible(4, 'forward', state.dnaEnds, state.sequence.length)).toBe(false)
  })

  it('preserves an upstream overhang when deleting at the downstream end', () => {
    let state: DnaEndsEditorDraft = {
      ...draft('ABCDEFGHIJKLMNOP'),
      selection: { side: 'upstream', strand: 'forward', start: 0, end: 2 },
    }
    state = deleteSingleStrand(state)
    state = {
      ...state,
      selection: { side: 'downstream', strand: 'forward', start: 12, end: 16 },
    }
    state = deleteSingleStrand(state)
    expect(state.sequence).toBe('ABCDEFGHIJKLMNOP')
    expect(state.dnaEnds.upstream.stickiness).toBe(-2)
    expect(state.dnaEnds.downstream.stickiness).toBe(4)
    expect(isDnaEndBaseVisible(0, 'forward', state.dnaEnds, 16)).toBe(false)
    expect(isDnaEndBaseVisible(15, 'forward', state.dnaEnds, 16)).toBe(false)
  })

  it('makes an overhang double-stranded again', () => {
    const state: DnaEndsEditorDraft = {
      ...draft('ACGTACGT', { upstream: -2, downstream: 0 }),
      selection: { side: 'upstream', strand: 'reverse', start: 0, end: 2 },
    }
    expect(makeDoubleStranded(state).dnaEnds.upstream.stickiness).toBe(0)
  })

  it('inserts and deletes bases at a caret', () => {
    const state: DnaEndsEditorDraft = {
      ...draft('ACGT'),
      selection: { side: 'upstream', strand: 'forward', start: 2, end: 2 },
    }
    const inserted = insertBasesAtSelection(state, 'TT')
    expect(inserted.sequence).toBe('ACTTGT')
    expect(inserted.selection).toEqual({ side: 'upstream', strand: 'forward', start: 4, end: 4 })
  })

  it('types on the bottom strand at the 3′ end without contaminating the top strand', () => {
    // Clicking the last bottom-strand base leaves the caret at length-1 (not length).
    const state: DnaEndsEditorDraft = {
      ...draft('ACGT'),
      selection: { side: 'downstream', strand: 'reverse', start: 3, end: 3 },
    }
    const next = insertBasesAtSelection(state, 'C')
    // Typed C on bottom → store complement G; stickiness +1 hides top at the new tip.
    expect(next.sequence).toBe('ACGTG')
    expect(next.dnaEnds.downstream.stickiness).toBe(1)
    expect(isDnaEndBaseVisible(4, 'forward', next.dnaEnds, 5)).toBe(false)
    expect(isDnaEndBaseVisible(4, 'reverse', next.dnaEnds, 5)).toBe(true)
  })

  it('types on the top strand at the 3′ end to grow a top overhang', () => {
    const state: DnaEndsEditorDraft = {
      ...draft('ACGT'),
      selection: { side: 'downstream', strand: 'forward', start: 3, end: 3 },
    }
    const next = insertBasesAtSelection(state, 'C')
    expect(next.sequence).toBe('ACGTC')
    expect(next.dnaEnds.downstream.stickiness).toBe(-1)
    expect(isDnaEndBaseVisible(4, 'forward', next.dnaEnds, 5)).toBe(true)
    expect(isDnaEndBaseVisible(4, 'reverse', next.dnaEnds, 5)).toBe(false)
  })

  it('fills a 5′ top overhang by typing on the bottom strand to blunt it', () => {
    // Add G as a 5′ overhang on the left (top strand), then type C on bottom to fill.
    let state: DnaEndsEditorDraft = {
      ...draft('ACGT'),
      selection: { side: 'upstream', strand: 'forward', start: 0, end: 0 },
    }
    state = insertBasesAtSelection(state, 'G')
    expect(state.sequence).toBe('GACGT')
    expect(state.dnaEnds.upstream.stickiness).toBe(1)
    expect(isDnaEndBaseVisible(0, 'forward', state.dnaEnds, 5)).toBe(true)
    expect(isDnaEndBaseVisible(0, 'reverse', state.dnaEnds, 5)).toBe(false)

    state = {
      ...state,
      selection: { side: 'upstream', strand: 'reverse', start: 0, end: 0 },
    }
    state = insertBasesAtSelection(state, 'C')
    expect(state.sequence).toBe('GACGT')
    expect(state.dnaEnds.upstream.stickiness).toBe(0)
    expect(isDnaEndBaseVisible(0, 'forward', state.dnaEnds, 5)).toBe(true)
    expect(isDnaEndBaseVisible(0, 'reverse', state.dnaEnds, 5)).toBe(true)
  })

  it('fills a bottom-strand overhang by typing on the top strand', () => {
    let state: DnaEndsEditorDraft = {
      ...draft('ACGT'),
      selection: { side: 'downstream', strand: 'reverse', start: 4, end: 4 },
    }
    state = insertBasesAtSelection(state, 'A')
    expect(state.dnaEnds.downstream.stickiness).toBe(1)
    // Bottom shows A (stored as T); fill by typing on top.
    state = {
      ...state,
      selection: { side: 'downstream', strand: 'forward', start: 4, end: 4 },
    }
    state = insertBasesAtSelection(state, 'T')
    expect(state.sequence).toBe('ACGTT')
    expect(state.dnaEnds.downstream.stickiness).toBe(0)
  })

  it('backspaces exactly one overhang base at a time', () => {
    let state: DnaEndsEditorDraft = {
      ...draft('ACGTACGT', { upstream: 0, downstream: -3 }),
      selection: { side: 'downstream', strand: 'forward', start: 8, end: 8 },
    }
    // Overhang is last 3 bases; caret after tip → backspace removes one.
    state = deleteAtSelection(state, true)
    expect(state.sequence).toBe('ACGTACG')
    expect(state.dnaEnds.downstream.stickiness).toBe(-2)
    state = {
      ...state,
      selection: { side: 'downstream', strand: 'forward', start: state.sequence.length, end: state.sequence.length },
    }
    state = deleteAtSelection(state, true)
    expect(state.sequence).toBe('ACGTAC')
    expect(state.dnaEnds.downstream.stickiness).toBe(-1)
  })

  it('clears downstream stickiness when overhang bases are deleted from the sequence', () => {
    const ends = {
      upstream: { modification: 'fivePrimePhosphorylated' as const, stickiness: 0 },
      downstream: { modification: 'fivePrimePhosphorylated' as const, stickiness: -3 },
    }
    // Sequence …XYZ with top overhang of 3; delete the overhang stretch.
    const next = adjustDnaEndsForSequenceReplacement(ends, 7, 10, 0, 10)
    expect(next.downstream.stickiness).toBe(0)
    expect(next.upstream.stickiness).toBe(0)
  })

  it('reduces upstream stickiness when left-end overhang bases are deleted', () => {
    const ends = {
      upstream: { modification: 'fivePrimePhosphorylated' as const, stickiness: -4 },
      downstream: { modification: 'fivePrimePhosphorylated' as const, stickiness: 2 },
    }
    const next = adjustDnaEndsForSequenceReplacement(ends, 0, 2, 0, 20)
    expect(next.upstream.stickiness).toBe(-2)
    expect(next.downstream.stickiness).toBe(2)
  })

  it('deletes a base on one strand without removing its complement', () => {
    const state: DnaEndsEditorDraft = {
      ...draft('ACGTACGT'),
      selection: { side: 'upstream', strand: 'forward', start: 0, end: 0 },
    }
    const next = deleteAtSelection(state, false)
    expect(next.sequence).toBe('ACGTACGT')
    expect(next.dnaEnds.upstream.stickiness).toBe(-1)
    expect(isDnaEndBaseVisible(0, 'forward', next.dnaEnds, 8)).toBe(false)
    expect(isDnaEndBaseVisible(0, 'reverse', next.dnaEnds, 8)).toBe(true)
  })

  it('shifts features when left-end overhang removal shortens the sequence', () => {
    let state: DnaEndsEditorDraft = {
      sequence: 'ABCDEFGHIJKLMNOP',
      features: [
        {
          id: 'f1',
          name: 'CDS',
          type: 'CDS',
          color: '#f00',
          locations: [{ start: 6, end: 12, strand: 'forward' }],
        } as DnaEndsEditorDraft['features'][number],
      ],
      dnaEnds: {
        upstream: { modification: 'fivePrimePhosphorylated', stickiness: 0 },
        downstream: { modification: 'fivePrimePhosphorylated', stickiness: 0 },
      },
      selection: { side: 'upstream', strand: 'forward', start: 0, end: 3 },
    }
    state = deleteSingleStrand(state)
    state = {
      ...state,
      selection: { side: 'upstream', strand: 'reverse', start: 0, end: 5 },
    }
    state = deleteSingleStrand(state)
    // Removed 3 bases from the left; feature 6–12 must become 3–9 (not double-shifted / left behind).
    expect(state.sequence).toBe('DEFGHIJKLMNOP')
    expect(state.features[0]?.locations).toEqual([{ start: 3, end: 9, strand: 'forward' }])
  })
})
