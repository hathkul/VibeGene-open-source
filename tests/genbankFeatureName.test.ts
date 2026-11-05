import { describe, expect, it } from 'vitest'
import {
  featureDisplayName,
  resolveGenBankFeatureName,
} from '../src/domain/genbankFeatureName'
import { parseGenBank } from '../src/domain/parsers'

describe('resolveGenBankFeatureName', () => {
  const cds = [{ start: 100, end: 400 }]

  it('prefers /label then /standard_name for any type', () => {
    expect(resolveGenBankFeatureName('exon', '/gene="X"\n/label="custom exon"\n/standard_name="std"')).toBe('custom exon')
    expect(resolveGenBankFeatureName('exon', '/gene="X"\n/standard_name="std exon"')).toBe('std exon')
    expect(resolveGenBankFeatureName('CDS', '/gene="X"\n/standard_name="std cds"\n/note="ignored"')).toBe('std cds')
  })

  it('names gene and CDS from /gene over /note', () => {
    expect(resolveGenBankFeatureName('gene', '/gene="BRCA1"\n/note="breast cancer 1"')).toBe('BRCA1')
    expect(resolveGenBankFeatureName('CDS', '/gene="BRCA1"\n/note="isoform A"\n/product="protein"')).toBe('BRCA1')
    expect(resolveGenBankFeatureName('CDS', '/product="protein X"\n/note="isoform"')).toBe('protein X')
  })

  it('uses type display names for structural and peptide features', () => {
    expect(resolveGenBankFeatureName('exon', '/gene="BRCA1"\n/note="exon 2"')).toBe('exon')
    expect(resolveGenBankFeatureName('mat_peptide', '/gene="BRCA1"')).toBe('mature peptide')
    expect(resolveGenBankFeatureName('sig_peptide', '/gene="BRCA1"')).toBe('signal peptide')
    expect(resolveGenBankFeatureName('precursor_RNA', '/gene="BRCA1"')).toBe('precursor RNA')
    expect(resolveGenBankFeatureName('rRNA', '/gene="RNR1"\n/note="18S"')).toBe('rRNA')
    expect(resolveGenBankFeatureName('tRNA', '/gene="TRNA"\n/product="tRNA-Ala"')).toBe('tRNA')
  })

  it('composes gene-prefixed names for mRNA / prim_transcript / transcript', () => {
    expect(resolveGenBankFeatureName('mRNA', '/gene="BRCA1"\n/note="transcript variant"')).toBe('BRCA1 mRNA')
    expect(resolveGenBankFeatureName('prim_transcript', '/gene="BRCA1"')).toBe('BRCA1 primary transcript')
    expect(resolveGenBankFeatureName('transcript', '/gene="BRCA1"')).toBe('BRCA1 transcript')
    expect(resolveGenBankFeatureName('mRNA', '/note="orphan"')).toBe('mRNA')
  })

  it('names ncRNA from /ncRNA_class', () => {
    expect(resolveGenBankFeatureName('ncRNA', '/gene="X"\n/ncRNA_class="lncRNA"\n/note="long"')).toBe('lncRNA')
    expect(resolveGenBankFeatureName('ncRNA', '/gene="X"')).toBe('ncRNA')
  })

  it('uses /note for misc outside CDS, type name inside CDS, never /gene', () => {
    expect(
      resolveGenBankFeatureName('misc_feature', '/gene="BRCA1"\n/note="enhancer-like"', {
        locations: [{ start: 10, end: 50 }],
        cdsRanges: cds,
      }),
    ).toBe('enhancer-like')
    expect(
      resolveGenBankFeatureName('misc_feature', '/gene="BRCA1"\n/note="domain"', {
        locations: [{ start: 150, end: 200 }],
        cdsRanges: cds,
      }),
    ).toBe('miscellaneous')
    expect(
      resolveGenBankFeatureName('misc_feature', '/gene="BRCA1"\n/standard_name="StdMisc"\n/note="domain"', {
        locations: [{ start: 150, end: 200 }],
        cdsRanges: cds,
      }),
    ).toBe('StdMisc')
  })

  it('ignores /note when it is longer than 30 characters', () => {
    expect(resolveGenBankFeatureName('misc_feature', '/note="short note"', {
      locations: [{ start: 10, end: 20 }],
      cdsRanges: cds,
    })).toBe('short note')
    expect(
      resolveGenBankFeatureName(
        'misc_feature',
        '/note="this note is definitely longer than thirty characters"',
        {
          locations: [{ start: 10, end: 20 }],
          cdsRanges: cds,
        },
      ),
    ).toBe('miscellaneous')
    expect(
      resolveGenBankFeatureName(
        'misc_signal',
        '/note="this note is definitely longer than thirty characters"',
      ),
    ).toBe('misc_signal')
  })
})

