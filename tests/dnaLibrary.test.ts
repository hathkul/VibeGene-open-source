import { describe, expect, it } from 'vitest'
import {
  applyMemberSequenceEditAtTemplateRange,
  applySaveFileNameToStubLibraryName,
  buildMajorityConsensusFromAlignments,
  createDnaLibraryFromMembers,
  cropDnaLibraryToTemplateRange,
  DEFAULT_DNA_LIBRARY_NAME,
  flipDnaLibrary,
  flipDnaLibraryAsync,
  isDnaLibraryRecord,
  memberNativeRangeForTemplateSpan,
  pickLibraryConsensusSeed,
  rebuildDnaLibraryConsensus,
  rebuildDnaLibraryConsensusAsync,
  shouldCreateDnaLibraryFromOpenDrop,
  syncTraceSequenceAndBaseCalls,
} from '../src/domain/dnaLibrary'
import { alignTraceToTemplate } from '../src/domain/traceAlignment'
import { reverseComplement } from '../src/domain/sequence'
import { traceRecordFromSequence } from '../src/domain/sequenceTraceFactory'
import type { TraceFileRecord } from '../src/domain/traceTypes'

function member(name: string, sequence: string): TraceFileRecord {
  return traceRecordFromSequence(sequence, name)
}

describe('dnaLibrary', () => {
  it('creates a library with longest member as consensus', () => {
    const short = member('a.seq', 'ATGCATGC')
    const long = member('b.seq', 'ATGCATGCATGC')
    const { record, members } = createDnaLibraryFromMembers([short, long], { name: 'Panel' })
    expect(isDnaLibraryRecord(record)).toBe(true)
    expect(record.sequence).toBe('ATGCATGCATGC')
    expect(record.name).toBe('Panel')
    expect(members).toHaveLength(2)
    expect(members.every((item) => item.alignment || item.parseError)).toBe(true)
  })

  it('picks the longest seed', () => {
    const seed = pickLibraryConsensusSeed([
      member('short.seq', 'AAA'),
      member('long.seq', 'AAAAAA'),
      member('empty.seq', ''),
    ])
    expect(seed?.fileName).toBe('long.seq')
  })

  it('builds majority consensus from aligned members', () => {
    const reference = 'ATGCATGC'
    const m1 = {
      ...member('1.seq', 'ATGCATGC'),
      alignment: alignTraceToTemplate('ATGCATGC', reference),
      enabled: true,
    }
    const m2 = {
      ...member('2.seq', 'ATGTATGC'),
      alignment: alignTraceToTemplate('ATGTATGC', reference),
      enabled: true,
    }
    const m3 = {
      ...member('3.seq', 'ATGTATGC'),
      alignment: alignTraceToTemplate('ATGTATGC', reference),
      enabled: true,
    }
    expect(buildMajorityConsensusFromAlignments(reference, [m1, m2, m3])).toBe('ATGTATGC')
  })

  it('maps template spans to native member ranges', () => {
    const alignment = alignTraceToTemplate('ATGCAT', 'ATGCAT')
    expect(alignment).not.toBeNull()
    expect(memberNativeRangeForTemplateSpan(alignment!, 1, 4)).toEqual({ start: 1, end: 4 })
    expect(memberNativeRangeForTemplateSpan(alignment!, 2, 2)).toEqual({ start: 2, end: 2 })
  })

  it('edits a member sequence at a template selection and realigns', () => {
    const consensus = 'ATGCATGC'
    const trace = {
      ...member('read.seq', 'ATGCATGC'),
      alignment: alignTraceToTemplate('ATGCATGC', consensus),
    }
    const edited = applyMemberSequenceEditAtTemplateRange(trace, 2, 4, 'AA', 'linear', consensus)
    expect(edited.sequence).toBe('ATAAATGC')
    expect(edited.alignment).not.toBeNull()
    expect(edited.chromatogram.baseCalls.join('')).toBe('ATAAATGC')
  })

  it('marks chromatogram-backed members as sequenceEdited', () => {
    const withPeaks: TraceFileRecord = {
      ...member('x.ab1', 'ATGC'),
      chromatogram: {
        aTrace: [1, 2, 3, 4],
        tTrace: [1, 2, 3, 4],
        gTrace: [1, 2, 3, 4],
        cTrace: [1, 2, 3, 4],
        basePos: [1, 2, 3, 4],
        baseCalls: ['A', 'T', 'G', 'C'],
      },
    }
    const edited = syncTraceSequenceAndBaseCalls(withPeaks, 'ATAA')
    expect(edited.sequenceEdited).toBe(true)
    expect(edited.chromatogram.baseCalls).toEqual(['A', 'T', 'A', 'A'])
    expect(edited.chromatogram.aTrace).toHaveLength(4)
  })

  it('crops consensus and members to a template range', () => {
    const consensus = 'ATGCATGCATGC'
    const m1 = {
      ...member('1.seq', 'ATGCATGCATGC'),
      alignment: alignTraceToTemplate('ATGCATGCATGC', consensus),
      enabled: true,
    }
    const m2 = {
      ...member('2.seq', 'ATGCATGTATGC'),
      alignment: alignTraceToTemplate('ATGCATGTATGC', consensus),
      enabled: true,
    }
    const cropped = cropDnaLibraryToTemplateRange(consensus, [m1, m2], 4, 8)
    expect(cropped.consensus).toBe('ATGC')
    expect(cropped.members[0]!.sequence).toBe('ATGC')
    expect(cropped.members[1]!.sequence).toBe('ATGT')
    expect(cropped.members.every((item) => item.alignment)).toBe(true)
  })

  it('rebuilds consensus by re-seeding from remaining members', () => {
    const good = 'ATGCATGCATGCATGC'
    const poison = `${'G'.repeat(20)}CCCC`
    const m1 = {
      ...member('good1.seq', good),
      alignment: alignTraceToTemplate(good, poison),
      enabled: true,
    }
    const m2 = {
      ...member('good2.seq', good),
      alignment: alignTraceToTemplate(good, poison),
      enabled: true,
    }
    // Partial alignments against a poisoned consensus should not trap rebuild.
    expect(m1.alignment!.templateEnd - m1.alignment!.templateStart).toBeLessThan(poison.length)

    const rebuilt = rebuildDnaLibraryConsensus(poison, [m1, m2])
    expect(rebuilt.consensus).toBe(good)
    expect(rebuilt.members.every((item) => item.alignment && item.alignment.templateEnd - item.alignment.templateStart === good.length)).toBe(true)
  })

  it('ignores disabled members when rebuilding consensus', () => {
    const good = 'ATGCATGCATGC'
    const junk = 'TTTTTTTTTTTTTTTTTTTT'
    const kept = {
      ...member('kept.seq', good),
      enabled: true,
      alignment: alignTraceToTemplate(good, junk),
    }
    const removed = {
      ...member('junk.seq', junk),
      enabled: false,
      alignment: alignTraceToTemplate(junk, junk),
    }
    const rebuilt = rebuildDnaLibraryConsensus(junk, [kept, removed])
    expect(rebuilt.consensus).toBe(good)
    expect(rebuilt.members[1]!.alignment).toBeNull()
  })

  it('keeps worker-backed consensus rebuild equivalent to the synchronous result', async () => {
    const seed = member('seed.seq', 'ATGCATGCATGC')
    const variant = member('variant.seq', 'ATGTATGCATGC')
    const disabled = { ...member('disabled.seq', 'GGGGGGGGGGGG'), enabled: false }
    const members = [seed, variant, member('variant-2.seq', 'ATGTATGCATGC'), disabled]
    const expected = rebuildDnaLibraryConsensus('AAAAAAAAAAAA', members)
    const actual = await rebuildDnaLibraryConsensusAsync('AAAAAAAAAAAA', members)
    expect(actual).toEqual(expected)
  })

  it('detects library-creating open drops', () => {
    const ab1 = new File([''], 'a.ab1')
    const seq = new File([''], 'b.seq')
    const dna = new File([''], 'c.dna')
    expect(shouldCreateDnaLibraryFromOpenDrop([ab1, seq])).toBe(true)
    expect(shouldCreateDnaLibraryFromOpenDrop([ab1])).toBe(false)
    expect(shouldCreateDnaLibraryFromOpenDrop([ab1, dna])).toBe(false)
  })

  it('flips consensus and members so reverse-seeded libraries reorient', () => {
    const fwd = member('F.seq', 'ATGCATGCATAA')
    const rev = member('R.seq', reverseComplement('ATGCATGCATAA'))
    const { record } = createDnaLibraryFromMembers([rev, fwd], { name: 'FlipMe' })
    const seeded = { ...record, sequence: rev.sequence }
    const aligned = [rev, fwd].map((item) => ({
      ...item,
      alignment: alignTraceToTemplate(item.sequence, seeded.sequence),
    }))
    const { record: flipped, members: flippedMembers } = flipDnaLibrary(seeded, aligned)
    expect(flipped.sequence).toBe(reverseComplement(seeded.sequence))
    expect(flippedMembers).toHaveLength(2)
    for (const item of flippedMembers) {
      const before = aligned.find((entry) => entry.id === item.id)!
      expect(item.sequence).toBe(reverseComplement(before.sequence))
      expect(item.alignment).toBeTruthy()
    }
  })

  it('matches synchronous flip results while reporting member progress', async () => {
    const first = member('first.seq', 'ATGCATGCATAA')
    const second = member('second.seq', 'ATGCATGCATAT')
    const { record, members } = createDnaLibraryFromMembers([first, second], { name: 'FlipMe' })
    const updates: Array<[number, number]> = []
    const expected = flipDnaLibrary(record, members)
    const actual = await flipDnaLibraryAsync(record, members, 'linear', undefined, (completed, total) => {
      updates.push([completed, total])
    })
    expect(actual).toEqual(expected)
    expect(updates).toEqual([[1, 2], [2, 2]])
  })

  it('defaults multi-member libraries to Untitled library', () => {
    const { record } = createDnaLibraryFromMembers([
      member('a.seq', 'ATGC'),
      member('b.seq', 'ATGCAA'),
    ])
    expect(record.name).toBe(DEFAULT_DNA_LIBRARY_NAME)
  })

  it('copies save file stem into stub library construct name only', () => {
    const { record: stub } = createDnaLibraryFromMembers([
      member('a.seq', 'ATGC'),
      member('b.seq', 'ATGCAA'),
    ])
    expect(applySaveFileNameToStubLibraryName(stub, 'My panel.dna').name).toBe('My panel')
    expect(applySaveFileNameToStubLibraryName(stub, 'Untitled library.dna').name).toBe(
      DEFAULT_DNA_LIBRARY_NAME,
    )
    expect(applySaveFileNameToStubLibraryName(stub, null).name).toBe(DEFAULT_DNA_LIBRARY_NAME)

    const named = { ...stub, name: 'Already named' }
    expect(applySaveFileNameToStubLibraryName(named, 'Other.dna').name).toBe('Already named')
  })
})
