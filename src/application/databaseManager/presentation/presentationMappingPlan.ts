/**
 * Wiring plan for phase 2: map `AppDatabaseManager*` slices onto presentation
 * `DatabaseManager*` / `DatabaseFolderSyncStatus` props without type imports here.
 *
 * - Header: `AppDatabaseManagerHeaderPresentationSlice` → `DatabaseManagerHeaderModel`
 *   (`nativeWindowTitle` → native title effect; `activity` → busy/status span)
 * - Sidebar: `AppDatabaseManagerSidebarChromeSlice` → sidebar labels/visibility
 * - Toolbar: each `AppDatabaseManager*ToolbarSlice` → matching key on `DatabaseManagerToolbarModel`
 * - Folder sync: `AppDatabaseManagerFolderSyncStatusSlice` → `DatabaseFolderSyncStatusModel`
 *   (`sourceRegion.kind === 'loading'` → loading span only; mapped → heading/path;
 *   `lastSyncedAt` + `appDatabaseManagerFolderSyncLastSyncedLine` at adapter)
 * - Records: empty/pagination slices → table pane models; files pick slices → files model flags
 */

export const APP_DATABASE_MANAGER_PRESENTATION_MAPPING_PLAN = true
