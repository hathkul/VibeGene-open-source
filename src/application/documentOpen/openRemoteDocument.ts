import type { OpenedDesktopSequence } from '../../domain/openDesktopSequenceFile'
import { normalizeRemoteSequenceUrl } from '../../domain/remoteSequenceFile'
import type { RemoteSequenceFile } from '../../domain/remoteSequenceFile'

/** Infrastructure supplied by the composition root for remote-document opens. */
export type RemoteDocumentOpenPorts = {
  download: (sourceUrl: string) => Promise<RemoteSequenceFile>
  parse: (bytes: Uint8Array, fileName: string) => Promise<OpenedDesktopSequence>
}

export type OpenedRemoteDocument = OpenedDesktopSequence & {
  sourceUrl: string
}

/**
 * Download a validated remote document for the interactive import pipeline.
 * Parsing remains with the caller because the mounted workspace can offer
 * choices (settings, topology, and trace handling) that boot cannot show yet.
 */
export async function downloadRemoteDocument(
  sourceUrl: string,
  download: RemoteDocumentOpenPorts['download'],
): Promise<RemoteSequenceFile> {
  const normalizedSourceUrl = normalizeRemoteSequenceUrl(sourceUrl)
  const remote = await download(normalizedSourceUrl)
  if (!remote.bytes.byteLength) throw new Error('The remote sequence file is empty.')
  return remote
}

/** Download and parse a remote document before the workspace is mounted. */
export async function openRemoteDocument(
  sourceUrl: string,
  ports: RemoteDocumentOpenPorts,
): Promise<OpenedRemoteDocument> {
  const remote = await downloadRemoteDocument(sourceUrl, ports.download)
  const opened = await ports.parse(remote.bytes, remote.fileName)
  return { ...opened, sourceUrl: remote.sourceUrl }
}
