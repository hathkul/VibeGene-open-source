type AlignmentPick = { mode: 'dna' | 'protein' } | null | undefined
type ConstructPick = { multiple?: boolean; topology?: string | null } | null | undefined

export function databaseManagerWorkflowHeaderStatus(
  alignmentPick: AlignmentPick,
  constructPick: ConstructPick,
  libraryMemberPick: unknown,
): string | null {
  if (alignmentPick) {
    return alignmentPick.mode === 'dna'
      ? 'Select DNA constructs, then Add to alignment.'
      : 'Select constructs or proteins, then Add to alignment.'
  }
  if (constructPick) {
    return constructPick.topology
      ? `Select ${constructPick.multiple ? 'one or more' : 'one'} ${constructPick.topology} DNA construct${constructPick.multiple ? 's' : ''}, then Add to cloning.`
      : `Select ${constructPick.multiple ? 'one or more' : 'one'} DNA construct${constructPick.multiple ? 's' : ''}, then Add to cloning.`
  }
  return libraryMemberPick ? 'Select one or more DNA constructs, then Add.' : null
}
