import { describe, expect, it } from 'vitest'
import { labPlasmid } from '../../domain/fixtures'
import {
  remoteSequenceImportStatusMessage,
  remoteSequenceProviderDisplayName,
} from './remoteSequenceImportPresentation'

describe('remoteSequenceImportPresentation', () => {
  it('maps provider ids to display names', () => {
    expect(remoteSequenceProviderDisplayName()).toBe('database')
    expect(remoteSequenceProviderDisplayName('ncbi')).toBe('NCBI')
    expect(remoteSequenceProviderDisplayName('uniprot')).toBe('UniProt')
    expect(remoteSequenceProviderDisplayName('ensembl')).toBe('Ensembl')
  })

  it('formats import status with accession and feature count', () => {
    expect(remoteSequenceImportStatusMessage(labPlasmid, 'NM_1', 'NCBI')).toBe(
      `Imported NM_1 from NCBI (${(1134).toLocaleString()} bp, 5 features).`,
    )
  })
})
