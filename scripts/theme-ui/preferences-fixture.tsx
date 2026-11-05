import { createRoot } from 'react-dom/client'
import '../../src/index.css'
import '../../src/App.css'
import '../../src/styles/theme-primitives.css'
import { PreferencesDialog } from '../../src/PreferencesDialog'
import { DEFAULT_APP_PREFERENCES } from '../../src/domain/appPreferences'

const fixtureParams = new URLSearchParams(location.search)
if (fixtureParams.has('hybrid')) document.documentElement.classList.add('vg-hybrid-window')
if (fixtureParams.has('fit-content')) document.documentElement.classList.add('vg-hybrid-fit-content')
createRoot(document.getElementById('root')!).render(<PreferencesDialog initial={DEFAULT_APP_PREFERENCES} onClose={() => {}} />)
