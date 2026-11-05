import { BaseDirectory, writeTextFile } from '@tauri-apps/plugin-fs'
import type { SyncPlanDiagnosticWriter } from '../storage/databaseImport'

/** Desktop adapter for optional development-only sync-plan diagnostics. */
export const writeHomeSyncPlanDiagnostic: SyncPlanDiagnosticWriter = (fileName, contents) =>
  writeTextFile(fileName, contents, { baseDir: BaseDirectory.Home })
