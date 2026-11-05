import { useEffect, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import '../index.css'
import '../App.css'
import './theme-gallery.css'
import '../styles/theme-primitives.css'

type Scheme = 'beige' | 'bright' | 'dark'

const schemes: Array<{ id: Scheme; label: string; hint: string }> = [
  { id: 'beige', label: 'Classic', hint: 'warm desktop' },
  { id: 'bright', label: 'Bright', hint: 'white workspace' },
  { id: 'dark', label: 'Dark', hint: 'night mode' },
]

const schemeFromDocument = (): Scheme => {
  const value = document.documentElement.dataset.colorScheme
  return value === 'bright' || value === 'dark' ? value : 'beige'
}

function SchemePicker({ scheme, onChange }: { scheme: Scheme; onChange: (value: Scheme) => void }) {
  return (
    <div className="vg-gallery-scheme-picker" role="radiogroup" aria-label="Preview color scheme">
      {schemes.map((option) => (
        <button
          key={option.id}
          type="button"
          role="radio"
          aria-checked={scheme === option.id}
          className="vg-button vg-gallery-scheme-option"
          data-vg-state={scheme === option.id ? 'selected' : undefined}
          onClick={() => onChange(option.id)}
        >
          <span className={`vg-gallery-scheme-dot vg-gallery-scheme-dot-${option.id}`} aria-hidden="true" />
          <span>{option.label}</span>
          <small>{option.hint}</small>
        </button>
      ))}
    </div>
  )
}

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="vg-card vg-gallery-section">
      <div className="vg-gallery-section-heading">
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {children}
    </section>
  )
}

function Swatch({ name, token, className = '' }: { name: string; token: string; className?: string }) {
  return (
    <div className="vg-gallery-swatch-card">
      <div className={`vg-gallery-swatch ${className}`} />
      <strong>{name}</strong>
      <code>{token}</code>
    </div>
  )
}

function AnnotationPreview() {
  return (
    <div className="vg-gallery-annotation-wrap">
      <svg className="vg-gallery-annotation" viewBox="0 0 620 178" role="img" aria-label="Selected and unselected map annotations">
        <rect className="vg-svg-surface vg-gallery-map-surface" x="15" y="18" width="590" height="140" rx="18" />
        <circle className="vg-gallery-map-ring" cx="160" cy="88" r="48" />
        <path className="vg-gallery-map-feature" d="M160 40 A48 48 0 0 1 205 104 L190 106 A33 33 0 0 0 160 55Z" />
        <path className="vg-gallery-map-feature-selected" d="M160 136 A48 48 0 0 1 119 111 L132 101 A33 33 0 0 0 160 121Z" />
        <line className="vg-gallery-map-leader" x1="207" y1="62" x2="270" y2="45" />
        <line className="vg-gallery-map-leader-selected" x1="118" y1="113" x2="270" y2="130" />
        <text className="vg-svg-annotation-label vg-gallery-map-label" x="282" y="50">unselected feature</text>
        <text className="vg-svg-annotation-label is-selected vg-gallery-map-label-selected" x="282" y="136">selected feature</text>
        <text className="vg-svg-muted vg-gallery-map-subtitle" x="104" y="168">semantic SVG roles: surface · ink · selection · halo</text>
      </svg>
    </div>
  )
}

function SchematicPreview() {
  return (
    <div className="vg-gallery-schematic-grid">
      <div className="vg-diagram vg-gallery-schematic-card">
        <div className="vg-gallery-schematic-line">
          <span className="vg-diagram__inset vg-gallery-end vg-gallery-end-left">AATT</span>
          <span className="vg-gallery-schematic-backbone" />
          <span className="vg-diagram__inset vg-gallery-end vg-gallery-end-right">GGCC</span>
        </div>
        <strong>DNA ends</strong>
        <small>map ink and end labels use semantic tokens</small>
      </div>
      <div className="vg-notice--warning vg-gallery-schematic-card vg-gallery-schematic-warning">
        <strong>Partial match</strong>
        <p>Warnings preserve meaning while remaining legible in all schemes.</p>
        <span className="vg-gallery-issues">Needs review</span>
      </div>
    </div>
  )
}

