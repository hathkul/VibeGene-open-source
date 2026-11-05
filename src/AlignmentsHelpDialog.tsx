import { useEffect } from 'react'

type AlignmentsHelpDialogProps = {
  onDismiss: () => void
}

export const ALIGNMENTS_HELP_TITLE = 'Trace & MSA alignments'

export function AlignmentsHelpDialog({ onDismiss }: AlignmentsHelpDialogProps) {
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
        className="translation-dialog dna-library-help-dialog alignments-help-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="alignments-help-title"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <h3 id="alignments-help-title">{ALIGNMENTS_HELP_TITLE}</h3>
        <div className="dna-library-help-scroll">
          <p>
            VibeGene aligns other sequences to the open document in two ways. Each has its own button in the left
            sidebar, and only one is active at a time:
          </p>
          <ul>
            <li>
              <strong>Sequence trace alignments</strong> check sequencing reads against the sequence you have open.
            </li>
            <li>
              <strong>Comparative alignments</strong> compare homologous sequences side by side in a
              multiple-alignment (MSA) grid. Protein documents also accept coding DNA here, translated on the fly.
            </li>
          </ul>
          <p>
            In both modes the open document is the fixed <strong>reference</strong>. Its coordinates never change;
            every other sequence is placed relative to it.
          </p>

          <h4>Trace alignments: verifying sequencing results</h4>
          <p>Use trace alignments when you want to know whether a clone matches the design.</p>
          <p>
            <strong>Adding reads.</strong> Turn on <strong>Show sequence trace alignments</strong>, then drop files onto
            the workspace or use the alignment list’s “Drop files or browse.” Sanger chromatograms (<code>.ab1</code>)
            and ordinary sequence files (SnapGene <code>.dna</code>, GenBank, FASTA, <code>.seq</code>, and so on) are
            accepted.
          </p>
          <p>
            <strong>How reads are placed.</strong>
          </p>
          <ul>
            <li>
              Each read is aligned to the reference on its own. Both strands are tried and the better one is kept;
              reverse reads are shown reverse-complemented and labelled as such.
            </li>
            <li>
              Short reads (Sanger) get a local alignment: only the part of the read that matches is placed, so
              low-quality ends that don’t fit are left out.
            </li>
            <li>
              Long reads that cover nearly the whole reference (full-length consensus, nanopore assemblies) get an
              end-to-end alignment.
            </li>
            <li>On circular plasmids, an assembly that starts at a different origin is detected and rotated to fit.</li>
            <li>
              <code>N</code> in a read counts as a match to any base.
            </li>
          </ul>
          <p>
            <strong>What you see.</strong> Each read gets its own row under the reference, with mismatches, gaps, and
            insertions highlighted. If the read has a chromatogram, its peaks are drawn under the bases so you can
            judge whether a mismatch is real.
          </p>
          <p>
            <strong>What you can do.</strong> Select a region and click <strong>Replace in original</strong> to copy the
            read’s bases into the reference (<strong>Replace in consensus</strong> in a DNA library). In DNA libraries,
            trace alignment is also how members map to the consensus: edits, crops, features, and primers all move
            through it.
          </p>
          <p>
            In short, trace alignment is a <strong>verification and editing</strong> tool. It answers: “Does this read
            support my sequence, and if not, where does it differ?”
          </p>

          <h4>Comparative alignments (MSA): comparing homologs</h4>
          <p>
            Use comparative alignment to see how several related sequences (gene variants, orthologs, a set of clones)
            differ from one reference at each position.
          </p>
          <p>
            <strong>DNA documents.</strong> Turn on <strong>Show comparative alignments</strong>. The pane is titled{' '}
            <strong>Comparative DNA alignment</strong>, and the open sequence is the fixed DNA reference. Add sequences
            with <strong>Browse files</strong>, <strong>From Database…</strong>, or by pasting DNA, FASTA, GenBank, or
            EMBL text and clicking <strong>Add comparison</strong>. You can also drop files onto the window while
            comparative mode is on. In a DNA library, every member is included automatically; members cannot be
            removed here (manage them on the Members tab).
          </p>
          <table className="dna-library-help-table">
            <thead>
              <tr>
                <th>Column</th>
                <th>Meaning</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Orientation</td>
                <td>Forward or reverse strand relative to the reference.</td>
              </tr>
              <tr>
                <td>Identity</td>
                <td>Identical bases as a share of the aligned bases.</td>
              </tr>
              <tr>
                <td>Coverage</td>
                <td>How much of the reference this sequence spans.</td>
              </tr>
              <tr>
                <td>Notes</td>
                <td>
                  Number of gaps, or <em>clean</em>.
                </td>
              </tr>
            </tbody>
          </table>
          <p>Cells are coloured as identity, mismatch, or insertion/deletion.</p>

          <h4>How the multiple alignment is built</h4>
          <p>
            VibeGene’s MSA is anchored on the reference. It is not a progressive aligner like Clustal or MUSCLE.
          </p>
          <ol>
            <li>
              Each sequence is aligned <strong>to the reference</strong> on its own, with the same DNA aligner used for
              traces. Both strands are tried.
            </li>
            <li>
              The results are combined into one shared grid. Each reference position is one column. If{' '}
              <strong>any</strong> sequence has extra bases between two reference positions, insertion columns open
              there for <strong>all</strong> rows. The reference shows <code>·</code> in insertion columns, sequences
              without an insertion stay blank, and a deletion relative to the reference shows as <code>–</code>.
            </li>
          </ol>
          <p>What this means in practice:</p>
          <ul>
            <li>
              Reference numbering never shifts. Position 120 is always reference position 120, however many sequences
              you add.
            </li>
            <li>
              Adding or removing a sequence never changes how the others are aligned; only the insertion columns get
              wider or narrower.
            </li>
            <li>
              Sequences are <strong>not</strong> aligned to each other. Two homologs relate only through the reference.
            </li>
            <li>
              Insertions at the same spot are stacked from the left, not aligned against each other. Regions missing
              from the reference therefore show as insertion columns, not as aligned blocks.
            </li>
            <li>
              For a true all-against-all MSA (for example, for phylogenetics), export the sequences and use a dedicated
              MSA tool.
            </li>
          </ul>
          <p>Alignments run in the background and are saved with the document, so reopening it doesn’t recompute them.</p>

          <h4>Protein documents</h4>
          <p>
            Open a protein and choose <strong>Protein → Comparative Alignment…</strong>, or click the comparative
            alignments button. The header reads “<em>name</em> is the fixed protein anchor.” Add sequences with{' '}
            <strong>Browse files</strong> (<code>.ab1</code> and sequence formats), <strong>From Database…</strong>, or by
            pasting protein, DNA, or FASTA text and clicking <strong>Add comparison</strong>. The type selector next to
            the paste box can stay on <strong>Detect type</strong>, or be set to <strong>Protein</strong> or{' '}
            <strong>DNA</strong>.
          </p>
          <table className="dna-library-help-table">
            <thead>
              <tr>
                <th>Column</th>
                <th>Meaning</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Kind</td>
                <td>
                  <em>protein</em> or <em>translated DNA</em>.
                </td>
              </tr>
              <tr>
                <td>Orientation</td>
                <td>Strand used for DNA sources.</td>
              </tr>
              <tr>
                <td>Identity</td>
                <td>Identical residues as a share of aligned residues.</td>
              </tr>
              <tr>
                <td>Similarity</td>
                <td>Identical residues plus conservative substitutions.</td>
              </tr>
              <tr>
                <td>Notes</td>
                <td>
                  Gaps and frameshifts (<code>fs</code>), or <em>clean</em>.
                </td>
              </tr>
            </tbody>
          </table>
          <p>
            Protein against protein uses a local alignment scored with BLOSUM62 and affine gap penalties. A{' '}
            <em>conservative substitution</em> is a pair with a positive BLOSUM62 score. The legend shows identity,
            conservative substitution, mismatch, gap/insertion, frameshift, and reference variability.
          </p>

          <h4>Aligning DNA translations to a protein</h4>
          <p>
            You can add <strong>DNA</strong> to a protein comparative alignment: a cDNA, a CDS, a Sanger read, or a whole
            clone. VibeGene aligns its translation directly to the reference protein, so the DNA does not need to be
            trimmed to an open reading frame first.
          </p>
          <ul>
            <li>
              The DNA is read codon by codon against the reference residues using the standard genetic code. Both
              strands are tried and the better one is kept.
            </li>
            <li>
              The reading frame is found during alignment, not fixed beforehand, so the alignment can start in any
              frame.
            </li>
            <li>A whole missing or extra codon counts as a normal gap.</li>
            <li>
              If the frame shifts partway through, the alignment can follow it. One or two bases dropped or added (−1,
              −2, +1, +2 nt) are recorded as a <strong>frameshift</strong> column with a small <code>+1</code> /{' '}
              <code>−1</code> badge. A single sequencing error or real indel no longer turns the rest of the protein
              into nonsense.
            </li>
            <li>
              Frameshifts carry a penalty. Short pairs of opposite frameshifts that only exist to force a few residues
              to match are rejected unless the evidence for them is strong.
            </li>
            <li>
              Stop codons appear as <code>*</code> and score as mismatches, so an internal stop shows up clearly instead
              of ending the alignment.
            </li>
          </ul>
          <p>
            <strong>Controls for DNA rows.</strong> <strong>Codons on/off</strong> shows the codon under each translated
            residue. Hover over a cell to see the nucleotide range, codon, reading frame, and event type. Right-click a
            frameshift and choose <strong>Disable</strong> if you know it is an artefact; VibeGene forbids that
            frameshift for that sequence and realigns. Click a DNA source’s name and choose{' '}
            <strong>Open as DNA</strong> or <strong>Open as protein</strong>.
          </p>
          <p>
            <strong>Starting from a DNA library.</strong> Open a translated CDS feature as a protein with{' '}
            <strong>Open as protein</strong> in the feature editor. VibeGene takes that CDS’s coding DNA from{' '}
            <strong>every library member</strong> and adds each one as a translated-DNA comparison, giving a
            protein-level view of the whole clone set in one step.
          </p>

          <h4>Variability regions</h4>
          <p>
            Some regions are expected to differ: antibody CDRs, randomized loops, mutagenized windows. Without help,
            the aligner may avoid them or insert artificial frameshifts to force a match. Drag across reference residues
            and click <strong>Mark variability</strong> (<strong>Clear variability</strong> undoes it; both are also in
            the Protein menu). Inside a variability region, mismatches are penalized only lightly and frameshifts are
            heavily discouraged, so sequences align straight through the window while the conserved framework on either
            side stays anchored.
          </p>

          <h4>At a glance</h4>
          <table className="dna-library-help-table">
            <thead>
              <tr>
                <th />
                <th>Trace alignment</th>
                <th>Comparative alignment (MSA)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Purpose</td>
                <td>Verify reads against your sequence</td>
                <td>Compare homologs position by position</td>
              </tr>
              <tr>
                <td>Typical input</td>
                <td>
                  <code>.ab1</code> reads, clone sequences
                </td>
                <td>Homologous DNA, proteins, coding DNA</td>
              </tr>
              <tr>
                <td>Chromatograms</td>
                <td>Shown</td>
                <td>Not shown</td>
              </tr>
              <tr>
                <td>Changes reference</td>
                <td>Yes (Replace in original / consensus)</td>
                <td>Never; view only</td>
              </tr>
              <tr>
                <td>Layout</td>
                <td>One row per read</td>
                <td>Shared column grid with insertion columns</td>
              </tr>
              <tr>
                <td>Translations</td>
                <td>No</td>
                <td>Yes, frameshift-aware</td>
              </tr>
            </tbody>
          </table>

          <h4>Troubleshooting</h4>
          <ul>
            <li>
              <strong>“No statistically useful local alignment found.”</strong> The sequence doesn’t share enough with
              the reference. Check the file and, for protein documents, the molecule type.
            </li>
            <li>
              <strong>“…no reliable seed for banded alignment.”</strong> For very large pairs, VibeGene first looks for
              short exact matches to locate the region to align. If none are found, shorten one sequence to the region
              of interest.
            </li>
            <li>
              <strong>A sequence lands on the wrong strand.</strong> Check the Orientation column. For library members,
              use Flip on the Members tab.
            </li>
            <li>
              <strong>Spurious frameshifts in a variable loop.</strong> Mark the loop as a variability region, or
              right-click the frameshift and choose Disable.
            </li>
          </ul>
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
