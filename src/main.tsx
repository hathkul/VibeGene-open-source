import { TraceAlignmentContext } from './presentation/hooks/traceAlignmentContext'
import { alignTracesWithWorkers } from './workerAdapters/traceAlignment'
import { DnaComparisonContext, ProteinComparisonContext, RestrictionScanContext } from './presentation/hooks/workerStreamContexts'
import { startDnaComparison, startProteinComparison, startRestrictionScan } from './workerAdapters/workerStreams'
import { CommonFeatureDetectionContext } from './presentation/hooks/commonFeatureDetectionContext'
import { LabelRouterContext } from './presentation/map/labelRouterContext'
import { detectCommonFeaturesWithWorker } from './workerAdapters/commonFeatureDetection'
import { createLabelRouterClient } from './workerAdapters/labelRouterClient'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
// Opt-in visual primitives load after App.css so migrated components own their
// theme contract instead of losing to legacy feature selectors.
import './styles/theme-primitives.css'
import { HybridWindowHost } from './desktop/HybridWindowHost.tsx'
import { hybridWindowKindFromUrl } from './desktop/hybridWindows.ts'
import { isTauriRuntime } from './desktop/tauriRuntime'
import { registerServiceWorker } from './registerServiceWorker.ts'
import { installPreventOverscrollNavigation } from './preventOverscrollNavigation.ts'
import { initSnapGeneLzma } from './domain/snapgeneLzma.ts'
import { DialogDragManager } from './ui/DialogDragManager.tsx'
import { ColorSchemeSwitch } from './ui/ColorSchemeSwitch.tsx'
import { initializeColorScheme } from './domain/colorScheme.ts'
import { shouldShowColorSchemeSwitch } from './desktop/colorSchemeSwitchVisibility.ts'
import {
  deleteManagedDatabaseFile,
  readManagedDatabaseFile,
  writeManagedDatabaseFile,
} from './desktop/managedDatabaseFolders.ts'
import { configureManagedDatabaseMirror } from './storage/managedDatabaseMirror.ts'
import { configureNcbiBlastRequester } from './domain/ncbiBlast.ts'
import { ncbiBlastTransport } from './ncbiBlastTransport.ts'
import { installNativeCloseCoordinator } from './desktop/windowCloseGuard'
import { subscribeLastWindowHiddenForDatabaseSync } from './desktop/syncOnExit'
import { DesktopUpdaterHost } from './desktop/DesktopUpdaterHost'
import { checkForDesktopUpdateInBackground } from './desktop/desktopUpdater'

configureManagedDatabaseMirror({
  writeFile: writeManagedDatabaseFile,
  readFile: readManagedDatabaseFile,
  deleteFile: deleteManagedDatabaseFile,
})
configureNcbiBlastRequester(ncbiBlastTransport)

// Apply the saved scheme before React renders so secondary windows start in the
// same appearance without briefly painting the default beige palette.
initializeColorScheme()

if (isTauriRuntime()) {
  document.documentElement.classList.add('vg-tauri')
}

const hybridKind = hybridWindowKindFromUrl()

if (!hybridKind) {
  registerServiceWorker()
}
installPreventOverscrollNavigation()
void initSnapGeneLzma()

async function mountApp() {
  if (isTauriRuntime()) {
    await installNativeCloseCoordinator()
    await subscribeLastWindowHiddenForDatabaseSync()
    window.setTimeout(() => { void checkForDesktopUpdateInBackground() }, 15_000)
    window.setInterval(() => { void checkForDesktopUpdateInBackground() }, 60 * 60 * 1000)
  }
  // Resolve construct handoffs before App mounts so the first paint is not pDemo.
  // Never wait unbounded — a stalled IndexedDB/FS handoff used to leave "Loading" forever.
  // Remote launch files have their own 30 s network timeout and need a larger budget.
  const BOOTSTRAP_BUDGET_MS = new URLSearchParams(window.location.search).has('url') ? 32_000 : 4_000
  const bootstrap =
    !hybridKind && typeof App.prepareBootstrap === 'function'
      ? Promise.race([
          Promise.resolve(App.prepareBootstrap()).catch((error) => {
            console.error('prepareBootstrap failed', error)
          }),
          new Promise<void>((resolve) => {
            window.setTimeout(resolve, BOOTSTRAP_BUDGET_MS)
          }),
        ])
      : Promise.resolve()

  // Drop the boot splash before (or while) bootstrap finishes. Circular map radius search
  // can block the main thread after mount; do not keep splash up for handoff stalls.
  dismissBootSplash()
  await bootstrap

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <CommonFeatureDetectionContext.Provider value={detectCommonFeaturesWithWorker}>
        <LabelRouterContext.Provider value={createLabelRouterClient}>
          <DnaComparisonContext.Provider value={startDnaComparison}>
            <ProteinComparisonContext.Provider value={startProteinComparison}>
              <RestrictionScanContext.Provider value={startRestrictionScan}>
                <TraceAlignmentContext.Provider value={alignTracesWithWorkers}>
                  <DialogDragManager />
                  {hybridKind === 'startup' && isTauriRuntime() && <DesktopUpdaterHost />}
                  {shouldShowColorSchemeSwitch(hybridKind) && <ColorSchemeSwitch />}
                  {hybridKind ? <HybridWindowHost kind={hybridKind} /> : <App />}
                </TraceAlignmentContext.Provider>
              </RestrictionScanContext.Provider>
            </ProteinComparisonContext.Provider>
          </DnaComparisonContext.Provider>
        </LabelRouterContext.Provider>
      </CommonFeatureDetectionContext.Provider>
    </StrictMode>,
  )
}

void mountApp()

function dismissBootSplash() {
  const splash = document.getElementById('boot-splash')
  if (!splash) return

  const params = new URLSearchParams(window.location.search)
  const hybridWindow = params.get('vgWindow')
  // Hybrid popups and secondary New-window loads never show splash
  // (also hidden via index.html for first paint). Startup keeps splash for a
  // normal dock launch; Open With / file association uses bootSplash=0.
  if (
    (hybridWindow && hybridWindow !== 'startup') ||
    params.get('bootSplash') === '0' ||
    document.documentElement.classList.contains('vg-hybrid-window') ||
    document.documentElement.classList.contains('vg-no-splash')
  ) {
    splash.remove()
    return
  }
  const hold = params.get('bootSplash')
  // Keep forever for local preview: ?bootSplash=1 or ?bootSplash
  if (hold === '' || hold === '1' || hold === 'true') return
  // Optional custom hold in ms: ?bootSplash=500
  const customMs = hold != null ? Number(hold) : NaN
  if (Number.isFinite(customMs) && customMs >= 0) {
    if (customMs === 0) {
      splash.remove()
      return
    }
    window.setTimeout(() => fadeOutSplash(splash), customMs)
    return
  }

  // Default: show splash for 3 seconds on app launch.
  window.setTimeout(() => fadeOutSplash(splash), 3000)
}

function fadeOutSplash(splash: HTMLElement) {
  splash.classList.add('is-leaving')
  const remove = () => splash.remove()
  splash.addEventListener('transitionend', remove, { once: true })
  window.setTimeout(remove, 400)
}
