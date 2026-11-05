import { describe, expect, it } from 'vitest'
import { canonicalizeMessage, findingId } from './check-eslint-baseline.mjs'

const firstCodeFrame = `Error: Cannot access refs during render

React refs should only be accessed outside render.

/Users/example/VibeGene/src/App.tsx:3657:3
  3656 | const ref = useRef(value)
> 3657 | ref.current = value
       | ^^^^^^^^^^^ Cannot update ref during render
  3658 | return ref`

const movedCodeFrame = `Error: Cannot access refs during render

React refs should only be accessed outside render.

/Users/example/VibeGene/src/App.tsx:4120:3
  4119 | const ref = useRef(value)
> 4120 | ref.current = value
       | ^^^^^^^^^^^ Cannot update ref during render
  4121 | return ref`

const firstInlineHookLocation = 'React Hook "useMemo" is called conditionally. React Hooks must be called in the exact same order in every component render. (at line 26711)'
const movedInlineHookLocation = 'React Hook "useMemo" is called conditionally. React Hooks must be called in the exact same order in every component render. (at line 28104)'

function fingerprint(message: string, source = 'ref.current = value') {
  return findingId({
    file: 'src/App.tsx',
    ruleId: 'react-hooks/refs',
    messageId: '',
    message,
    severity: 2,
    source,
    occurrence: 0,
  })
}

describe('ESLint baseline fingerprints', () => {
  it('ignores line-only changes in appended diagnostic code frames', () => {
    expect(canonicalizeMessage(firstCodeFrame)).toBe('Error: Cannot access refs during render\n\nReact refs should only be accessed outside render.')
    expect(fingerprint(movedCodeFrame)).toBe(fingerprint(firstCodeFrame))
  })

  it('ignores line-only changes in inline React Hooks locations', () => {
    expect(canonicalizeMessage(firstInlineHookLocation)).toBe('React Hook "useMemo" is called conditionally. React Hooks must be called in the exact same order in every component render.')
    expect(fingerprint(movedInlineHookLocation)).toBe(fingerprint(firstInlineHookLocation))
  })

  it('keeps a genuinely new rule message or source line outside the baseline', () => {
    const baseline = new Set([fingerprint(firstCodeFrame)])
    expect(baseline.has(fingerprint(firstCodeFrame, 'otherRef.current = value'))).toBe(false)
    expect(baseline.has(fingerprint('Error: Cannot read refs during render\n\nReact refs should only be accessed outside render.'))).toBe(false)
  })
})
