/** User-facing article embedded in Help → CRISPR workflow. */
export function SangerAllelesHelpArticle() {
  return <section aria-labelledby="sanger-alleles-help-title">
    <h4 id="sanger-alleles-help-title">Alleles from Sanger data</h4>
    <p>
      After CRISPR editing, the copies of a target gene in a cell can be repaired differently. One allele might
      have a small deletion, while another has an insertion or a different deletion. With two guides, the DNA
      between them may be removed and the ends joined in different ways. Even a sample grown from a single clone
      can therefore contain more than one edited sequence.
    </p>
    <p>
      When those sequences are amplified and Sanger sequenced together, their signals are superimposed in one
      chromatogram. Before the edit, the alleles may give the same clean peaks. After an insertion or deletion,
      their sequences can fall out of step and produce overlapping peaks that are difficult to read directly.
      Other differences can produce overlapping peaks only at particular bases; a clean trace can also occur when
      the amplified alleles have the same sequence.
    </p>
    <h4>How deconvolution helps</h4>
    <p>
      <strong>CRISPR → Alleles from Sanger data</strong> works backwards from those peaks. Using your reference
      sequence and the guides used in the experiment, VibeGene generates possible edited sequences and asks which
      mixture of them best explains the observed peak patterns. For example, it might propose that a trace comes
      from a mixture of a reference sequence and a short deletion, or from two different deletion junctions. This
      process is called <strong>deconvolution</strong>.
    </p>
    <p>
      The result is a set of <strong>candidate alleles</strong> and approximate fitted proportions that you can
      inspect and open as a DNA library. With one guide, the tool searches for small edits near its cut. With two
      guides, it can also search for a deletion between the cut sites. If you have two reads from the same sample,
      you can fit them together and compare the candidates inferred from each read separately.
    </p>
    <p>
      The results are <strong>exploratory hypotheses</strong>, not confirmed genotypes. The model and its estimated
      fractions have not been validated against a representative set of samples with known genotypes. A clean fit
      or agreement between reads does not prove that an allele is present or that every allele was found.
    </p>

    <h4>Before you start</h4>
    <ol>
      <li>
        Open the reference DNA containing the target region. It must be <strong>linear</strong> and contain only A,
        C, G and T. The analysis assumes its sequence is correct outside each modeled edit.
      </li>
      <li>
        Add the one or two sgRNA annotations used for editing to this document. They must have supported cut
        positions: VibeGene uses nominal SpCas9 or SaCas9 cuts, or an illustrative Cas12a non-target-strand cut.
        Cas12a cleavage can vary, so its cut position is an approximation.
      </li>
      <li>
        Add the original, unedited Sanger chromatograms, such as <code>.ab1</code> files, to the document’s{' '}
        <strong>sequence trace alignments</strong>. Turn on <strong>Show sequence trace alignments</strong>, then
        drop files onto the workspace or use the alignment list’s <strong>Drop files or browse</strong>. Wait for
        them to align. Ordinary sequence files without four chromatogram channels cannot be used for peak fitting.
      </li>
      <li>
        Check that each read covers an unedited region before the expected cut and continues beyond it in the read
        direction. For two guides, this means before the first cut encountered by that read. VibeGene requires a
        reliable reference-matching anchor and at least 30 usable peak positions after the expected cut. Reverse
        reads are supported. Check the alignment and chromatogram if a read fails these requirements.
      </li>
    </ol>

    <h4>Set up the analysis</h4>
    <ol>
      <li>
        Choose <strong>CRISPR → Alleles from Sanger data</strong> and select one or two guides under{' '}
        <strong>Guides</strong>. Select the guides actually used for the samples being analyzed; their cut positions
        must be supported and distinct.
      </li>
      <li>
        Under <strong>Candidate edits for all groups</strong>, choose which edit types to test. Local indels include
        selected deletions, insertions and compound edits around either cut. For two guides, enable deletions between
        the cuts when looking for an excised segment. The reference is always considered. An excluded edit type
        cannot be detected. You can change these settings separately for each group after selecting traces.
      </li>
      <li>
        Check the chromatograms to analyze. Each trace starts in its own group named after the file. To analyze two
        reads from the same sample together—for example, forward and reverse reads from one clone—enter the{' '}
        <strong>same group name</strong> for both. Names are case-sensitive; matching numbers in filenames do not
        group traces automatically. Each group can contain one or two traces. Keep different samples in separate
        groups.
      </li>
      <li>
        Review the per-group candidate settings and click <strong>Analyze</strong>. VibeGene fits each group and
        opens <strong>Results</strong>. A group that cannot be analyzed shows an error without preventing the other
        groups from being reported.
      </li>
    </ol>

    <h4>Example: reading a result</h4>
    <p>
      Suppose a clone was edited with one guide and sequenced in both directions. You put its two chromatograms in
      one group and analyze them. The combined result might list <strong>Reference · 60%</strong> and{' '}
      <strong>Local indel: −2 bp · 40%</strong>, with a <strong>95% peak-fit similarity</strong>. This means the
      model found that a mixture of those two candidate sequences explains the observed peaks reasonably well. It
      does not mean that there is a 95% chance the result is correct, or that exactly 40% of the cells carry the
      deletion. The values in this example are illustrative.
    </p>
    <p>
      Next, check <strong>Independent read fits</strong>. If the forward and reverse reads report different
      candidates, the combined result may hide a disagreement. Look at both chromatograms and any competing edits
      before opening the library. The same workflow applies to a two-guide deletion: select both guides, enable
      between-cut deletions, and inspect the proposed junctions.
    </p>

    <h4>Understand the results</h4>
    <ul>
      <li>
        <strong>Candidate alleles</strong> are reference or edited sequences that the model selected. The percentage
        beside an allele is an approximate fitted share of chromatogram signal, not a calibrated cell or genomic
        allele frequency. PCR amplification and sequencing can bias the mixture.
      </li>
      <li>
        <strong>Peak-fit similarity</strong> describes how well the mixture matches the peak signals; it is not a
        probability that the genotype is correct. The per-read scores shown beside a combined fit describe how well
        that <em>shared</em> model fits each trace. VibeGene requires the overall and each shared per-read score to
        reach 80% before export. This is a heuristic, not a validated confidence threshold.
      </li>
      <li>
        A <strong>mixed-peak onset</strong> estimates where sustained secondary peaks begin in the read, using
        1-based read positions. No detected onset does not prove a sample is unedited or contains only one allele.
      </li>
      <li>
        <strong>Competing edits</strong> are alternative sequences that produce the same predicted measured bases or
        fit nearly as well. They are hypotheses for one fitted allele, not additional measured alleles. The displayed
        fraction belongs to the allele as a whole, not to every alternative. At most 20 alternatives are listed; a
        notice appears if more were found. Junction previews show up to 12 reference bases on each side of the edit;
        bases between the bars are inserted, and ∅ means no insertion. Coordinates are 1-based.
      </li>
      <li>
        For a two-trace group, <strong>Independent read fits</strong> shows a separate fit and candidates for each
        read. A warning means the reported candidate sequences differ, even if the combined fit is good. Low-fit,
        ambiguous, missing or failed reads can make comparison inconclusive. A match is useful supporting evidence,
        but neither agreement nor disagreement alone proves which sequence is correct. Inspect the traces and
        alternatives. Saved analyses made before independent comparison must be run again to show it.
      </li>
    </ul>

    <h4>Open and save candidate libraries</h4>
    <p>
      For each ambiguous allele, select at least one competing variant to include. All displayed variants are
      initially selected; adjust them before export if needed. Click a group’s <strong>Open allele library</strong>,
      or check eligible groups and choose <strong>Open library for selected groups</strong>. Groups with a failed
      analysis, a shared fit below the 80% threshold, or no selected variant for an ambiguous allele cannot be
      exported. A read-disagreement warning does not itself block export; review it first.
    </p>
    <p>
      The new DNA library contains a member for each selected candidate or competing variant. Its sequences are
      built from the reference with the modeled edits, and source annotations are carried through the edits. Member
      names and the library description record the group, candidate and approximate fitted fraction; variants of one
      allele are alternatives, not separate confirmed alleles. Inspect members and their alignments in the library,
      then save it. Save the reference document to retain completed analysis results and export choices. If the
      reference sequence changes, analyze again before opening a library; <strong>Analyze again</strong> also clears
      the previous results and choices.
    </p>

    <h4>What the model can miss</h4>
    <p>
      The search considers up to four fitted alleles, local deletions up to 50 bp, insertions up to 2 bp, selected
      short compound edits, and—with two guides enabled—selected junctions near the two cuts. Other edits, complex
      rearrangements, long insertions and additional alleles can be missed. The algorithm uses a common reference
      anchor before the expected cut and copies the reference outside the candidate edit; it does not reconstruct an
      entire sample genome from the reads. A candidate can fit the observed peaks while a different sequence fits
      similarly.
    </p>
    <p>
      Examine chromatograms and use independent evidence appropriate to the question. For example, PCR can support
      the presence of a deletion, while independently resolved junction sequences or amplicon sequencing can help
      check exact alleles. PCR or a Sanger read alone may miss an allele because of amplification bias or an altered
      primer-binding site. This tool is inspired by Sanger deconvolution methods; it is not a validated implementation
      of DECODR.
    </p>
  </section>
}
