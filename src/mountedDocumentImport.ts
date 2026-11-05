import {
  prepareImportedFile,
  type ImportProfilingPorts,
  type ImportProgressPorts,
} from './application/documentImport/prepareImportedFile'
import { isAb1Bytes, parseAb1File } from './domain/ab1Parser'
import {
  isSnapGeneBytes,
  parseProjectJson,
  parseSequenceBytes,
  parseSnapGene,
} from './domain/parsers'
import { importRequiresTopologyChoice } from './domain/sequenceTopology'
import { isSettingsFile, parseSettingsJson } from './domain/settingsFile'
import { vibegeneEnzymeDisplayFromSnapGeneRecord } from './domain/snapgeneEnzymeData'
import { parseSnapGeneTracesAsync } from './domain/snapgeneTraces'

export type MountedDocumentImportOptions = {
  localPath?: string
  profile: ImportProfilingPorts
  progress?: ImportProgressPorts
}

/**
 * Browser-file and parser composition for a mounted workspace import.
 * React state commits remain with the workspace shell.
 */
export async function prepareMountedDocumentImport(
  file: File,
  options: MountedDocumentImportOptions,
) {
  const bytes = new Uint8Array(await file.arrayBuffer())
  return prepareImportedFile(
    { fileName: file.name, bytes, localPath: options.localPath },
    {
      decodeText: (input) => new TextDecoder().decode(input),
      isAb1: isAb1Bytes,
      isSnapGene: isSnapGeneBytes,
      parseTrace: () => parseAb1File(file),
      parseSnapGene: (input, fileName) => parseSnapGene(input, fileName, { skipTraces: true }),
      parseSnapGeneTraces: parseSnapGeneTracesAsync,
      parseProjectJson,
      isSettingsFile,
      parseSettingsJson,
      importRequiresTopologyChoice,
      parseSequenceBytes,
      enzymeDisplayFromSnapGeneRecord: vibegeneEnzymeDisplayFromSnapGeneRecord,
    },
    options.profile,
    options.progress,
  )
}
