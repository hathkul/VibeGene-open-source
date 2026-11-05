import { createRoot } from 'react-dom/client'
import '../index.css'
import '../App.css'
import '../styles/theme-primitives.css'
import '../StartupWindow.css'
import '../TraceViewer.css'
import './ThemeAudit.css'

export function Icon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3 4 8v8l8 5 8-5V8l-8-5Z" fill="currentColor" />
    </svg>
  )
}

export function ThemeAudit() {
  return (
    <main className="theme-audit-page">
      <section className="theme-audit-toolbar-shell" aria-label="Toolbar and nested menu audit">
        <div className="toolbar theme-audit-toolbar">
          <div className="tool-group mobile-menu-open">
            <button type="button">Open</button>
            <div className="toolbar-edit-menu menu-open">
              <button className="toolbar-edit-trigger" type="button">Edit</button>
              <div className="toolbar-edit-dropdown">
                <button className="toolbar-edit-item" type="button">Undo</button>
                <button className="toolbar-edit-item" type="button" disabled>Disabled action</button>
                <div className="toolbar-edit-submenu is-submenu-open">
                  <button className="toolbar-edit-item toolbar-edit-submenu-trigger" type="button">More options <span className="toolbar-edit-submenu-arrow">›</span></button>
                  <div className="toolbar-edit-submenu-panel">
                    <button className="toolbar-edit-item" type="button">Nested option</button>
                    <button className="toolbar-edit-item" type="button">Another option</button>
                  </div>
                </div>
              </div>
            </div>
            <button type="button" className="theme-audit-toolbar-focus">Focused control</button>
          </div>
        </div>
      </section>

      <section className="theme-audit-saturated-controls" aria-label="Saturated control audit">
        <div className="db-main-actions">
          <button type="button" className="database-construct-add-button" data-testid="theme-audit-primary-inverse">
            Add construct
          </button>
          <button type="button" className="database-construct-add-button" disabled data-testid="theme-audit-primary-disabled">
            Add construct
          </button>
        </div>
        <div className="protein-annotation-search-settings">
          <button type="button" className="protein-uniprot-search-button" data-testid="theme-audit-uniprot-primary">
            Search UniProt
          </button>
          <button type="button" className="protein-uniprot-search-button is-cancel" data-testid="theme-audit-uniprot-destructive">
            Cancel
          </button>
        </div>
        <div className="translation-actions">
          <button type="button" className="primary" data-testid="theme-audit-translation-primary">
            Translate
          </button>
        </div>
        <div className="sgrna-dialog-actions" role="dialog" aria-label="sgRNA actions">
          <button type="button">Back</button>
          <button type="button" data-testid="theme-audit-affirmative">
            Add selected
          </button>
        </div>
        <div className="enzyme-position-mode-toggle" data-testid="theme-audit-segment-toggle">
          <button type="button">Numbers</button>
          <button type="button" className="is-active">
            Lines
          </button>
        </div>
      </section>

      <section className="theme-audit-controls" aria-label="Form control audit">
        <label>Text input<input data-testid="text-input" defaultValue="Sequence" /></label>
        <label>Disabled input<input className="new-dna-ns-input" data-testid="disabled-input" disabled defaultValue="Unavailable" /></label>
        <label>Select<select data-testid="select"><option>Beige</option><option>Bright</option><option>Dark</option></select></label>
        <label>Search<textarea data-testid="textarea" defaultValue="ATGC" /></label>
        <label className="theme-audit-choice preferences-option"><input data-testid="checked-checkbox" type="checkbox" defaultChecked /><span>Checked</span></label>
        <label className="theme-audit-choice preferences-option"><input data-testid="disabled-checkbox" type="checkbox" disabled /><span>Disabled</span></label>
        <label className="theme-audit-choice new-dna-radio"><input data-testid="checked-radio" type="radio" name="audit-radio" defaultChecked /> <span>Radio</span></label>
      </section>

      <section className="theme-audit-table-lists" aria-label="Table and list surface audit">
        <div className="sequence-database-result-list" role="listbox" aria-label="Sequence results">
          <button data-testid="theme-audit-sequence-row" type="button">
            <span className="sequence-database-result-title"><code>demo-sequence</code><span>DNA</span></span>
          </button>
          <button className="is-selected" type="button">Selected sequence</button>
        </div>
        <div className="enzyme-preferences-supplier-list" role="listbox" aria-label="Enzyme suppliers">
          <button data-testid="theme-audit-supplier-list-row" type="button">Supplier A</button>
          <button type="button">Supplier B</button>
        </div>
        <div className="enzyme-list-box" role="listbox" aria-label="Enzyme list">
          <button data-testid="theme-audit-enzyme-row" type="button">EcoRI</button>
          <button className="is-selected" data-testid="theme-audit-enzyme-selected" type="button">BamHI</button>
        </div>
        <div className="common-features-browse-sidebar" aria-label="Common feature list">
          <button className="common-features-browse-item" data-testid="theme-audit-common-row" type="button">Promoter</button>
          <button className="common-features-browse-item is-selected" data-testid="theme-audit-common-selected" type="button">Terminator</button>
        </div>
        <table className="data-table" data-testid="theme-audit-data-table">
          <thead><tr><th>Feature</th><th>Length</th></tr></thead>
          <tbody><tr data-testid="theme-audit-table-row"><td>Promoter</td><td>120 bp</td></tr><tr className="selected-row" data-testid="theme-audit-table-selected"><td>Terminator</td><td>80 bp</td></tr></tbody>
        </table>
        <div className="db-table-pagination" data-testid="theme-audit-db-pagination">
          <button type="button">Previous</button><strong>Page 1 of 3</strong><button data-testid="theme-audit-db-next" type="button">Next</button>
        </div>
        <div className="db-file-list" data-testid="theme-audit-db-file-list" aria-label="Database files">
          <div>demo-plasmid.vgb</div>
          <div>sample-sequence.vgb</div>
        </div>
      </section>

      <section className="theme-audit-shadow-tranche" aria-label="Cascade shadow tranche audit">
        <div className="tab-bar" aria-label="Tab bar audit">
          <button data-testid="theme-audit-normal-tab" type="button">Normal tab</button>
          <button className="active" data-testid="theme-audit-active-tab" type="button">Active tab</button>
        </div>
        <div className="preferences-tabs" aria-label="Preferences tabs">
          <button className="is-active" data-testid="theme-audit-preferences-active" type="button">Preferences</button>
        </div>
        <div className="database-exit-sync-dialog" data-testid="theme-audit-sync-dialog">
          <strong>Database sync</strong>
          <div className="database-exit-sync-status" data-testid="theme-audit-sync-status">Changed records</div>
          <small>Review before leaving</small>
        </div>
        <div className="new-dna-status is-error" data-testid="theme-audit-new-dna-error">Unable to create record</div>
        <div className="feature-visibility-menu" data-testid="theme-audit-feature-menu">
          <button data-testid="theme-audit-feature-menu-item" type="button">Show feature</button>
        </div>
        <div className="database-history-batch-records">
          <div className="is-changed" data-testid="theme-audit-history-changed">Changed batch</div>
        </div>
        <div className="database-history-batch-success" data-testid="theme-audit-history-success">Sync complete</div>
        <div className="cloning-preview-view-tabs">
          <button className="is-active" data-testid="theme-audit-cloning-active" type="button">Overview</button>
        </div>
        <div className="restriction-cloning-status is-ready" data-testid="theme-audit-restriction-ready">Ready</div>
        <div className="restriction-cloning-status is-invalid" data-testid="theme-audit-restriction-invalid">Invalid input</div>
        <div className="db-drop-overlay" data-testid="theme-audit-db-drop">Drop records to import</div>
        <div className="theme-audit-grok-shadow-retire" aria-label="Grok shadow-retire cascade audit">
          <div className="pcr-recipe-dialog">
            <p className="pcr-recipe-note" data-testid="theme-audit-pcr-recipe-note">
              PCR recipe note
            </p>
          </div>
          <div className="pcr-primer-panel">
            <div className="pcr-primer-panel-tabs" role="tablist" aria-label="PCR primer panel tabs">
              <button type="button" data-testid="theme-audit-pcr-primer-tab">
                Primers
              </button>
              <button type="button" className="active" data-testid="theme-audit-pcr-primer-tab-active">
                Active
              </button>
            </div>
          </div>
          <div className="agarose-gel-dialog">
            <div className="agarose-gel-controls" data-testid="theme-audit-agarose-gel-controls">
              Gel controls
            </div>
            <div className="agarose-gel-footer-dropdown">
              <div
                className="agarose-gel-footer-dropdown-divider"
                data-testid="theme-audit-agarose-footer-divider"
              />
            </div>
          </div>
        </div>
        <div className="theme-audit-semantic-convergence" aria-label="Semantic palette convergence audit">
          <div className="sequence-database-import-dialog">
            <div className="sequence-database-import-options" data-testid="theme-audit-import-options">
              Import options
            </div>
            <div className="sequence-database-ncbi-scope" data-testid="theme-audit-ncbi-scope">
              <button type="button" className="is-active">
                NCBI
              </button>
            </div>
          </div>
          <p className="combine-library-reads-hint" data-testid="theme-audit-reads-hint">
            Import summary hint
          </p>
          <div className="features-toolbar">
            <button type="button" data-testid="theme-audit-features-toolbar-button">
              Feature action
            </button>
          </div>
          <div className="compact-scientific-dialog" data-testid="theme-audit-compact-dialog">
            <label className="compact-field">
              Label
              <input type="text" defaultValue="ATGC" data-testid="theme-audit-compact-input" />
            </label>
          </div>
          <div className="theme-audit-locked-neutral-chrome" aria-label="Locked neutral text and chrome audit">
            <div className="common-feature-view-pane" data-testid="theme-audit-locked-panel">
              <label className="db-text-prompt-label" data-testid="theme-audit-locked-body-text">
                Database prompt label
              </label>
              <div className="features-import-step" data-testid="theme-audit-locked-strong">
                <h4>Import step</h4>
              </div>
              <p className="combine-library-reads-hint" data-testid="theme-audit-locked-muted">
                Locked muted explanatory copy
              </p>
            </div>
            <div className="enzyme-info-list-filter">
              <select data-testid="theme-audit-locked-inset" defaultValue="EcoRI">
                <option>EcoRI</option>
              </select>
            </div>
          </div>
        </div>
      </section>

      <section className="theme-audit-startup-host" aria-label="Startup window audit">
        <div className="startup-window">
          <div className="startup-ambient startup-ambient-one" aria-hidden="true" />
          <div className="startup-ambient startup-ambient-two" aria-hidden="true" />
          <div className="startup-header">
            <strong>VibeGene</strong>
            <p>Static startup surface for theme verification</p>
          </div>
          <div className="startup-content">
            <div className="startup-actions">
              <button className="startup-action-card" data-testid="startup-action" type="button">
                <span className="startup-icon startup-icon-purple"><Icon /></span>
                <span><strong>Open construct</strong><small>Choose a sequence file</small></span>
                <span aria-hidden="true">›</span>
              </button>
              <div className="startup-list-card startup-new-card">
                <div className="startup-card-heading"><span className="startup-icon startup-icon-blue"><Icon /></span><div><h2>New record</h2><p>Start a new sequence workspace</p></div></div>
                <div className="startup-new-options">
                  <button data-testid="startup-option" type="button"><span className="startup-icon startup-icon-teal"><Icon /></span><span><strong>DNA</strong><small>DNA molecule</small></span></button>
                  <button type="button"><span className="startup-icon startup-icon-amber"><Icon /></span><span><strong>Protein</strong><small>Protein sequence</small></span></button>
                </div>
              </div>
              <div className="startup-list-card startup-tools-card">
                <div className="startup-card-heading"><span className="startup-icon startup-icon-slate"><Icon /></span><div><h2>Category palette</h2><p>Semantic startup controls</p></div></div>
                <div className="theme-audit-category-row">
                  <span className="startup-icon startup-icon-purple"><Icon /></span><span className="startup-icon startup-icon-blue"><Icon /></span><span className="startup-icon startup-icon-teal"><Icon /></span><span className="startup-icon startup-icon-amber"><Icon /></span><span className="startup-icon startup-icon-slate"><Icon /></span><span className="startup-icon startup-icon-rose"><Icon /></span>
                </div>
              </div>
            </div>
            <div className="startup-lists">
              <div className="startup-list-card">
                <div className="startup-list-heading"><span className="startup-icon startup-icon-teal"><Icon /></span><div><h2>Recent files</h2><p>Recent and database records</p></div></div>
                <div className="startup-list-scroll">
                  <button className="startup-file-row" type="button"><span className="startup-molecule-dot" /><span className="startup-file-copy"><strong>demo-plasmid.vgb</strong><small>Edited today</small></span><time>12:30</time></button>
                  <button className="startup-file-row" type="button"><span className="startup-molecule-dot protein" /><span className="startup-file-copy"><strong>protein-record.vgb</strong><small>Edited yesterday</small></span><time>09:15</time></button>
                  <div className="startup-draft-row"><button className="startup-file-row" type="button"><span className="startup-source-badge">FILE</span><span className="startup-file-copy"><strong>Draft construct</strong><small>Unsaved workspace</small></span></button><button className="startup-draft-delete" data-testid="startup-delete" type="button" aria-label="Delete draft">×</button></div>
                  <button className="startup-file-row" type="button"><span className="startup-source-badge database">DB</span><span className="startup-file-copy"><strong>Database entry</strong><small>Stored sample</small></span></button>
                  <div className="startup-empty">No more recent files</div>
                </div>
              </div>
              <div className="startup-drop-overlay" data-testid="startup-drop-target"><span><Icon /><strong>Drop files here</strong><small>Import a sequence or construct</small></span></div>
            </div>
          </div>
          <div className="startup-footer"><span>VibeGene theme audit</span><span className="startup-status">Ready</span></div>
          <div className="translation-dialog-backdrop">
            <div className="new-dna-dialog" role="dialog" aria-label="Hybrid modal">
              <h2>New DNA</h2><p>Modal surface and border audit.</p><button type="button">Cancel</button>
            </div>
          </div>
        </div>
      </section>

      <section className="theme-audit-compound-effects" aria-label="Compound paint audit">
        <div className="agarose-gel-dialog">
          <div className="agarose-gel-footer-right theme-audit-agarose-footer">
            <button type="button" data-testid="theme-audit-generic-control-surface">
              Export gel
            </button>
            <div className="agarose-gel-footer-dropdown" data-testid="theme-audit-panel-shadow">
              <button type="button">Save PNG</button>
            </div>
          </div>
        </div>
        <div className="protein-comparison-pane" data-testid="theme-audit-frameshift-pane">
          <div className="protein-comparison-cell is-frameshift" data-testid="theme-audit-frameshift-cell">
            F
          </div>
          <div className="protein-comparison-legend">
            <span>
              <i className="is-frameshift" data-testid="theme-audit-frameshift-legend" />
              Frameshift
            </span>
          </div>
        </div>
        <svg className="theme-audit-primer-svg" viewBox="0 0 48 24" aria-hidden="true">
          <text className="sequence-primer-base" x="6" y="17" data-testid="theme-audit-primer-base">
            A
          </text>
        </svg>
        <svg className="enzyme-site-minimap" viewBox="0 0 120 24" aria-hidden="true">
          <line className="enzyme-site-minimap-line" x1="28" y1="4" x2="44" y2="20" data-testid="theme-audit-data-mark" />
          <text data-vg-svg="ink" x="4" y="17" data-testid="theme-audit-map-ink-label">
            Feature label
          </text>
        </svg>
        <div className="vg-diagram" data-testid="theme-audit-diagram-ink">
          Gel lane metadata
        </div>
      </section>

      <div className="database-exit-sync-backdrop" data-testid="theme-audit-overlay-scrim" role="presentation">
        <div className="database-exit-sync-dialog" role="dialog" aria-label="Sync scrim audit">
          <strong>Sync</strong>
        </div>
      </div>

      <section className="theme-audit-trace-host" aria-label="Trace viewer audit">
        <div className="trace-viewer">
          <div className="trace-viewer__header"><div className="trace-viewer__title-wrap"><strong className="trace-viewer__filename">sample.ab1</strong><span className="trace-viewer__subtitle">Trace preview</span></div><button className="trace-viewer__open-sequence" type="button">Open sequence</button><button className="trace-viewer__open-sequence" type="button" disabled>Disabled trace action</button></div>
          <div className="theme-audit-trace-body">A&nbsp;&nbsp;T&nbsp;&nbsp;G&nbsp;&nbsp;C&nbsp;&nbsp;A&nbsp;&nbsp;T&nbsp;&nbsp;G&nbsp;&nbsp;C</div>
        </div>
      </section>
    </main>
  )
}

const root = document.getElementById('root')
if (!root) throw new Error('Theme audit root is missing')
createRoot(root).render(<ThemeAudit />)
