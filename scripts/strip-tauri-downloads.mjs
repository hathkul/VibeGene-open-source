import { rm } from 'node:fs/promises'

const downloadsDir = new URL('../dist/downloads/', import.meta.url)
const serviceWorker = new URL('../dist/sw.js', import.meta.url)

await rm(downloadsDir, { recursive: true, force: true })
// A service worker in WebView2 can outlive the executable and serve assets from
// an older desktop release. The standalone app loads bundled assets directly.
await rm(serviceWorker, { force: true })