describe('featureDisplayName', () => {
  it('prefers stored name over /note', () => {
    expect(
      featureDisplayName({
        name: 'AmpR',
        type: 'CDS',
        notes: '/note="ampicillin resistance" /gene="bla"',
      }),
    ).toBe('AmpR')
  })

  it('falls back label → gene → note when stored name is empty', () => {
    expect(featureDisplayName({ name: '', type: 'CDS', notes: '/gene="bla" /note="res"' })).toBe('bla')
    expect(featureDisplayName({ name: '  ', type: 'CDS', notes: '/note="res"' })).toBe('res')
  })

  it('does not use overlong /note as display fallback', () => {
    expect(
      featureDisplayName({
        name: '  ',
        type: 'misc_feature',
        notes: '/note="this note is definitely longer than thirty characters"',
      }),
    ).toBe('miscellaneous')
  })
})

describe('parseGenBank naming integration', () => {
  it('applies type-specific names and misc-within-CDS rule', () => {
    const gb = `LOCUS       TEST             500 bp    DNA     linear
DEFINITION  test.
FEATURES             Location/Qualifiers
     gene            50..450
                     /gene="BRCA1"
                     /note="breast cancer 1"
     CDS             100..400
                     /gene="BRCA1"
                     /note="isoform A"
                     /product="BRCA1 protein"
     exon            100..200
                     /gene="BRCA1"
                     /note="exon 1"
     mRNA            50..450
                     /gene="BRCA1"
                     /note="variant 1"
     prim_transcript 40..460
                     /gene="BRCA1"
     transcript      45..455
                     /gene="BRCA1"
     precursor_RNA   40..460
                     /gene="BRCA1"
     ncRNA           10..30
                     /gene="BRCA1"
                     /ncRNA_class="miRNA"
     rRNA            470..490
                     /gene="RNR"
                     /note="18S"
     mat_peptide     120..380
                     /gene="BRCA1"
     misc_feature    150..180
                     /gene="BRCA1"
                     /note="inside cds note"
     misc_feature    60..80
                     /gene="BRCA1"
                     /note="utr note"
     misc_feature    200..220
                     /standard_name="StdInside"
                     /note="ignored"
     promoter        1..40
                     /standard_name="StdProm"
                     /gene="BRCA1"
ORIGIN
${'a'.repeat(500)}
//`

    const record = parseGenBank(gb)
    const byTypeNote = (type: string, includes?: string) =>
      record.features.find(
        (f) => f.type === type && (includes == null || (f.notes ?? '').includes(includes)),
      )

    expect(byTypeNote('gene')?.name).toBe('BRCA1')
    expect(byTypeNote('CDS')?.name).toBe('BRCA1')
    expect(byTypeNote('exon')?.name).toBe('exon')
    expect(byTypeNote('mRNA')?.name).toBe('BRCA1 mRNA')
    expect(byTypeNote('prim_transcript')?.name).toBe('BRCA1 primary transcript')
    expect(byTypeNote('transcript')?.name).toBe('BRCA1 transcript')
    expect(byTypeNote('precursor_RNA')?.name).toBe('precursor RNA')
    expect(byTypeNote('ncRNA')?.name).toBe('miRNA')
    expect(byTypeNote('rRNA')?.name).toBe('rRNA')
    expect(byTypeNote('mat_peptide')?.name).toBe('mature peptide')
    expect(byTypeNote('misc_feature', 'inside cds note')?.name).toBe('miscellaneous')
    expect(byTypeNote('misc_feature', 'utr note')?.name).toBe('utr note')
    expect(byTypeNote('misc_feature', 'StdInside')?.name).toBe('StdInside')
    expect(byTypeNote('promoter')?.name).toBe('StdProm')
  })

  it('parses multi-line join locations so misc-within-CDS works on later exons', () => {
    const gb = `LOCUS       TEST             500 bp    DNA     linear
DEFINITION  test.
FEATURES             Location/Qualifiers
     CDS             join(10..50,100..150,
                     200..250,300..350)
                     /gene="X"
     misc_feature    220..230
                     /gene="X"
                     /note="domain in later exon"
     misc_feature    60..80
                     /gene="X"
                     /note="between exons"
ORIGIN
${'a'.repeat(500)}
//`
    const record = parseGenBank(gb)
    const cds = record.features.find((f) => f.type === 'CDS')
    expect(cds?.locations.map((l) => [l.start, l.end])).toEqual([
      [9, 50],
      [99, 150],
      [199, 250],
      [299, 350],
    ])
    expect(record.features.find((f) => (f.notes ?? '').includes('domain in later exon'))?.name).toBe(
      'miscellaneous',
    )
    expect(record.features.find((f) => (f.notes ?? '').includes('between exons'))?.name).toBe(
      'between exons',
    )
  })
})
