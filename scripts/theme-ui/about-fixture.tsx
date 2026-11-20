import { createRoot } from 'react-dom/client'
import '../../src/index.css'
import '../../src/App.css'
import '../../src/styles/theme-primitives.css'
import { AboutDialog } from '../../src/AboutDialog'

createRoot(document.getElementById('root')!).render(<AboutDialog onDismiss={() => {}} />)
