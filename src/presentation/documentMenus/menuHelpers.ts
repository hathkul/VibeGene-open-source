import type { RecentFileEntry } from '../../application/ports/recentFiles'

export function recentFileDetail(entry: RecentFileEntry) {
  if (entry.kind === 'database') return 'Database'
  const parts = entry.path.split(/[/\\]/)
  return parts.length > 1 ? parts[parts.length - 2] : entry.path
}
