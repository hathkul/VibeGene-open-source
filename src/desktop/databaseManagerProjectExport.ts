import { zipSync } from 'fflate'
import { exportBaseName, uniquifyExportFileNames } from '../application/databaseManager/exportNamePlanning'
import { sequenceRecordFromLibraryMember } from '../domain/libraryMemberRecord'
import { isDnaLibraryRecord } from '../domain/dnaLibrary'
import { exportFasta, exportGenBank, exportSnapGene } from '../domain/parsers'
import { normalizeProjectFileName, getProject, type StoredProject } from '../storage/projects'
import { sanitizePathSegment } from '../storage/databaseExport'
type DatabaseProjectExportFormat = 'dna' | 'gb' | 'fasta'
import {
  pickDesktopDirectory,
  saveBytesAs,
  saveTextAs,
  writeUniqueBytesToDirectory,
} from './fileIo'
import { isTauriRuntime } from './tauriRuntime'

function databaseProjectFileName(project: StoredProject): string {
  return normalizeProjectFileName(project.fileName ?? project.syncRelativePath, project.name, project.molecule)
}

function projectExportFiles(project: StoredProject, format: DatabaseProjectExportFormat): Array<{
  fileName: string
  bytes: Uint8Array
}> {
  const preferred = databaseProjectFileName(project)
  const base = exportBaseName(preferred || project.name)
  const snapGeneExt = project.record.molecule === 'protein' ? 'prot' : 'dna'
  if (format === 'dna') {
    const fileName = preferred.toLowerCase().endsWith(`.${snapGeneExt}`)
      ? preferred
      : `${base}.${snapGeneExt}`
    return [{ fileName, bytes: exportSnapGene(project.record) }]
  }

  const encoder = new TextEncoder()
  const extension = format === 'gb' ? 'gb' : 'fasta'
  const encodeRecord = (record: StoredProject['record'], fileName: string) => ({
    fileName,
    bytes: encoder.encode(format === 'gb' ? exportGenBank(record) : exportFasta(record)),
  })

  if (isDnaLibraryRecord(project.record)) {
    const members = project.record.traceFiles ?? []
    if (members.length > 0) {
      const libraryStem = sanitizePathSegment(base)
      return members.map((member) => {
        const memberRecord = sequenceRecordFromLibraryMember(member, {
          topology: project.record.topology,
        })
        const memberStem = sanitizePathSegment(exportBaseName(member.fileName || 'member'))
        return encodeRecord(memberRecord, `${libraryStem}-${memberStem}.${extension}`)
      })
    }
  }

  return [encodeRecord(project.record, `${base}.${extension}`)]
}

export async function exportProjectById(
  projectId: string,
  format: DatabaseProjectExportFormat,
): Promise<{ path: string | null; fileLabel: string }> {
  const project = await getProject(projectId)
  if (!project) throw new Error('Project not found')
  const files = uniquifyExportFileNames(projectExportFiles(project, format))
  if (files.length === 1) {
    const file = files[0]!
    if (format === 'dna') {
      const path = await saveBytesAs(file.fileName, file.bytes, 'application/octet-stream')
      return { path, fileLabel: file.fileName }
    }
    const path = await saveTextAs(file.fileName, new TextDecoder().decode(file.bytes), 'text/plain')
    return { path, fileLabel: file.fileName }
  }

  if (isTauriRuntime()) {
    const directory = await pickDesktopDirectory(`Export ${files.length} files`)
    if (!directory) throw new Error('Export cancelled.')
    for (const file of files) {
      await writeUniqueBytesToDirectory(directory, file.fileName, file.bytes)
    }
    return { path: directory, fileLabel: `${files.length} files` }
  }

  const entries: Record<string, Uint8Array> = {}
  for (const file of files) entries[file.fileName] = file.bytes
  const zipBytes = zipSync(entries, { level: 6 })
  const stamp = new Date().toISOString().slice(0, 10)
  const zipName = `vibegene-export-${stamp}.zip`
  await saveBytesAs(zipName, zipBytes, 'application/zip')
  return { path: null, fileLabel: zipName }
}

export async function exportSelectedProjects(
  projectIds: readonly string[],
  format: DatabaseProjectExportFormat,
): Promise<{ message: string }> {
  if (!projectIds.length) throw new Error('No files selected.')
  const loaded = await Promise.all(projectIds.map((id) => getProject(id)))
  const projects = loaded.filter((project): project is StoredProject => Boolean(project))
  if (!projects.length) throw new Error('Selected files are no longer available.')
  if (projects.length !== projectIds.length) {
    throw new Error('One or more selected files are no longer available.')
  }

  const files = uniquifyExportFileNames(
    projects.flatMap((project) => projectExportFiles(project, format)),
  )

  if (files.length === 1) {
    const file = files[0]!
    if (format === 'dna') {
      const path = await saveBytesAs(file.fileName, file.bytes, 'application/octet-stream')
      return { message: path ? `Exported ${path}` : `Exported ${file.fileName}` }
    }
    const path = await saveTextAs(file.fileName, new TextDecoder().decode(file.bytes), 'text/plain')
    return { message: path ? `Exported ${path}` : `Exported ${file.fileName}` }
  }

  if (isTauriRuntime()) {
    const directory = await pickDesktopDirectory(`Export ${files.length} selected files`)
    if (!directory) throw new Error('Export cancelled.')
    for (const file of files) {
      await writeUniqueBytesToDirectory(directory, file.fileName, file.bytes)
    }
    return { message: `Exported ${files.length} files to ${directory}` }
  }

  const entries: Record<string, Uint8Array> = {}
  for (const file of files) entries[file.fileName] = file.bytes
  const zipBytes = zipSync(entries, { level: 6 })
  const stamp = new Date().toISOString().slice(0, 10)
  const zipName = `vibegene-export-${stamp}.zip`
  await saveBytesAs(zipName, zipBytes, 'application/zip')
  return { message: `Exported ${files.length} files as ${zipName}` }
}
