import { JSDOM } from 'jsdom'
;(globalThis as unknown as { DOMParser: typeof DOMParser }).DOMParser = new JSDOM('').window.DOMParser
import { readFileSync } from 'fs'
import { parseSnapGene } from '../src/domain/parsers.ts'
import { normalizeDna, reverseComplement } from '../src/domain/sequence.ts'

function load(path: string) {
  return parseSnapGene(new Uint8Array(readFileSync(path)), path, { skipTraces: true })
}

function attInfo(r: ReturnType<typeof load>) {
  return r.features
    .filter((f) => /^att[LR]/i.test(f.name))
    .map((f) => {
      const l = f.locations[0]!
      const top = normalizeDna(r.sequence.slice(l.start, l.end))
      return {
        name: f.name,
        type: f.type,
        strand: l.strand,
        start: l.start,
        end: l.end,
        len: l.end - l.start,
        top,
        func: l.strand === 'reverse' ? reverseComplement(top) : top,
        raw: f,
      }
    })
}

function sameCircle(a: string, b: string) {
  const A = normalizeDna(a)
  const B = normalizeDna(b)
  if (A.length !== B.length) return { ok: false, reason: `len ${A.length} vs ${B.length}` }
  if ((A + A).includes(B)) return { ok: true, reason: 'circular-equal' }
  return { ok: false, reason: 'same length but not circular equal' }
}

function compare(label: string, snPath: string, vgPath: string, sites: [string, string]) {
  const sn = load(snPath)
  const vg = load(vgPath)
  console.log(`\n======== ${label} ========`)
  console.log('lens', sn.sequence.length, vg.sequence.length, sameCircle(sn.sequence, vg.sequence))
  const snA = attInfo(sn)
  const vgA = attInfo(vg)
  console.log('sn sites', snA.map((a) => `${a.name}:${a.strand}@${a.start}-${a.end}/${a.len}`))
  console.log('vg sites', vgA.map((a) => `${a.name}:${a.strand}@${a.start}-${a.end}/${a.len}`))

  for (const name of sites) {
    const s = snA.find((a) => a.name === name)!
    const v = vgA.find((a) => a.name === name)!
    console.log(name, {
      topEqual: s.top === v.top,
      funcEqual: s.func === v.func,
      strandEqual: s.strand === v.strand,
      lenEqual: s.len === v.len,
      snTopInVg: vg.sequence.includes(s.top) || normalizeDna(vg.sequence).includes(reverseComplement(s.top)),
      posSn: [s.start, s.end],
      posVg: [v.start, v.end],
    })
    if (s.top !== v.top) {
      console.log('  sn', s.top)
      console.log('  vg', v.top)
    }
  }

  // Junction check
  const [left, right] = sites
  const sL = snA.find((a) => a.name === left)!
  const sR = snA.find((a) => a.name === right)!
  const vL = vgA.find((a) => a.name === left)!
  const vR = vgA.find((a) => a.name === right)!
  const snSeq = normalizeDna(sn.sequence)
  const vgSeq = normalizeDna(vg.sequence)
  const snInsert = snSeq.slice(sL.end, sR.start)
  const vgInsert = vgSeq.slice(vL.end, vR.start)
  console.log('insert lens', snInsert.length, vgInsert.length, 'equal', snInsert === vgInsert)
  console.log('after L sn/vg', snSeq.slice(sL.end, sL.end + 25), '/', vgSeq.slice(vL.end, vL.end + 25))
  console.log('before R sn/vg', snSeq.slice(sR.start - 25, sR.start), '/', vgSeq.slice(vR.start - 25, vR.start))

  // Check for B leftovers
  console.log(
    'B5 leftover before R?',
    /CAACTTTTGTATACAAAGTTG$/.test(vgSeq.slice(0, vR.start).slice(-40)),
  )

  // Feature XML-ish extras from raw feature object keys
  console.log(
    'feature keys sn',
    Object.keys(snA[0]?.raw || {}),
    'vg',
    Object.keys(vgA[0]?.raw || {}),
  )
}

compare('1-5r', '1-5r-snap.dna', '1-5rnew4.dna', ['attL1', 'attR5'])
compare('5-2', '5-2snap.dna', '5-2new4.dna', ['attL5', 'attL2'])

// Binary/XML probe for Gateway-specific markup SnapGene may need
import { readFileSync as rf } from 'fs'
for (const path of ['1-5r-snap.dna', '1-5rnew4.dna', '5-2snap.dna', '5-2new4.dna']) {
  const text = rf(path).toString('latin1')
  const hits = {
    Gateway: (text.match(/Gateway/gi) || []).length,
    attB: (text.match(/attB\d/g) || []).length,
    directionality: (text.match(/directionality="/g) || []).length,
    TranslatedFeatureDW: (text.match(/TranslatedFeatureDW|segType|Gateway/g) || []).length,
    protein_bind: (text.match(/type="protein_bind"/g) || []).length,
    misc_recomb: (text.match(/misc_recomb|misc_binding|recombination/gi) || []).length,
  }
  console.log('\nmarkup', path, hits)
  // Extract Feature tags for att*
  const featureTags = [...text.matchAll(/<Feature\b[^>]*name="att[^"]*"[^>]*>/gi)].map((m) => m[0])
  console.log(' att Feature tags:', featureTags.slice(0, 4))
}
