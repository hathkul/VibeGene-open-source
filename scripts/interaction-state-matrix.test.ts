import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

type SchemeSlice = {
  varChain?: string
  solid?: string
  gradientTop?: string
  gradientBottom?: string
}

type MatrixRole = {
  role: string
  token: string
  status: 'existing' | 'proposed' | 'rejected'
  proposed?: boolean
  definition: string | null
  schemes: { beige: SchemeSlice; bright: SchemeSlice; dark: SchemeSlice }
  intendedOwners: Array<{ ledgerId: string; selector: string }>
  ownerNote?: string
  minimumLedgerOwners?: number
}

type Matrix = {
  relationships: Array<{
    left: string
    right: string
    compare: 'solid' | 'gradientBottom' | 'contrastPair'
    must: 'differ' | 'readable' | 'disabledReadable'
  }>
  roles: MatrixRole[]
}

const MATRIX_PATH = resolve(import.meta.dirname, 'interaction-state-matrix.json')
const SCHEMES = ['beige', 'bright', 'dark'] as const
const DISABLED_BORDER_SOLIDS = {
  beige: '#d3d1cc',
  bright: '#d4dde5',
  dark: '#374658',
} as const

function roleByName(matrix: Matrix, role: string): MatrixRole {
  const found = matrix.roles.find((entry) => entry.role === role)
  expect(found, `missing matrix role ${role}`).toBeDefined()
  return found!
}

function compareValue(role: MatrixRole, scheme: (typeof SCHEMES)[number], compare: Matrix['relationships'][number]['compare']): string | null {
  const slice = role.schemes[scheme]
  if (compare === 'solid') return slice.solid ?? null
  if (compare === 'gradientBottom') return slice.gradientBottom ?? slice.solid ?? null
  return slice.solid ?? null
}

function relativeLuminance(hex: string): number {
  const normalized = hex.replace('#', '')
  const channels = [0, 2, 4].map((offset) => parseInt(normalized.slice(offset, offset + 2), 16) / 255)
  const linear = channels.map((channel) => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4))
  return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!
}

function contrastRatio(a: string, b: string): number {
  const l1 = relativeLuminance(a)
  const l2 = relativeLuminance(b)
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

describe('interaction state matrix', () => {
  const matrix = JSON.parse(readFileSync(MATRIX_PATH, 'utf8')) as Matrix
  const ownerIdToRole = new Map<string, string>()

  for (const entry of matrix.roles) {
    for (const owner of entry.intendedOwners) {
      expect(ownerIdToRole.has(owner.ledgerId), `ledger id ${owner.ledgerId} assigned to multiple roles`).toBe(false)
      ownerIdToRole.set(owner.ledgerId, entry.role)
    }
  }

  it('requires scheme coverage and owner counts for existing and proposed roles', () => {
    for (const entry of matrix.roles) {
      if (entry.status === 'rejected') continue
      const minimum = entry.minimumLedgerOwners ?? 2
      if (entry.intendedOwners.length < minimum) {
        expect(entry.ownerNote?.length, `${entry.role} must explain fewer than ${minimum} ledger owners`).toBeTruthy()
      }
      if (!(entry.ownerNote && entry.intendedOwners.length === 0)) {
        expect(entry.intendedOwners.length).toBeGreaterThanOrEqual(minimum)
      }
      for (const scheme of SCHEMES) {
        const slice = entry.schemes[scheme]
        expect(slice.varChain?.length || slice.solid?.length || slice.gradientBottom?.length, `${entry.role} missing ${scheme}`).toBeTruthy()
      }
    }
  })

  it('rejects a role that claims a minimum ledger owner count but lists too few', () => {
    for (const entry of matrix.roles) {
      if (entry.minimumLedgerOwners === undefined) continue
      expect(entry.intendedOwners.length).toBeGreaterThanOrEqual(entry.minimumLedgerOwners)
    }
  })

  it('keeps state tokens distinct per scheme where required', () => {
    for (const relationship of matrix.relationships) {
      const left = roleByName(matrix, relationship.left)
      const right = roleByName(matrix, relationship.right)
      if (left.status === 'rejected' || right.status === 'rejected') continue

      for (const scheme of SCHEMES) {
        if (relationship.must === 'differ') {
          const leftValue = compareValue(left, scheme, relationship.compare)
          const rightValue = compareValue(right, scheme, relationship.compare)
          expect(leftValue, `${relationship.left} missing ${scheme} compare`).toBeTruthy()
          expect(rightValue, `${relationship.right} missing ${scheme} compare`).toBeTruthy()
          expect(leftValue).not.toBe(rightValue)
        }
        if (relationship.must === 'readable' && relationship.compare === 'contrastPair') {
          const ink = compareValue(left, scheme, 'solid')
          const surfaceRole = roleByName(matrix, relationship.right)
          const surface = compareValue(surfaceRole, scheme, 'solid')
          expect(ink).toBeTruthy()
          expect(surface).toBeTruthy()
          expect(contrastRatio(ink!, surface!)).toBeGreaterThanOrEqual(4.5)
        }
        if (relationship.must === 'disabledReadable' && relationship.compare === 'contrastPair') {
          const ink = compareValue(left, scheme, 'solid')
          const surfaceRole = roleByName(matrix, relationship.right)
          const surface = compareValue(surfaceRole, scheme, 'solid')
          expect(ink).toBeTruthy()
          expect(surface).toBeTruthy()
          expect(contrastRatio(ink!, surface!)).toBeGreaterThanOrEqual(4)
          expect(contrastRatio(compareValue(roleByName(matrix, 'controlInk'), scheme, 'solid')!, ink!)).toBeGreaterThan(1)
        }
      }
    }
  })

  it('documents disabled-border computed mixes and rejects pressed or focus-ring duplicates', () => {
    const disabledBorder = matrix.roles.find((role) => role.role === 'disabledBorder')
    expect(disabledBorder?.schemes.beige.solid).toBe(DISABLED_BORDER_SOLIDS.beige)
    expect(disabledBorder?.schemes.bright.solid).toBe(DISABLED_BORDER_SOLIDS.bright)
    expect(disabledBorder?.schemes.dark.solid).toBe(DISABLED_BORDER_SOLIDS.dark)

    expect(matrix.roles.find((role) => role.token === '--vg-focus-ring')).toBeUndefined()
    const pressed = matrix.roles.find((role) => role.role === 'controlSurfacePressed')
    expect(pressed?.status).toBe('rejected')
    expect(pressed?.proposed).toBe(false)
  })
})
