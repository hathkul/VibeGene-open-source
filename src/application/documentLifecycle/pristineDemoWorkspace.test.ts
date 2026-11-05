import { describe, expect, it } from 'vitest'
import { cloneFixture, labPlasmid } from '../../domain/fixtures'
import { isPristineDemoWorkspace, shouldOpenMenuDocumentInNewWindow } from './pristineDemoWorkspace'

describe('pristineDemoWorkspace', () => {
  it('treats the demo plasmid without disk or library folder as pristine', () => {
    expect(isPristineDemoWorkspace(labPlasmid, null, undefined)).toBe(true)
    expect(isPristineDemoWorkspace(labPlasmid, '/tmp/x.dna', undefined)).toBe(false)
    expect(isPristineDemoWorkspace(labPlasmid, null, 'folder-1')).toBe(false)
    expect(isPristineDemoWorkspace(labPlasmid, null, undefined, true)).toBe(false)
    expect(isPristineDemoWorkspace(cloneFixture(), null, undefined)).toBe(true)
  })

  it('opens menu documents in a new window only on native non-pristine workspaces', () => {
    expect(shouldOpenMenuDocumentInNewWindow(false, labPlasmid, null, undefined)).toBe(false)
    expect(shouldOpenMenuDocumentInNewWindow(true, labPlasmid, null, undefined)).toBe(false)
    expect(shouldOpenMenuDocumentInNewWindow(true, { ...labPlasmid, name: 'Other.dna' }, null, undefined)).toBe(true)
    expect(shouldOpenMenuDocumentInNewWindow(true, labPlasmid, null, undefined, true)).toBe(true)
  })
})
