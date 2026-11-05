import { SangerAllelesHelpArticle } from './SangerAllelesHelpArticle'

/** Contextual copy of the same article shown in Help → CRISPR workflow. */
export function SangerAllelesHelpDialog({ onDismiss }: { onDismiss: () => void }) {
  return <div className="translation-dialog-backdrop sanger-alleles-help-backdrop" role="presentation" onMouseDown={onDismiss}>
    <section className="translation-dialog dna-library-help-dialog crispr-workflow-help-dialog sanger-alleles-help-dialog" role="dialog" aria-modal="true" aria-labelledby="sanger-alleles-help-dialog-title" onMouseDown={(event) => event.stopPropagation()} onKeyDown={(event) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onDismiss() }
      if (event.key === 'Tab') {
        const scroll = event.currentTarget.querySelector<HTMLElement>('.dna-library-help-scroll')
        const close = event.currentTarget.querySelector<HTMLButtonElement>('.dna-library-help-footer button')
        if (event.shiftKey && document.activeElement === scroll) { event.preventDefault(); close?.focus() }
        else if (!event.shiftKey && document.activeElement === close) { event.preventDefault(); scroll?.focus() }
      }
    }}>
      <h3 id="sanger-alleles-help-dialog-title">Alleles from Sanger data · Help</h3>
      <div className="dna-library-help-scroll" tabIndex={0} aria-label="Help article"><SangerAllelesHelpArticle /></div>
      <div className="translation-dialog-footer dna-library-help-footer"><div className="translation-actions">
        <button type="button" className="primary" onClick={onDismiss} autoFocus>Close</button>
      </div></div>
    </section>
  </div>
}
