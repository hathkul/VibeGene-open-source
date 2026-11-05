import { proteinMassLabelFromSequence, projectConstructNameVisible } from './databaseManagerFormatters'
import type {
  DatabaseManagerBuiltInTableRow,
  DatabaseManagerLibraryMemberRow,
  DatabaseManagerPrimerTableRow,
  DatabaseManagerProjectTableRow,
  DatabaseManagerProteinTableRow,
} from './databaseManagerTableTypes'

export function mapPrimerTableRows(
  primers: Array<{
    key: string
    name: string
    sequence: string
    color: string
    sources: Array<{ projectName: string }>
  }>,
  tagsForKey: (key: string) => string[],
): DatabaseManagerPrimerTableRow[] {
  return primers.map((primer) => ({
    key: primer.key,
    name: primer.name,
    sequence: primer.sequence,
    color: primer.color,
    fileLabel:
      primer.sources.length === 1 ? primer.sources[0]!.projectName : `${primer.sources.length} files`,
    fileTitle: primer.sources.map((source) => source.projectName).join(', '),
    tags: tagsForKey(primer.key),
  }))
}

export function mapProteinTableRows(
  proteins: Array<{
    key: string
    name: string
    sequence: string
    color: string
    product: string
    sources: Array<{ projectName: string }>
  }>,
): DatabaseManagerProteinTableRow[] {
  return proteins.map((protein) => ({
    key: protein.key,
    name: protein.name,
    sequence: protein.sequence,
    color: protein.color,
    massLabel: proteinMassLabelFromSequence(protein.sequence),
    product: protein.product,
    fileLabel:
      protein.sources.length === 1 ? protein.sources[0]!.projectName : `${protein.sources.length} files`,
    fileTitle: protein.sources.map((source) => source.projectName).join(', '),
  }))
}

export function mapBuiltInTableRows(
  entries: Array<{ id: string; label: string; kindLabel: string; length: number }>,
): DatabaseManagerBuiltInTableRow[] {
  return entries.map((entry) => ({
    id: entry.id,
    label: entry.label,
    kindLabel: entry.kindLabel,
    length: entry.length,
  }))
}

export function mapProjectTableRows(input: {
  projects: Array<{
    id: string
    name: string
    fileName: string
    formatLabel: string
    folderLabel: string
    tags: string[]
    updatedLabel: string
    sequenceLengthLabel: string
    fileSizeLabel: string
    isCurrent: boolean
    isLibrary: boolean
    libraryExpanded: boolean
    libraryMembersLoading: boolean
    libraryMembers: Array<{
      id: string
      fileName: string
      parentFileName: string
      sequenceLengthLabel: string
      parseError?: string
      enabled: boolean
      openDisabled: boolean
      openTitle: string
    }> | null
    selected: boolean
    rowActionLabel: string
    rowActionDisabled: boolean
  }>
}): DatabaseManagerProjectTableRow[] {
  return input.projects.map((project) => ({
    id: project.id,
    fileName: project.fileName,
    showConstructName: projectConstructNameVisible(project.name, project.fileName),
    constructName: project.name,
    formatLabel: project.formatLabel,
    folderLabel: project.folderLabel,
    tags: project.tags,
    updatedLabel: project.updatedLabel,
    sequenceLengthLabel: project.sequenceLengthLabel,
    fileSizeLabel: project.fileSizeLabel,
    isCurrent: project.isCurrent,
    isLibrary: project.isLibrary,
    libraryExpanded: project.libraryExpanded,
    libraryMembersLoading: project.libraryMembersLoading,
    libraryMembers: project.libraryMembers,
    selected: project.selected,
    rowActionLabel: project.rowActionLabel,
    rowActionDisabled: project.rowActionDisabled,
  }))
}

export type { DatabaseManagerLibraryMemberRow }
