import { WHATS_NEW_SECTIONS, WHATS_NEW_VERSION } from './domain/whatsNew'

type WhatsNewDialogProps = {
  onDismiss: () => void
}

export function WhatsNewDialog({ onDismiss }: WhatsNewDialogProps) {
  return (
    <div className="translation-dialog-backdrop" role="presentation">
      <div
        className="translation-dialog whats-new-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="whats-new-title"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <h3 id="whats-new-title">{WHATS_NEW_VERSION} — Better traces and feature notes</h3>
        <p className="whats-new-lead">
          VibeGene <strong>{WHATS_NEW_VERSION}</strong> improves sequencing traces, feature
          annotations, and restriction enzyme displays.
        </p>

        <div className="whats-new-scroll">
          <h4 className="whats-new-section-heading">New features and improvements</h4>
          <ul className="whats-new-list">
            {WHATS_NEW_SECTIONS.map((section) => (
              <li key={section.title}>
                <strong>{section.title}</strong>
                <span>{section.body}</span>
              </li>
            ))}
          </ul>

          <p className="whats-new-closing">
            Thank you for your feedback and for using VibeGene{' '}
            <strong>{WHATS_NEW_VERSION}</strong>.
          </p>
        </div>

        <div className="translation-dialog-footer whats-new-footer">
          <div className="translation-actions">
            <button type="button" className="primary" onClick={onDismiss}>
              Got it
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
