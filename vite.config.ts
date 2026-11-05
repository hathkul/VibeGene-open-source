import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

const configuredHost = process.env.TAURI_DEV_HOST
// On Windows, Tauri's devUrl is fixed to localhost. Respecting an old
// TAURI_DEV_HOST=127.0.0.1 from PowerShell can make Vite bind only IPv4 while
// WebView2 resolves localhost to IPv6, leaving a cached but inert startup UI.
const host = process.platform === 'win32' ? 'localhost' : configuredHost

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    setupFiles: ['./src/testSetup.ts'],
  },
  // Prevent Vite from clearing the terminal so Rust/Tauri errors stay visible.
  clearScreen: false,
  // Keep the hostname aligned with Tauri's devUrl so the WebView reuses the
  // same origin (and its IndexedDB) between dev sessions.
  server: {
    host: host || 'localhost',
    port: 5173,
    // Tauri expects a fixed port.
    strictPort: true,
    proxy: {
      '/api/v1/ncbi/blast': {
        target: 'https://blast.ncbi.nlm.nih.gov',
        changeOrigin: true,
        rewrite: () => '/Blast.cgi',
      },
      // GuideScan2 public API (guidescan.com/backend). Same-origin in Vite DEV / desktop webview.
      '/guidescan-api': {
        target: 'https://guidescan.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/guidescan-api/, '/backend'),
      },
      '/api': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
      },
      '/admin': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
      },
    },
    hmr: configuredHost && process.platform !== 'win32'
      ? {
          protocol: 'ws',
          host: configuredHost,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  optimizeDeps: {
    // Tauri APIs are often loaded through literal dynamic imports in windows
    // and desktop lifecycle code. Prebundle all of them before Vite serves the
    // app so the WebView cannot receive an optimized-dependency URL that is
    // invalidated by Vite's later dependency scan (504 Outdated Optimize Dep).
    include: [
      'fflate',
      'lzma-wasm',
      '@tauri-apps/api/core',
      '@tauri-apps/api/event',
      '@tauri-apps/api/menu',
      '@tauri-apps/api/path',
      '@tauri-apps/api/webview',
      '@tauri-apps/api/webviewWindow',
      '@tauri-apps/api/window',
      '@tauri-apps/plugin-clipboard-manager',
      '@tauri-apps/plugin-dialog',
      '@tauri-apps/plugin-fs',
      '@tauri-apps/plugin-opener',
    ],
  },
  build: {
    // Tauri uses WebKit on macOS/Linux and Chromium on Windows.
    target: process.env.TAURI_ENV_PLATFORM === 'windows' ? 'chrome105' : 'safari15',
  },
})
