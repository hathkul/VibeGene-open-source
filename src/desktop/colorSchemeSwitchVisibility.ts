import type { HybridWindowKind } from './hybridWindows'

/** The scheme control belongs to document workspaces, including the Database workspace. */
export function shouldShowColorSchemeSwitch(kind: HybridWindowKind | null): boolean {
  return kind === null || kind === 'database'
}
