import type { PrimerBindingLayout, SequenceRecord, Strand } from '../../domain/types'

/** Window kinds shared by the desktop adapter, payloads, and result protocol. */
export type HybridWindowKind =
  | 'startup'
  | 'letter-codes'
  | 'genetic-code-tables'
  | 'enzyme-database'
  | 'common-features-browse'
  | 'agarose-gel'
  | 'database'
  | 'new-dna-file'
  | 'new-protein-file'
  | 'primer-properties'
  | 'preferences'

export type DatabaseAlignmentPickMode = 'dna' | 'protein'

export type DatabaseAlignmentPick = {
  mode: DatabaseAlignmentPickMode
  /** Workspace construct that should receive the selected sequences. */
  targetRecordId: string
}

export type DatabaseLibraryMemberPick = {
  /** Library or construct that should receive the selected DNA constructs. */
  targetRecordId: string
  /** `add` inserts into an open library; `convert` creates a library from peers. */
  purpose?: 'add' | 'convert'
}

export type DatabaseAlignmentConstruct = {
  id: string
  name: string
  sequence: string
  molecule: SequenceRecord['molecule']
}

export type PrimerPropertiesPayload = {
  name: string
  sequence: string
  color?: string
  description?: string
  specificity?: import('../../domain/primer3/specificity').SavedPrimerSpecificity
  commonId?: string
  templateSequence?: string
  preferredStrand?: Strand
  bindings?: PrimerBindingLayout[]
}

export type HybridWindowResult =
  | { kind: 'database'; type: 'status'; message: string }
  | {
      kind: 'database'
      type: 'add-primers'
      targetRecordId: string | null
      primers: Array<{ name: string; sequence: string; color?: string; description?: string }>
    }
  | {
      kind: 'database'
      type: 'add-to-alignment'
      mode: DatabaseAlignmentPickMode
      targetRecordId: string
      constructs: DatabaseAlignmentConstruct[]
    }
  | { kind: 'database'; type: 'add-construct'; requestId: string; projectId: string }
  | { kind: 'database'; type: 'add-constructs'; requestId: string; projectIds: string[] }
  | { kind: 'database'; type: 'add-library-members'; targetRecordId: string; projectIds: string[] }
  | { kind: 'database'; type: 'construct-pick-cancelled'; requestId: string }
  | { kind: 'database'; type: 'open-primer-properties'; primer: PrimerPropertiesPayload }
  | { kind: 'new-dna-file'; type: 'status'; message: string }
  | { kind: 'new-protein-file'; type: 'status'; message: string }
  | { kind: HybridWindowKind; type: 'closed' }
