import { APP_VERSION } from './domain/whatsNew'

type AboutDialogProps = {
  onDismiss: () => void
}

export function AboutDialog({ onDismiss }: AboutDialogProps) {
  return (
    <div className="translation-dialog-backdrop" role="presentation" onPointerDown={onDismiss}>
      <div
        className="translation-dialog about-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-dialog-title"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <h3 id="about-dialog-title" className="visually-hidden-heading">
          About VibeGene
        </h3>
        <div className="about-splash">
          <p className="about-meme">
            <span>We have</span>
            <img className="about-meme-icon" src="/snapgene-icon.png" alt="SnapGene" width="36" height="57" />
            <span>at home</span>
          </p>
          <div className="about-logo-wrap">
            <img
              className="about-logo"
              src="/vibegene-logo-splash-bright.png"
              alt="VibeGene — vibecoded, free, SnapGene alternative"
              width="640"
              height="360"
            />
            <img className="about-beta" src="/beta-badge.png" alt="β" width="193" height="369" />
          </div>
          <p className="about-version">Version {APP_VERSION}</p>
          <section className="about-description">
            <h4>DNA editing, virtual cloning and sequence analysis</h4>
            <p>VibeGene is free molecular biology software with a familiar interface. Visualize and annotate plasmids, plan virtual cloning experiments, design primers, and align Sanger sequencing traces to your constructs. Work with DNA, RNA and protein sequences in your browser or on desktop.</p>
          </section>
        </div>
        <div className="translation-dialog-footer about-footer">
          <div className="translation-actions">
            <button type="button" className="primary" onClick={onDismiss} autoFocus>
              OK
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
