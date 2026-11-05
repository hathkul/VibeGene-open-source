import type { DatabaseManagerConstructPickContext } from '../presentation/pickContext'

export type ConstructPickAddRoute =
  | { kind: 'add-multiple' }
  | { kind: 'add-single'; projectId: string }
  | { kind: 'noop' }

export function routeConstructPickAdd(input: {
  constructPick: DatabaseManagerConstructPickContext | null
  selectedProjectIds: readonly string[]
}): ConstructPickAddRoute {
  if (!input.constructPick || input.selectedProjectIds.length < 1) return { kind: 'noop' }
  if (input.constructPick.multiple) return { kind: 'add-multiple' }
  const projectId = input.selectedProjectIds[0]
  return projectId ? { kind: 'add-single', projectId } : { kind: 'noop' }
}

export function routeProjectDoubleClick(input: {
  constructPick: DatabaseManagerConstructPickContext | null
  libraryMemberPickActive: boolean
}): 'blocked' | 'add-construct' | 'open-project' {
  if (input.constructPick?.multiple || input.libraryMemberPickActive) return 'blocked'
  if (input.constructPick) return 'add-construct'
  return 'open-project'
}

export function routeProjectPrimaryAction(input: {
  constructPick: DatabaseManagerConstructPickContext | null
}): 'add-construct' | 'open-project' {
  return input.constructPick ? 'add-construct' : 'open-project'
}
