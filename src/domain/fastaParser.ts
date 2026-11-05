import { makeRecord } from './parserRecord'
import type { SequenceRecord } from './types'

const proteinSequenceExtensions = new Set(['aa', 'faa', 'pep', 'prot', 'protein'])
const nucleotideAlphabet = /^[ACGTURYSWKMBDHVN\s\d._-]+$/i

/** Infer protein FASTA/plain-text records without misclassifying ordinary ambiguous DNA. */
export function inferProteinSequence(sequence: string, fileName: string, header = ''): boolean {
  // Explicit molecule annotations are authoritative. A sufficiently long IUPAC
  // nucleotide sequence also outweighs a misleading protein suffix, while very
  // short strings such as ACGT remain ambiguous and follow their file type.
  if (/\b(?:molecule|type)\s*[:=]\s*(?:protein|peptide|aa|amino[ -]?acid)\b/i.test(header)) return true
  if (/\b(?:molecule|type)\s*[:=]\s*(?:dna|rna|nucleotide|genomic)\b/i.test(header)) return false
  const compact = sequence.replace(/^>.*$/gm, '').replace(/[^A-Za-z*]/g, '')
  const extension = fileName.split('.').pop()?.toLowerCase() ?? ''
  const proteinExtension = proteinSequenceExtensions.has(extension)
  if (compact.length > 0 && nucleotideAlphabet.test(compact)) {
    return proteinExtension && compact.length < 12
  }
  return proteinExtension || compact.length > 0
}

export function parseFasta(text: string, fileName: string): SequenceRecord {
  const lines = text.trim().split(/\r?\n/)
  const header = lines[0]?.replace(/^>/, '').trim() || fileName
  const [name, ...descriptionParts] = header.split(/\s+/)
  const sequence = lines.slice(1).join('')
  return makeRecord({
    name: name || fileName.replace(/\.[^.]+$/, ''),
    description: descriptionParts.join(' '),
    topology: 'linear',
    molecule: inferProteinSequence(sequence, fileName, header) ? 'protein' : 'dna',
    sequence,
  })
}

export function exportFasta(record: SequenceRecord) {
  const sequenceLines = record.sequence.match(/.{1,70}/g)?.join('\n') ?? ''
  return `>${record.name} ${record.description}`.trim() + `\n${sequenceLines}\n`
}

export { nucleotideAlphabet }