function ThemeGallery() {
  const [scheme, setScheme] = useState<Scheme>(schemeFromDocument)

  useEffect(() => {
    document.documentElement.dataset.colorScheme = scheme
    document.title = `Vibegene theme gallery · ${scheme}`
  }, [scheme])

  return (
    <main className="vg-gallery-page">
      <header className="vg-gallery-header">
        <div>
          <p className="vg-gallery-eyebrow">Developer preview · visual contract</p>
          <h1>Vibegene theme gallery</h1>
          <p className="vg-gallery-lede">
            A compact audit surface for semantic colors and interactive states. Every example below should remain readable
            when the scheme changes, including SVG labels and modal layers.
          </p>
        </div>
        <SchemePicker scheme={scheme} onChange={setScheme} />
      </header>

      <div className="vg-gallery-content">
        <Section title="Semantic surfaces" description="Use roles, not literal colors, for application chrome and data panels.">
          <div className="vg-gallery-swatch-grid">
            <Swatch name="Canvas" token="--vg-surface-canvas" className="vg-swatch-canvas" />
            <Swatch name="Panel" token="--vg-surface-panel" className="vg-swatch-panel" />
            <Swatch name="Muted panel" token="--vg-surface-panel-muted" className="vg-swatch-muted" />
            <Swatch name="Field" token="--vg-surface-inset" className="vg-swatch-field" />
            <Swatch name="Button" token="--vg-control-surface" className="vg-swatch-button" />
            <Swatch name="Selection" token="--vg-interactive-selected" className="vg-swatch-selection" />
            <Swatch name="Hover" token="--vg-interactive-hover" className="vg-swatch-hover" />
            <Swatch name="Warning" token="--vg-warning-surface" className="vg-swatch-warning" />
          </div>
        </Section>

        <Section title="Controls and state matrix" description="Normal, hover, selected, and disabled states should have distinct but related treatments.">
          <div className="vg-gallery-control-grid">
            <div className="vg-gallery-control-stack">
              <button className="vg-button vg-gallery-button" type="button">Normal button</button>
              <button className="vg-button vg-gallery-button is-hovered" type="button">Hover preview</button>
              <button className="vg-button vg-gallery-button" data-vg-state="selected" type="button">Selected button</button>
              <button className="vg-button vg-gallery-button" type="button" disabled>Disabled button</button>
              <div className="vg-gallery-compact-controls">
                <button className="feature-visibility-menu-trigger vg-gallery-visibility-action" type="button">Check all</button>
                <div className="enzyme-position-mode-toggle vg-gallery-segmented" role="tablist" aria-label="Position display preview">
                  <button className="is-active" role="tab" aria-selected="true" type="button">Numbers</button>
                  <button role="tab" aria-selected="false" type="button">Lines</button>
                </div>
                <svg className="enzyme-site-minimap vg-gallery-data-minimap" viewBox="0 0 180 20" aria-label="Position line preview">
                  <rect className="enzyme-site-minimap-track vg-gallery-data-track" x="0" y="5" width="180" height="10" />
                  {[18, 47, 86, 121, 157].map((x) => (
                    <line key={x} className={x === 86 ? 'enzyme-site-minimap-line vg-gallery-data-mark is-selected' : 'enzyme-site-minimap-line vg-gallery-data-mark'} x1={x} x2={x} y1="0" y2="20" />
                  ))}
                </svg>
              </div>
            </div>
            <div className="vg-gallery-form-stack">
              <label>Sequence name<input className="vg-field" defaultValue="pVibe-001" /></label>
              <label>Display mode<select className="vg-field" defaultValue="map"><option value="map">Map view</option><option value="sequence">Sequence view</option></select></label>
              <label className="vg-gallery-check"><input type="checkbox" defaultChecked /> Show labels</label>
            </div>
          </div>
        </Section>

        <Section title="Cards, chips, and selectable rows" description="Shared primitives should carry their own surface, border, text, and focus semantics.">
          <div className="vg-gallery-card-grid">
            <article className="vg-card vg-gallery-card">
              <div className="vg-gallery-card-header"><strong>Construct card</strong><span className="vg-chip vg-gallery-chip">library</span></div>
              <p>Panel content inherits the active scheme instead of baking in beige or white.</p>
              <div className="vg-gallery-chip-row"><span className="vg-chip vg-gallery-chip">neutral</span><span className="vg-chip vg-gallery-chip is-selected">selected</span><span className="vg-chip vg-gallery-chip" data-vg-tone="warning">warning</span></div>
            </article>
            <div className="vg-gallery-row-stack">
              <button className="vg-selectable-row vg-gallery-row" type="button">Unselected row <span>15,265 bp</span></button>
              <button className="vg-selectable-row vg-gallery-row is-hovered" type="button">Hover row <span>15,265 bp</span></button>
              <button className="vg-selectable-row vg-gallery-row" data-vg-state="selected" type="button">Selected row <span>15,265 bp</span></button>
              <button className="vg-selectable-row vg-gallery-row" type="button" disabled>Disabled row <span>unavailable</span></button>
            </div>
          </div>
        </Section>

        <Section title="Dialog and modal tint" description="The same roles need to survive a tinted overlay and a raised dialog surface.">
          <div className="vg-gallery-modal-stage">
            <div className="vg-gallery-modal-overlay" aria-hidden="true" />
            <article className="vg-dialog vg-gallery-dialog">
              <div className="vg-dialog__header vg-gallery-dialog-header"><strong>Feature properties</strong><button className="vg-button" type="button" aria-label="Close">×</button></div>
              <p>Dialog text, fields, and actions stay legible over the overlay.</p>
              <div className="vg-dialog__footer vg-gallery-dialog-actions"><button className="vg-button vg-gallery-button" type="button">Cancel</button><button className="vg-button vg-gallery-button" data-vg-state="selected" type="button">Save</button></div>
            </article>
          </div>
        </Section>

        <Section title="SVG annotation labels" description="SVG must use explicit fill, stroke, and halo roles; inherited color alone is not enough.">
          <AnnotationPreview />
        </Section>

        <Section title="Schematic and DNA-end panels" description="Cloning diagrams, end sequences, and warnings share the same semantic surface contract.">
          <SchematicPreview />
        </Section>
      </div>

      <footer className="vg-gallery-footer">
        <code>Developer-only entry: /theme-gallery.html</code>
        <span>Active scheme: {scheme}</span>
      </footer>
    </main>
  )
}

type ThemeGalleryRootElement = HTMLElement & { __vgThemeGalleryRoot?: Root }

const rootElement = document.getElementById('theme-gallery-root') as ThemeGalleryRootElement
const root = rootElement.__vgThemeGalleryRoot ?? createRoot(rootElement)
rootElement.__vgThemeGalleryRoot = root
root.render(<ThemeGallery />)

export default ThemeGallery
