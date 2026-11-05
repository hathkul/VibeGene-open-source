import { WHATS_NEW_VERSION } from './whatsNew'

// Windows builds are published separately from the web/macOS release.
const WINDOWS_DESKTOP_VERSION = '1.7.2'

/** Standalone app installers served from /downloads on the web app. */
export const DESKTOP_DOWNLOADS = [
  {
    id: 'mac',
    label: 'macOS Apple silicon (.dmg)',
    href: `/downloads/VibeGene_${WHATS_NEW_VERSION}_aarch64.dmg`,
  },
  {
    id: 'windows-setup',
    label: `Windows x64 installer, v${WINDOWS_DESKTOP_VERSION} (.exe)`,
    href: `/downloads/VibeGene_${WINDOWS_DESKTOP_VERSION}_x64-setup.exe`,
  },
  {
    id: 'windows-portable',
    label: `Windows x64 portable, v${WINDOWS_DESKTOP_VERSION} (.exe)`,
    href: `/downloads/VibeGene_${WINDOWS_DESKTOP_VERSION}_x64-portable.exe`,
  },
  {
    id: 'linux-amd64-appimage',
    label: 'Linux AMD64 (.AppImage)',
    href: `/downloads/VibeGene_${WHATS_NEW_VERSION}_amd64.AppImage`,
  },
  {
    id: 'linux-amd64-deb',
    label: 'Linux AMD64 Debian / Ubuntu (.deb)',
    href: `/downloads/VibeGene_${WHATS_NEW_VERSION}_amd64.deb`,
  },
  {
    id: 'linux-arm64-appimage',
    label: 'Linux ARM64 (.AppImage)',
    href: `/downloads/VibeGene_${WHATS_NEW_VERSION}_aarch64.AppImage`,
  },
  {
    id: 'linux-arm64-deb',
    label: 'Linux ARM64 Debian / Ubuntu (.deb)',
    href: `/downloads/VibeGene_${WHATS_NEW_VERSION}_arm64.deb`,
  },
] as const
