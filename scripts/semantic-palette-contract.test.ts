import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

type SchemeValue = { varChain?: string; solid?: string; gradientBottom?: string }
type ContractToken = {
  token: string
  role: string
  status: 'existing' | 'proposed'
  category: string
  notSingleShadeAlias: string
  permittedUses: string[]
  prohibitedUses: string[]
  schemes: Record<'beige' | 'bright' | 'dark', SchemeValue>
}

type PaletteContract = {
  schemes: string[]
  relationships: Array<{ left: string; right: string; must?: string; minimumRatio?: number }>
  permittedUsesDefault: string[]
  prohibitedUsesDefault: string[]
  tokens: ContractToken[]
}

const CONTRACT_PATH = resolve(import.meta.dirname, 'semantic-palette-contract.json')

function schemeHasValue(scheme: SchemeValue): boolean {
  return Boolean(
    (scheme.varChain && scheme.varChain.trim().length > 0) ||
      (scheme.solid && scheme.solid.trim().length > 0) ||
      (scheme.gradientBottom && scheme.gradientBottom.trim().length > 0),
  )
}

function schemeHasContrastRole(token: ContractToken): boolean {
  if (token.role.startsWith('feedback') && token.role.endsWith('Ink')) {
    return !token.schemes.beige.varChain?.includes('var(--text)')
  }
  return true
}

describe('semantic palette contract', () => {
  const contract = JSON.parse(readFileSync(CONTRACT_PATH, 'utf8')) as PaletteContract
  const roles = new Set(contract.tokens.map((token) => token.role))

  it('declares beige, bright, and dark values for every token', () => {
    expect(contract.schemes).toEqual(['beige', 'bright', 'dark'])
    for (const token of contract.tokens) {
      for (const scheme of contract.schemes) {
        expect(schemeHasValue(token.schemes[scheme as 'beige']), `${token.token} missing ${scheme}`).toBe(true)
      }
      expect(token.notSingleShadeAlias.length).toBeGreaterThan(10)
      expect(token.permittedUses.length).toBeGreaterThan(0)
      expect(token.prohibitedUses.length).toBeGreaterThan(0)
      expect(token.token.startsWith('--vg-')).toBe(true)
      expect(schemeHasContrastRole(token), `${token.token} must not alias body text`).toBe(true)
    }
  })

  it('declares contrast and state relationships with known roles', () => {
    expect(contract.permittedUsesDefault.length).toBeGreaterThan(0)
    expect(contract.prohibitedUsesDefault.length).toBeGreaterThan(0)
    expect(contract.relationships.length).toBeGreaterThanOrEqual(10)
    for (const rel of contract.relationships) {
      expect(roles.has(rel.left), `unknown role ${rel.left}`).toBe(true)
      expect(roles.has(rel.right), `unknown role ${rel.right}`).toBe(true)
    }
  })
})
