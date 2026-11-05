import { useEffect } from 'react'
import { SangerAllelesHelpArticle } from './SangerAllelesHelpArticle'

type CrisprWorkflowHelpDialogProps = {
  onDismiss: () => void
}

export const CRISPR_WORKFLOW_HELP_TITLE = 'CRISPR workflow'

export function CrisprWorkflowHelpDialog({ onDismiss }: CrisprWorkflowHelpDialogProps) {
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
        className="translation-dialog dna-library-help-dialog crispr-workflow-help-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="crispr-workflow-help-title"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <h3 id="crispr-workflow-help-title">{CRISPR_WORKFLOW_HELP_TITLE}</h3>
        <div className="dna-library-help-scroll">
          <p>
            The <strong>CRISPR</strong> menu can inspect a vector for Cas proteins, guide scaffolds and
            cloning cassettes; annotate sgRNAs on DNA you already have; rank genome-wide candidates with GuideScan2; and
            clone selected guides into a backbone with order-ready oligos. It also offers an exploratory Sanger allele
            analysis. DNA documents also expose{' '}
            <strong>New sgRNA</strong> on the <strong>Primers</strong> tab. Protein documents do not run this workflow.
          </p>

          <h4>Typical paths</h4>
          <ul>
            <li>
              <strong>You already know the spacer.</strong> Open the target DNA, use <strong>Add sgRNA…</strong> (or{' '}
              <strong>New sgRNA</strong>), enter the guide without its PAM, pick the hit, then clone or export.
            </li>
            <li>
              <strong>You want ranked genome guides.</strong> Use <strong>Design sgRNA…</strong> with{' '}
              <strong>Gene / Entrez ID</strong>, <strong>Use current sequence</strong>, or <strong>Selected region</strong>,
              review Spec. / Cut / Off-targets, then add the guides you keep.
            </li>
            <li>
              <strong>You want a cloning plasmid.</strong> Select one or more annotated sgRNAs that include a PAM, then{' '}
              <strong>Clone sgRNA…</strong>. Choose a vector VibeGene can digest (or pick enzyme sites yourself), copy the
              oligo list, and open products as separate constructs or a DNA library.
            </li>
            <li>
              <strong>You opened an empty CRISPR backbone.</strong> Run <strong>Detect CRISPR…</strong> to see Cas,
              scaffold, cassette architecture, and, for some linearized kits, oligo recipes you can fill in.
            </li>
            <li>
              <strong>You have Sanger reads from edited samples.</strong> Use <strong>Alleles from Sanger data</strong>{' '}
              to explore candidate indels or a between-guide deletion. The next section explains the setup, results,
              and limitations.
            </li>
          </ul>

          <SangerAllelesHelpArticle />

          <h4>Annotating sgRNAs on a sequence you provide</h4>
          <p>
            Open the DNA (plasmid, amplicon, or gene record). Optionally select the intended spacer on the map or
            sequence. Choose <strong>CRISPR → Add sgRNA…</strong> or <strong>New sgRNA</strong> on the Primers tab.
          </p>
          <p>
            Enter the <strong>Guide (5′→3′, no PAM)</strong>. Presets are <strong>SpCas9</strong> (20 nt, NGG 3′ of the
            guide), <strong>SaCas9</strong> (20–22 nt, NNGRRT 3′), and <strong>Cas12a / Cpf1</strong> (20–24 nt, TTTV 5′
            of the guide). <strong>Custom</strong> lets you set nuclease name, PAM motif, PAM location, and length
            range. VibeGene searches the opened sequence for that spacer next to a matching PAM and lists each hit as
            coordinates, strand, and observed PAM. Green frames mark the guide; the thicker frame is the PAM.
          </p>
          <p>
            If you started from a selection of the right length, choose whether the selected strand is{' '}
            <strong>Forward (+)</strong> or <strong>Reverse (−)</strong>. The dialog can also query GuideScan2 to fill
            Spec., Cut, and Off-targets for a spacer that already exists in the genome catalog. <strong>Add sgRNA</strong>{' '}
            stores a paired guide + PAM annotation. Those rows appear in the Primers tab under <strong>sgRNAs</strong>,
            with their own header (sgRNA, Length, Binding site, Orientation, Spec., Cut, Off-targets, Spacer, Nuclease ·
            PAM) so you can sort independently of regular primers.
          </p>
          <p>
            Use this path when the target is a plasmid, an edited gene, a local FASTA, or any DNA that is not a
            reference-genome interval GuideScan can design against. Cloning and export still work on these annotations.
          </p>

          <h4>Designing sgRNAs with GuideScan2</h4>
          <p>
            <strong>CRISPR → Design sgRNA…</strong> opens <strong>Design sgRNA with GuideScan2</strong>. This talks to
            the GuideScan2 service over the network. Design uses a gene identity or genomic coordinates on a supported
            reference; it does not send your plasmid sequence as a custom genome. Choose <strong>Reference genome</strong>{' '}
            (for example Human (hg38), Mouse (mm39)), <strong>Cas enzyme</strong> (<strong>SpCas9</strong> or{' '}
            <strong>Cas12a / Cpf1</strong>), and <strong>Candidates</strong> (how many ranked guides to request).
          </p>
          <table className="dna-library-help-table">
            <thead>
              <tr>
                <th>Target</th>
                <th>When to use it</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Gene / Entrez ID</td>
                <td>
                  Type a symbol or Entrez ID (placeholder “BRCA1 or 672”). Suggestions come from Ensembl, with NCBI Gene
                  if Ensembl is down; an exact match is picked automatically. Design runs against the reference gene.
                  The add button reads <strong>Open &lt;GENE&gt; and add N selected</strong>: it downloads the gene
                  sequence into this window and attaches the checked guides.
                </td>
              </tr>
              <tr>
                <td>Use current sequence</td>
                <td>
                  The opened file already has a gene identity (for example a RefSeqGene record with an Entrez ID).
                  GuideScan designs for that gene and maps hits onto the DNA you have open. Disabled when the document
                  has no usable gene identity.
                </td>
              </tr>
              <tr>
                <td>Selected region</td>
                <td>
                  You selected a feature or a stretch on the map or sequence. VibeGene places that interval on the
                  chosen reference (stored genome coordinates, or NCBI placement of a gene-linked record) and designs
                  only that region. Guides are added to the opened sequence, not a newly downloaded gene.
                </td>
              </tr>
            </tbody>
          </table>
          <p>
            Selected region is for exon-sized or locus-sized pieces of reference DNA (including a gene record you
            imported). If the selection is on a plasmid or other sequence that cannot be placed on the genome, VibeGene
            states that explicitly and tells you to design by gene, open the genomic record, select the stretch there,
            and run Selected region again. If nothing is selected, close the dialog, select a stretch or feature, then
            reopen Design sgRNA and choose Selected region.
          </p>
          <p>
            While a job runs, the dialog logs each step with elapsed time. Use <strong>Select all</strong> /{' '}
            <strong>Clear all</strong>, then the blue add button. Gene-mode add language is “Open … and add …”; other
            modes add to the construct already in the window.
          </p>

          <h4>Reading GuideScan scores</h4>
          <p>
            The results table and the Primers-tab sgRNA columns share the same metrics. Hover the (i) controls or the
            column headers for the same definitions:
          </p>
          <ul>
            <li>
              <strong>Spec.</strong> (specificity): 0–1 uniqueness versus the genome (CFD-based). Higher means fewer or
              weaker predicted off-targets. Defined for 20-nt guides.
            </li>
            <li>
              <strong>Cut</strong> (cutting efficiency): 0–1 predicted on-target cutting (Doench Rule Set 2). Higher
              means more likely to cut the intended site.
            </li>
            <li>
              <strong>Off-targets</strong>: other genomic sites by mismatch distance, written like “2 at 3, 16 at 4+”
              (0 = extra perfect matches, 1–3 = mismatches, 4+ = ≥4). GuideScan’s distance-0 count includes the intended
              site; VibeGene subtracts that one so “0” means no other perfect matches.
            </li>
          </ul>
          <p>
            A practical screen is high Spec., acceptable Cut for your assay, and few or no extra perfect matches. Guides
            without scores (manually entered, or not in the catalog) sort to the end of Spec./Cut/Off-targets. On the
            map, the spacer and PAM draw as CRISPR annotations; the Primers-tab checkbox column shows or hides each
            guide on map and sequence.
          </p>

          <h4>Detecting CRISPR elements in a vector</h4>
          <p>
            <strong>CRISPR → Detect CRISPR…</strong> scans the opened DNA and opens <strong>CRISPR Detection</strong>.
            It does not rewrite the file; it reports what is already there. The same scan runs inside Clone sgRNA when
            you pick a backbone.
          </p>
          <p>Detection looks for:</p>
          <ul>
            <li>
              <strong>Cas / nucleases</strong> by matching Common Features and CRISPR reference translations (Cas9
              families including SpCas9 and SaCas9, Cas12a/Cpf1, and related names such as dCas9).
            </li>
            <li>
              <strong>Guide scaffolds</strong> (gRNA / sgRNA / CRISPR RNA scaffolds and Cas12a repeats) from Common
              Features plus bundled scaffold sequences.
            </li>
            <li>
              <strong>Pol III promoters</strong> (U6-class and similar) next to the scaffold, used to define
              transcriptional orientation of a cassette.
            </li>
            <li>
              <strong>Cloning geometry</strong> around the spacer slot: Type IIS cutters (BbsI, BsmBI, Esp3I, BsaI, SapI,
              AarI) near the scaffold; removable stuffer between promoter and scaffold; mixed pairs such as BamHI +
              BsmBI/Esp3I, BstXI + BlpI, or BclI + SwaI when the cut span matches a known spacer cassette; or a
              pre-linearized backbone whose recorded sticky ends match a kit recipe (GeneArt-style, Guide-it
              sgRNA1-style, Guide-it CCGG-style, AAVpro Guide-it SaCas9-style).
            </li>
          </ul>
          <p>
            Architectures are labeled <strong>Direct spacer insertion</strong>, <strong>Removable stuffer cassette</strong>,{' '}
            <strong>Single insertion junction</strong>, or <strong>Pre-linearized sgRNA cloning backbone</strong>, with
            high / medium / low confidence and evidence lines. Pre-linearized hits can show oligo templates and a field
            for a target protospacer so you can <strong>Copy</strong> sense and antisense oligos without opening Clone
            sgRNA. Recommendations describe likely guide length and cloning approach.
          </p>
          <p>
            Use Detect CRISPR when you receive lentiCRISPRv2-class plasmids, Guide-it / GeneArt linearized kits, or a
            custom backbone and want to know whether VibeGene will treat it as a cloning vector before you order oligos.
          </p>

          <h4>Cloning sgRNAs into vectors</h4>
          <p>
            Select one or more sgRNAs that include a PAM (on the map, sequence, or Primers tab).{' '}
            <strong>Clone sgRNA…</strong> stays disabled until that selection exists. The dialog title is{' '}
            <strong>Clone sgRNA</strong>.
          </p>
          <p>
            Choose the backbone under <strong>Cloning vector</strong>: <strong>Open construct</strong> (this window or
            other open DNA tabs), <strong>Choose file…</strong>, or <strong>Database…</strong>. VibeGene then fills{' '}
            <strong>Detected CRISPR features</strong> (Cas, guide scaffold, and recorded ends if the vector is linear)
            and <strong>Cloning sites or ends</strong>.
          </p>
          <ul>
            <li>
              <strong>Auto · best validated choice</strong> uses the strongest detected cassette.
            </li>
            <li>
              Named detected options list enzyme pairs and architecture, for example BsmBI + BsmBI on a removable
              stuffer, or <strong>Existing sticky ends</strong> for a linearized kit.
            </li>
            <li>
              Circular vectors also offer <strong>Select enzyme sites manually…</strong>: pick{' '}
              <strong>Promoter-side cut</strong> and <strong>Scaffold-side cut</strong> from unique or dual cutters, or
              click those sites on the vector map. The same cut in both fields linearizes at that one site and inserts
              the guide there. This is how a user-provided vector with user-chosen enzyme sites is cloned when automatic
              cassette detection is wrong or missing.
            </li>
            <li>
              Linear vectors can use <strong>Use recorded vector ends</strong> when SnapGene (or VibeGene) stored the
              terminal overhangs.
            </li>
          </ul>
          <p>
            Each guide shows compatibility: for example “SpCas9 guide and vector scaffold agree.” A Cas–scaffold
            mismatch is blocked until you check <strong>Continue despite the Cas–guide mismatch</strong>. Cas12a crRNA
            cassettes (repeat-before-spacer) are not cloned by this workflow yet; detection can still report them.
          </p>
          <p>
            Sense and antisense oligos are written 5′→3′ without the genomic PAM. Highlighted bases are the 5′ or 3′
            additions required by the digest (for example CACCG / AAAC…C on a BsmBI lentiCRISPR cassette). Both strands
            are marked <strong>5′ phosphate</strong>. Notes explain U6 leading-G rules when the vector supplies that G.
            Order both oligos phosphorylated, or phosphorylate before ligation, as the note says.
          </p>
          <p>
            <strong>Output</strong> is <strong>Open separate constructs</strong> (one new window per guide) or{' '}
            <strong>Open as DNA library</strong>. <strong>Clone N sgRNA(s)</strong> builds the products, stores the
            oligos as primers in the product (Primers tab group <strong>sgRNA cloning oligos</strong>), and annotates the
            inserted guide.
          </p>

          <h4>Ordering oligos and opening them as DNA</h4>
          <p>
            In Clone sgRNA, <strong>Copy oligos</strong> puts a tab-separated name/sequence list on the clipboard;{' '}
            <strong>Export oligos…</strong> saves the same primer-list text. Per-guide <strong>Open as sequence</strong>{' '}
            opens the annealed duplex as a short DNA document (sticky ends, guide feature) so you can inspect junctions
            without cloning the full plasmid.
          </p>
          <p>
            After cloning, the product’s Primers tab lists those oligos. Select the sense and antisense pair (or a
            single oligo whose name encodes direction) and use the toolbar <strong>Open as sequence</strong> to rebuild
            the duplex. History for a clone-sgRNA operation also offers Copy oligos, Export oligos…, and Open as
            sequence on the stored recipe.
          </p>
          <p>
            To export spacers only (no cloning overhangs), select the sgRNA rows and choose{' '}
            <strong>CRISPR → Export sgRNAs…</strong>. That downloads a tab-separated file of guide name and spacer, in
            the same primer-list format.
          </p>

          <p className="dna-library-help-note">
            GuideScan design and gene suggestions need a network connection (GuideScan, plus Ensembl or NCBI). Cloning
            and Detect CRISPR run locally on the opened files. If a request hangs, the design and database-import dialogs
            log the wait and let you stop; cloning reports errors in the Clone sgRNA status line instead of failing
            silently.
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
