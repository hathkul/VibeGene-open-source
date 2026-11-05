import { describe, expect, it } from 'vitest'
import { scanSource } from './check-theme-colors.ts'

describe('theme color guardrail', () => {
  it('flags literal UI chrome colours in CSS', () => {
    const findings = scanSource('src/example.css', '.button { background: #ffffff; color: #111; border: 1px solid #ccc; }')
    expect(findings.map((finding) => finding.property).sort()).toEqual(['background', 'border', 'color'])
  })

  it('ignores custom property definitions and CSS-wide values', () => {
    const findings = scanSource('src/example.css', ':root { --app-panel: #ffffff; } .button { color: currentColor; background: transparent; }')
    expect(findings).toEqual([])
  })

  it('does not treat semantic custom-property names as color literals', () => {
    const findings = scanSource('src/example.css', '.button { color: var(--startup-icon-purple-ink); background: var(--missing-surface, purple); box-shadow: 0 0 var(--shadow-size) purple; }', 'raw')
    expect(findings).toHaveLength(2)
    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ property: 'background', literal: 'purple' }),
      expect.objectContaining({ property: 'box-shadow', literal: 'purple' }),
    ]))
  })

  it('raw inventory records scientific palettes; enforced flags unregistered literals', () => {
    const source = `
      <path className="feature-track" fill="#7c3aed" />
      <rect style={{ stroke: '#111' }} />
      <div style={{ backgroundColor: '#fff' }} />
      <span style={{ color: feature.color }} />
    `
    const raw = scanSource('src/example.tsx', source, 'raw')
    expect(raw.some((finding) => finding.property === 'fill' && finding.literal === '#7c3aed')).toBe(true)
    const enforced = scanSource('src/example.tsx', source, 'enforced')
    expect(enforced.map((finding) => finding.property).sort()).toEqual(['backgroundColor', 'fill', 'stroke'])
  })

  it('does not treat review marker comments as exemptions', () => {
    const source = '/* theme-color-ignore: biological legend */ .legend { color: #2563eb; }'
    expect(scanSource('src/example.css', source, 'enforced')).toHaveLength(1)
    expect(scanSource('src/example.css', source, 'raw')).toHaveLength(1)
  })

  it('refuses --update-baseline in every mode', async () => {
    const { run } = await import('./check-theme-colors.ts')
    expect(await run(['--update-baseline'])).toBe(1)
    expect(await run(['--raw', '--update-baseline'])).toBe(1)
  }, 30_000)

  it('offers a raw inventory that records literals even near review markers', () => {
    const source = '/* theme-color-ignore: biological legend */ .legend { color: #2563eb; }'
    const [finding] = scanSource('src/example.css', source, 'raw')
    expect(finding).toMatchObject({ file: 'src/example.css', property: 'color', literal: '#2563eb' })
    expect(finding.locator.owner).toBe('.legend')
    expect(finding.locator.anchor).toMatch(/^[0-9a-f]{16}$/)
  })

  it('uses structural CSS ownership across formatting and nested at-rules', () => {
    const oneLine = scanSource('src/example.css', '.button { color: #111; }', 'raw')[0]!
    const multiLine = scanSource('src/example.css', '.button {\n  color: #111;\n}', 'raw')[0]!
    const nested = scanSource('src/example.css', '@media (max-width: 600px) { .button { color: #111; } }', 'raw')[0]!
    expect(multiLine.id).toBe(oneLine.id)
    expect(nested.locator.owner).toBe('@media (max-width: 600px) > .button')
    expect(nested.id).not.toBe(oneLine.id)
  })

  it('uses enclosing object/JSX owners and distinct duplicate occurrences', () => {
    const findings = scanSource('src/example.tsx', `
      const first = { color: '#111', border: '1px solid #222' }
      const second = { color: '#111' }
      export function Preview() { return <path stroke="#333" fill="#444" /> }
    `, 'raw')
    expect(findings.filter((finding) => finding.property === 'color')).toHaveLength(2)
    expect(findings.filter((finding) => finding.property === 'color')[0]?.locator.owner).toBe('object:first.color')
    expect(findings.filter((finding) => finding.property === 'color')[1]?.locator.owner).toBe('object:second.color')
    expect(findings.find((finding) => finding.property === 'border')?.literal).toBe('#222')
    expect(findings.find((finding) => finding.property === 'stroke')?.locator.owner).toBe('jsx:path')
  })
})
