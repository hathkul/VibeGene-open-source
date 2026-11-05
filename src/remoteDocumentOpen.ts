import { downloadRemoteDocument, openRemoteDocument } from './application/documentOpen/openRemoteDocument'
import { downloadRemoteSequenceFile } from './remoteSequenceDownload'

/** Composition-root adapter for interactive remote-document imports. */
export function downloadRemoteSequenceDocument(sourceUrl: string) {
  return downloadRemoteDocument(sourceUrl, downloadRemoteSequenceFile)
}

/** Composition-root adapter for loading a remote document before first paint. */
export function openRemoteSequenceDocument(sourceUrl: string) {
  return openRemoteDocument(sourceUrl, {
    download: downloadRemoteSequenceFile,
    parse: async (bytes, fileName) => {
      const { openDesktopSequenceBytes } = await import('./domain/openDesktopSequenceFile')
      return openDesktopSequenceBytes(bytes, fileName)
    },
  })
}
