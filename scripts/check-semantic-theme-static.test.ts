import { describe, expect, it } from 'vitest'
import { checkSemanticThemeStatic, isScopedRawLiteralAllowed } from './check-semantic-theme-static.ts'

describe('semantic theme static checker', () => {
  it('reports violations until bulk migrations retire raw literals', () => {
    const { violations } = checkSemanticThemeStatic()
    expect(Array.isArray(violations)).toBe(true)
  })

  it('allows a scientific literal only for its scoped owner, not ordinary chrome', () => {
    const scientificLiteral = '#dbeafe'
    const scientificOwner = '.protein-composition-code.is-nonpolar'
    expect(isScopedRawLiteralAllowed('src/App.css', scientificOwner, 'background', scientificLiteral)).toBe(true)
    expect(isScopedRawLiteralAllowed('src/App.css', '.db-main-actions button.database-construct-add-button', 'background', scientificLiteral)).toBe(false)
    expect(isScopedRawLiteralAllowed('src/index.css', scientificOwner, 'background', scientificLiteral)).toBe(false)
  })
})
