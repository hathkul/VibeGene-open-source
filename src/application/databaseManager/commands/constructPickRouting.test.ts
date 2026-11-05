import { describe, expect, it } from 'vitest'
import {
  routeConstructPickAdd,
  routeProjectDoubleClick,
  routeProjectPrimaryAction,
} from './constructPickRouting'

describe('construct pick routing', () => {
  it('routes single vs multiple add', () => {
    expect(
      routeConstructPickAdd({ constructPick: { multiple: true }, selectedProjectIds: ['a', 'b'] }),
    ).toEqual({ kind: 'add-multiple' })
    expect(
      routeConstructPickAdd({ constructPick: null, selectedProjectIds: ['a'] }),
    ).toEqual({ kind: 'noop' })
    expect(
      routeConstructPickAdd({ constructPick: {}, selectedProjectIds: ['a'] }),
    ).toEqual({ kind: 'add-single', projectId: 'a' })
  })

  it('routes double-click and primary actions', () => {
    expect(
      routeProjectDoubleClick({ constructPick: { multiple: true }, libraryMemberPickActive: false }),
    ).toBe('blocked')
    expect(routeProjectDoubleClick({ constructPick: {}, libraryMemberPickActive: false })).toBe(
      'add-construct',
    )
    expect(routeProjectPrimaryAction({ constructPick: null })).toBe('open-project')
  })
})
