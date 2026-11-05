import { useEffect } from 'react'

type HistoryDerivedWorkflowsHelpDialogProps = {
  onDismiss: () => void
}

export const HISTORY_DERIVED_WORKFLOWS_HELP_TITLE = 'Recipes & gels from History'

export function HistoryDerivedWorkflowsHelpDialog({ onDismiss }: HistoryDerivedWorkflowsHelpDialogProps) {
  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onDismiss()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onDismiss])

  return (
    <div className="translation-dialog-backdrop" role="presentation" onPointerDown={onDismiss}>
      <div
        className="translation-dialog dna-library-help-dialog cloning-recipe-help-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="history-derived-workflows-help-title"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <h3 id="history-derived-workflows-help-title">{HISTORY_DERIVED_WORKFLOWS_HELP_TITLE}</h3>
        <div className="dna-library-help-scroll">
          <p>
            History is more than a record of how a construct was made. When a saved operation contains enough
            information about its source constructs, primers, or restriction sites, VibeGene can turn it into a
            practical ligation recipe, PCR program and mix, or simulated DNA gel. Expand the relevant branch on the{' '}
            <strong>History</strong> tab, then use the highlighted labels described below.
          </p>

          <h4>Restriction-ligation recipes</h4>
          <p>
            Double-click the <strong>Insert fragment</strong> or <strong>Insert fragments</strong> operation badge.
            VibeGene reconstructs the vector and insert sizes from the parental restriction cuts and opens a ligation
            calculator. A vector linearized at one site uses its full length; a fragment released between two sites
            uses the span between those sites.
          </p>
          <p>
            The calculator shows each part’s length, equimolar mass ratio, suggested insert:vector molar excess,
            required mass, stock concentration, and volume. It starts with 20 ng of vector. Suggested excess is higher
            for short inserts and blunt junctions, but both the vector mass and each insert’s multiplicity are editable.
          </p>
          <table className="dna-library-help-table">
            <thead>
              <tr>
                <th>Insert size</th>
                <th>Sticky ends</th>
                <th>Blunt ends</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>≤ 60 bp</td>
                <td>10:1</td>
                <td>10:1</td>
              </tr>
              <tr>
                <td>61–120 bp</td>
                <td>7:1</td>
                <td>10:1</td>
              </tr>
              <tr>
                <td>121–250 bp</td>
                <td>5:1</td>
                <td>7:1</td>
              </tr>
              <tr>
                <td>&gt; 250 bp</td>
                <td>3:1</td>
                <td>5:1</td>
              </tr>
            </tbody>
          </table>
          <p>
            Insert mass is calculated as{' '}
            <code>vector ng × (insert bp / vector bp) × molar excess</code>. Enter concentrations in ng/µl to calculate
            pipetting volumes, or leave them blank when you only need target masses.
          </p>

          <h4>PCR programs and mixes</h4>
          <p>
            Double-click a <strong>PCR amplification</strong> or <strong>Overlap-extension PCR</strong> operation badge.
            VibeGene uses the recorded product, primers, and polymerase ends to suggest a cycling program and reaction
            mix. Primer melting temperatures use each primer’s 3′ annealing stretch; a recorded 5′ overhang is not
            counted as template-binding sequence.
          </p>
          <p>
            A Taq or A-overhang product gets a Taq profile; other products use a high-fidelity profile. The program
            accounts for product length, primer Tm, GC content, and predicted hairpins or dimers. These factors can
            change the annealing recommendation, retain 98 °C denaturation, or add a DMSO note. Treat the result as a
            starting point and adapt it to your enzyme and laboratory protocol.
          </p>
          <p>
            Mix values start from <strong>Preferences → PCR</strong>. In the recipe you can change reaction volume,
            number of reactions, primer stock, buffer concentration, dNTP stock, polymerase, or template DNA. Volumes
            rescale automatically, and nuclease-free water fills the remaining volume.
          </p>

          <h4>Restriction-digest gels from History</h4>
          <p>
            Restriction sites are shown on the connector from each parent to a cloning operation. Double-click a parent
            contribution label that names one or more enzymes—for example <strong>vector · XbaI</strong> or{' '}
            <strong>insert · XbaI + NheI</strong>. The label’s tooltip says “double-click for agarose gel” when this
            action is available.
          </p>
          <p>
            VibeGene opens the DNA gel simulator with that historical parent construct loaded as a sample and the
            recorded enzyme or enzymes selected. This models the digest of the clicked <em>source</em>, not the final
            product, so you can inspect the fragments that would have supplied the vector or insert. Only contributions
            with named restriction enzymes can open a history-derived gel.
          </p>
          <p>
            In the gel window you can inspect fragment sizes, add or duplicate lanes, choose a ladder, change agarose or
            polyacrylamide percentage and run distance, and export the result. The picture is a size-based simulation;
            confirm experimental conditions against the ladder and protocol you will actually use.
          </p>

          <p className="dna-library-help-note">
            If a label is not interactive, the imported history does not contain enough structured information for
            that calculation. You can still open a construct by clicking its name and use the regular cloning, PCR, or
            gel tools.
          </p>
        </div>
        <div className="translation-dialog-footer dna-library-help-footer">
          <div className="translation-actions">
            <button type="button" className="primary" onClick={onDismiss} autoFocus>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
