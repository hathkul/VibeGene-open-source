import { describe, expect, it } from 'vitest'
import { buildUniProtAnnotationPlan, parseUniProtBlastXml, type UniProtSimilarityHit } from './proteinUniProtAnnotation'

describe('UniProt similarity BLAST parsing', () => {
  it('parses the current EMBL-EBI Job Dispatcher XML schema', () => {
    const xml = `<?xml version="1.0"?>
      <EBIApplicationResult>
        <SequenceSimilaritySearchResult>
          <hits total="1">
            <hit number="1" database="SP" id="P53_HUMAN" ac="P04637" length="393"
              description="Cellular tumor antigen p53 OS=Homo sapiens">
              <alignments total="1">
                <alignment number="1">
                  <score>325</score><bits>129.8</bits><expectation>4e-37</expectation>
                  <identity>100.0</identity><positives>100.0</positives><gaps>0</gaps>
                  <querySeq start="1" end="60">MEEPQSDP</querySeq>
                  <matchSeq start="1" end="60">MEEPQSDP</matchSeq>
                </alignment>
              </alignments>
            </hit>
          </hits>
        </SequenceSimilaritySearchResult>
      </EBIApplicationResult>`

    expect(parseUniProtBlastXml(xml, 60)).toEqual([{
      accession: 'P04637',
      description: 'Cellular tumor antigen p53 OS=Homo sapiens',
      subjectLength: 393,
      bitScore: 129.8,
      eValue: 4e-37,
      identityPercent: 100,
      positivesPercent: 100,
      queryCoveragePercent: 100,
      queryStart: 1,
      queryEnd: 60,
      subjectStart: 1,
      subjectEnd: 60,
    }])
  })

  it('retains support for NCBI BlastOutput XML', () => {
    const xml = `<BlastOutput><Hit><Hit_id>sp|P04637|P53_HUMAN</Hit_id><Hit_accession>P04637</Hit_accession>
      <Hit_def>Cellular tumor antigen p53</Hit_def><Hit_len>393</Hit_len><Hsp>
      <Hsp_bit-score>129.8</Hsp_bit-score><Hsp_evalue>4e-37</Hsp_evalue><Hsp_identity>60</Hsp_identity>
      <Hsp_positive>60</Hsp_positive><Hsp_align-len>60</Hsp_align-len><Hsp_query-from>1</Hsp_query-from>
      <Hsp_query-to>60</Hsp_query-to><Hsp_hit-from>1</Hsp_hit-from><Hsp_hit-to>60</Hsp_hit-to>
      </Hsp></Hit></BlastOutput>`
    expect(parseUniProtBlastXml(xml, 60)[0]).toMatchObject({
      accession: 'P04637', identityPercent: 100, queryCoveragePercent: 100,
    })
  })

  it('splits transferred protein features around differing amino acids', () => {
    const hit = {
      accession: 'PTEST', description: 'Test protein', subjectLength: 10, bitScore: 50, eValue: 1e-10,
      identityPercent: 90, positivesPercent: 90, queryCoveragePercent: 100, queryStart: 1, queryEnd: 10,
      subjectStart: 1, subjectEnd: 10, reviewed: true, featureCount: 1, bondCount: 0,
      entry: {
        primaryAccession: 'PTEST', sequence: { value: 'MAAAAYAAAA', length: 10 },
        features: [{ type: 'DOMAIN', description: 'Test domain', location: { start: { value: 1 }, end: { value: 10 } } }],
      },
    } as UniProtSimilarityHit
    const annotation = buildUniProtAnnotationPlan('MAAAACAAAA', 100, hit).annotations.find((item) => item.kind === 'feature')!
    expect(annotation.identityPercent).toBe(90)
    expect(annotation.feature?.locations).toEqual([
      { start: 100, end: 105, strand: 'forward' },
      { start: 106, end: 110, strand: 'forward' },
    ])
    expect(annotation.feature?.notes).toContain('differing amino acids omitted')
  })
})
