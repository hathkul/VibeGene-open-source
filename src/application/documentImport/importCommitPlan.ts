import { formatSequenceLength } from '../../domain/moleculeCapabilities'
import { isDnaLibraryRecord } from '../../domain/dnaLibrary'
import type { VibegeneEnzymeDisplayImport } from '../../domain/snapgeneEnzymeData'
import type { SequenceRecord } from '../../domain/types'

export type ImportedWorkspaceInitPlan = {
  selection: { kind: 'neutral' }
  showLibraryAlignments: boolean
}

/** Selection, range, and library-alignment intent applied when a freshly imported record replaces the workspace. */
export function planImportedWorkspaceInit(record: SequenceRecord): ImportedWorkspaceInitPlan {
  return {
    selection: { kind: 'neutral' },
    showLibraryAlignments: isDnaLibraryRecord(record),
  }
}

export type SnapGeneImportCommitPlan = ImportedWorkspaceInitPlan & {
  status: string
  enzymeDisplay: VibegeneEnzymeDisplayImport | null
}

/** Deterministic SnapGene import commit plan: status wording (trace count) and enzyme-display application. */
export function planSnapGeneImportCommit(options: {
  record: SequenceRecord
  fileName: string
  traceCount: number
  enzymeDisplay: VibegeneEnzymeDisplayImport | null
}): SnapGeneImportCommitPlan {
  const init = planImportedWorkspaceInit(options.record)
  const lengthLabel = formatSequenceLength(options.record.sequence.length, options.record.molecule)
  return {
    ...init,
    enzymeDisplay: options.enzymeDisplay,
    status: options.traceCount
      ? `Imported ${options.fileName} (${lengthLabel}, ${options.traceCount} sequencing traces).`
      : `Imported ${options.fileName} (${lengthLabel}).`,
  }
}

export type ProjectImportCommitPlan = ImportedWorkspaceInitPlan & {
  status: string
  extras: string[]
}

/** Deterministic project import commit plan: extras status construction and selection intent. */
export function planProjectImportCommit(options: {
  record: SequenceRecord
  fileName: string
  commonFeatureCount: number
  customMwLadderCount: number
  hasVisualSettings: boolean
}): ProjectImportCommitPlan {
  const init = planImportedWorkspaceInit(options.record)
  const extras: string[] = []
  if (options.commonFeatureCount) extras.push(`${options.commonFeatureCount} common features`)
  if (options.customMwLadderCount) extras.push(`${options.customMwLadderCount} custom MW markers`)
  if (options.hasVisualSettings) extras.push('visual settings')
  const lengthLabel = formatSequenceLength(options.record.sequence.length, options.record.molecule)
  return {
    ...init,
    extras,
    status: extras.length
      ? `Imported ${options.fileName} (${lengthLabel}) with ${extras.join(' and ')}.`
      : `Imported ${options.fileName} (${lengthLabel}).`,
  }
}
