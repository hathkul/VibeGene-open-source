import { dnaSequenceDigest } from './proteinTranslationProvenance'
import type { ProteinTranslationSource, SequenceRecord } from './types'

export type ProteinSourceReferenceStatus =
  | 'verified'
  | 'missing-id'
  | 'missing-digest'
  | 'missing'
  | 'lookup-error'
  | 'wrong-molecule'
  | 'sequence-mismatch'

export type ProteinSourceReferenceVerification = {
  key: string
  projectId?: string
  projectName: string
  status: ProteinSourceReferenceStatus
  record?: SequenceRecord
}

export async function verifyProteinSourceReferences(
  sources: readonly ProteinTranslationSource[],
  loadProject: (projectId: string) => Promise<SequenceRecord | null>,
): Promise<ProteinSourceReferenceVerification[]> {
  return Promise.all(sources.map(async (source, index) => {
    const base = {
      key: `${source.projectId ?? source.projectName ?? 'source'}#${index}`,
      ...(source.projectId ? { projectId: source.projectId } : {}),
      projectName: source.projectName || 'Source DNA',
    }
    if (!source.projectId) return { ...base, status: 'missing-id' as const }
    if (!source.sequenceDigest) return { ...base, status: 'missing-digest' as const }
    let record: SequenceRecord | null
    try {
      record = await loadProject(source.projectId)
    } catch {
      return { ...base, status: 'lookup-error' as const }
    }
    if (!record) return { ...base, status: 'missing' as const }
    if (record.molecule === 'protein') return { ...base, status: 'wrong-molecule' as const }
    if (source.sequenceDigest && dnaSequenceDigest(record.sequence) !== source.sequenceDigest) {
      return { ...base, status: 'sequence-mismatch' as const, record }
    }
    return { ...base, status: 'verified' as const, record }
  }))
}

export function proteinSourceReferenceStatusLabel(status: ProteinSourceReferenceStatus) {
  if (status === 'verified') return 'Verified'
  if (status === 'missing-id') return 'No database ID'
  if (status === 'missing-digest') return 'No sequence fingerprint'
  if (status === 'missing') return 'Database file missing'
  if (status === 'lookup-error') return 'Database lookup failed'
  if (status === 'wrong-molecule') return 'Reference is not DNA/RNA'
  return 'Sequence changed'
}
