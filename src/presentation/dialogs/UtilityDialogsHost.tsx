import type { Dispatch, SetStateAction } from 'react'
import type { SequenceRecord, Topology } from '../../domain/types'
import { DnaMolecularWeightDialog, DoubleDigestDialog, LetterCodesDialog, type ToolsMwSelection } from '../../ToolsDialogs'
import { PreferencesDialog } from '../../PreferencesDialog'
import { GenerateLinkDialog } from '../../GenerateLinkDialog'
import { OpenSequenceUrlDialog, RemoteSequenceOpenErrorDialog } from '../../GenerateLinkDialog'
import type { AppPreferences } from '../../domain/appPreferences'
import type { RemoteSequenceOpenError } from './utilityDialogTypes'

export type UtilityDialogsHostProps = {
  record: SequenceRecord
  dnaMwOpen: boolean
  toolsMwSelection: ToolsMwSelection | null
  setDnaMwOpen: (open: boolean) => void
  doubleDigestOpen: boolean
  setDoubleDigestOpen: (open: boolean) => void
  letterCodesOpen: boolean
  setLetterCodesOpen: (open: boolean) => void
  preferencesOpen: boolean
  setPreferencesOpen: (open: boolean) => void
  appPreferences: AppPreferences
  onSaveAppPreferences: (preferences: AppPreferences) => void | Promise<void>
  generateLinkOpen: boolean
  setGenerateLinkOpen: (open: boolean) => void
  openSequenceUrlOpen: boolean
  setOpenSequenceUrlOpen: (open: boolean) => void
  requestDocumentExit: (action: () => void | Promise<void>) => void
  downloadRemoteSequenceDocument: (url: string) => Promise<{ fileName: string; bytes: Uint8Array }>
  bytesToFile: (name: string, bytes: Uint8Array) => File
  handleFile: (file: File) => Promise<void>
  setStatus: (status: string) => void
  setRemoteSequenceOpenError: Dispatch<SetStateAction<RemoteSequenceOpenError | null>>
  remoteSequenceOpenError: RemoteSequenceOpenError | null
}

/** Hosts standalone sequence tools, preferences, link, and remote-open dialogs. */
export function UtilityDialogsHost(props: UtilityDialogsHostProps) {
  const {
    record, dnaMwOpen, toolsMwSelection, setDnaMwOpen, doubleDigestOpen, setDoubleDigestOpen,
    letterCodesOpen, setLetterCodesOpen, preferencesOpen, setPreferencesOpen, appPreferences,
    onSaveAppPreferences, generateLinkOpen, setGenerateLinkOpen, openSequenceUrlOpen,
    setOpenSequenceUrlOpen, requestDocumentExit, downloadRemoteSequenceDocument, bytesToFile,
    handleFile, setStatus, setRemoteSequenceOpenError, remoteSequenceOpenError,
  } = props
  return (
    <>
      {dnaMwOpen && <DnaMolecularWeightDialog name={record.name} sequence={record.sequence} topology={record.topology as Topology} selection={toolsMwSelection} onClose={() => setDnaMwOpen(false)} />}
      {doubleDigestOpen && <DoubleDigestDialog onClose={() => setDoubleDigestOpen(false)} />}
      {letterCodesOpen && <LetterCodesDialog onClose={() => setLetterCodesOpen(false)} />}
      {preferencesOpen && <PreferencesDialog initial={appPreferences} onClose={() => setPreferencesOpen(false)} onSave={(preferences) => { void onSaveAppPreferences(preferences) }} />}
      {generateLinkOpen && <GenerateLinkDialog onClose={() => setGenerateLinkOpen(false)} />}
      {openSequenceUrlOpen && <OpenSequenceUrlDialog onCancel={() => setOpenSequenceUrlOpen(false)} onOpen={(sourceUrl) => { requestDocumentExit(async () => { setOpenSequenceUrlOpen(false); setStatus('Downloading sequence file…'); try { const remote = await downloadRemoteSequenceDocument(sourceUrl); await handleFile(bytesToFile(remote.fileName, remote.bytes)) } catch (error) { const message = error instanceof Error ? error.message : String(error); setRemoteSequenceOpenError({ message, detail: 'The current construct was left unchanged. Check that the source link is public, still available, and permits cross-origin downloads.' }); setStatus(`Could not open sequence from URL: ${message}`) } }) }} />}
      {remoteSequenceOpenError && <RemoteSequenceOpenErrorDialog message={remoteSequenceOpenError.message} detail={remoteSequenceOpenError.detail} onClose={() => setRemoteSequenceOpenError(null)} />}
    </>
  )
}
