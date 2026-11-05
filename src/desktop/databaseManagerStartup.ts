import { listFolders } from '../storage/projectLibrary'
import { listHistoryTrimRecoveryBatches } from '../storage/projects'
import { loadPrimerTagMap } from '../storage/databasePrimers'

export async function loadDatabaseManagerStartupData() {
  const [folders, primerTags, recoveries] = await Promise.all([
    listFolders(),
    loadPrimerTagMap(),
    listHistoryTrimRecoveryBatches(),
  ])
  return { folders, primerTags, recoveries }
}
