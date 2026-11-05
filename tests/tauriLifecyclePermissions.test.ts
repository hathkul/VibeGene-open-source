import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

function readRepoFile(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
}

describe('Tauri native exit-sync command permissions', () => {
  it('grants the capability every lifecycle command invoked by the sync coordinator', () => {
    const lifecycleSources = [
      readRepoFile('../src/desktop/syncOnExit.ts'),
      readRepoFile('../src/StartupWindow.tsx'),
    ]
    const invokedCommands = lifecycleSources.flatMap((source) =>
      [...source.matchAll(/invoke(?:<[^>]+>)?\(\s*['"]([^'"]+)['"]/g)]
      .map((match) => match[1]!)
    )
    const permission = readRepoFile('../src-tauri/permissions/exit-sync.toml')
    const allowedBlock = permission.match(/commands\.allow\s*=\s*\[([\s\S]*?)\]/)?.[1] ?? ''
    const allowedCommands = [...allowedBlock.matchAll(/"([a-z0-9_]+)"/g)].map((match) => match[1]!)
    const capability = JSON.parse(readRepoFile('../src-tauri/capabilities/default.json')) as {
      permissions: string[]
    }

    expect(invokedCommands).toEqual(expect.arrayContaining([
      'exit_sync_revision',
      'acquire_exit_sync_lock',
      'document_open_launch_active',
      'refresh_exit_sync_lock',
      'release_exit_sync_lock',
      'mark_exit_sync_complete',
      'quit_app',
    ]))
    expect(allowedCommands).toEqual(expect.arrayContaining(invokedCommands))
    expect(capability.permissions).toContain('allow-exit-sync-lifecycle')
  })
})
