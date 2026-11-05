import { useEffect } from 'react'

type DnaLibraryHelpDialogProps = {
  onDismiss: () => void
}

export const DNA_LIBRARY_HELP_TITLE = '.dna library format'

export function DnaLibraryHelpDialog({ onDismiss }: DnaLibraryHelpDialogProps) {
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
        className="translation-dialog dna-library-help-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dna-library-help-title"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <h3 id="dna-library-help-title">{DNA_LIBRARY_HELP_TITLE}</h3>
        <div className="dna-library-help-scroll">
          <p>
            A DNA library is a single <code>.dna</code> document that holds many related sequences together:
            variants of a gene, Sanger traces of one amplicon, a clone set, or every product from a mass cloning run.
            It is not a folder of files and not the Database. The Database stores constructs; a library <em>is</em> a
            construct, with members packed inside it.
          </p>
          <p>
            You work with one <strong>consensus</strong> sequence (Map, Sequence, enzymes, features, primers) and an
            aligned set of <strong>members</strong>. Features and primers can live on the consensus, on a chosen
            reference member, or on both. Libraries round-trip as SnapGene-compatible <code>.dna</code> files, so they
            can live in Database, on disk, and in cloning workflows like any other DNA file.
          </p>

          <h4>What a library contains</h4>
          <table className="dna-library-help-table">
            <thead>
              <tr>
                <th>Piece</th>
                <th>Role</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Consensus</td>
                <td>
                  The library’s main sequence. Map, enzymes, and Sequence start here. Usually seeded from the longest
                  member; can be rebuilt by majority vote from aligned members.
                </td>
              </tr>
              <tr>
                <td>Members</td>
                <td>
                  Individual sequences (AB1 traces, SnapGene <code>.dna</code>, GenBank, FASTA, <code>.seq</code>, or
                  cloned products). Each has its own sequence, optional chromatogram, features, primers, and nested
                  reads.
                </td>
              </tr>
              <tr>
                <td>Alignment</td>
                <td>
                  Each member is aligned to the consensus (forward or reverse). That mapping is how edits, crops, and
                  annotations move between consensus coordinates and a member’s native sequence.
                </td>
              </tr>
              <tr>
                <td>Annotation reference</td>
                <td>
                  Where new features and primers spread from. Default is consensus; you can point it at one member
                  instead.
                </td>
              </tr>
            </tbody>
          </table>
          <p>
            A library has a <strong>Members</strong> tab in addition to Map, Sequence, Enzymes, Features, Primers, and
            History. In Database it shows a <code>library</code> badge; expand the row to browse members without opening
            the file. If members are deleted down to one (or zero), VibeGene collapses the library back to a normal DNA
            construct.
          </p>

          <h4>What they are for</h4>
          <p>Libraries exist so you can treat a set as one object:</p>
          <ul>
            <li>
              <strong>Inspect variation.</strong> Align traces or homologs to a consensus, see mismatches, flip a member
              that landed on the wrong strand, and rebuild consensus after cleaning the set.
            </li>
            <li>
              <strong>Annotate once, apply many.</strong> Features and primers on the annotation reference project onto
              members. Protein comparison of a CDS can pull coding DNA from every member.
            </li>
            <li>
              <strong>Batch cloning.</strong> Restriction cloning, PCR, Gibson-style assembly, TA/GC, and Gateway treat
              a library as one insert or template per member. Products can come back as a new library instead of a pile
              of files.
            </li>
            <li>
              <strong>Gels and maps.</strong> Agarose gel lanes can pick a member. Sequence can show each member as its
              own sequence without turning Alignments on.
            </li>
          </ul>
          <p>
            Typical uses: a plate of mutants, forward/reverse Sanger reads of many clones, a mutagenesis library, or
            every Gateway/PCR product from one vector.
          </p>

          <h4>How to create one</h4>
          <p>
            <strong>File → New DNA library…</strong> Choose one or more sequence files: Sanger traces
            (<code>.ab1</code>), SnapGene <code>.dna</code>, GenBank (<code>.gb</code>/<code>.gbk</code>), FASTA,{' '}
            <code>.seq</code>, and other readable DNA formats. VibeGene builds a linear library, seeds consensus from
            the longest valid member, and aligns every member to it.
          </p>
          <p>
            <strong>File → Convert to library…</strong> (open DNA construct with a sequence.) The current construct
            becomes consensus and first member. Add at least one peer from files or Database. The same sequence formats
            are accepted.
          </p>
          <p>
            <strong>Mass cloning / PCR / assembly.</strong> In Restriction Cloning, PCR, Gibson, TA/GC, or Gateway,
            choose a library as insert or template. Check <strong>Output as library</strong>, give it a name, and the
            products are packed as annotated members of one document.
          </p>

          <h4>Adding members</h4>
          <p>
            On an open library, Members → <strong>Add members</strong> from files or Database (ordinary DNA constructs
            only; you cannot nest one library inside another).
          </p>
          <p>
            You can also drop files onto the workspace <strong>with Alignments on</strong>. They join the library as
            members — the same path as the alignment list’s “Drop files or browse.” Supported files are AB1
            chromatograms plus ordinary sequence files: SnapGene <code>.dna</code>, GenBank, FASTA, <code>.seq</code>,
            and the other readable DNA formats.
          </p>
          <p>
            Dropping files with Alignments off does not add members to the library you already have open; those files
            open as separate documents.
          </p>

          <h4>Sequence: two views</h4>
          <p>
            <strong>Alignments off.</strong> Sequence is a vertical list of full sequence views: consensus (if shown)
            then each enabled member. Each block is in <em>its own coordinates</em>, not lined up under consensus. Click
            a header to focus and edit that member like a normal sequence. Use this to read or edit members without the
            alignment overlay.
          </p>
          <p>
            <strong>Alignments on.</strong> Members are shown aligned to consensus so you can compare them: matches,
            mismatches, chromatograms, grouping, and edits mapped through the alignment (including reverse-strand
            members).
          </p>

          <h4>Members tab</h4>
          <p>
            This is the inventory. Columns cover reference, on/off, name, length, nested reads, strand, aligned span,
            mismatches, feature/primer counts, and status (aligned, edited, assembled, errors).
          </p>
          <ul>
            <li>
              <strong>On</strong> includes a member in consensus rebuild and alignment views. Check all / Uncheck all
              bulk-toggles that.
            </li>
            <li>
              <strong>Ref</strong> radio: consensus or one member. New features and primers spread from that reference.
            </li>
            <li>Consensus has its own visibility checkbox (show it in the Sequence list when Alignments is off).</li>
            <li>
              <strong>Deduplicate</strong> merges members that share an identical sequence, keeping the most annotated
              copy.
            </li>
            <li>
              Per-row actions: open as a standalone construct, flip (reverse-complement and realign), delete.
            </li>
            <li>Sort by name, length, reads, strand, mismatches, or status; drag rows to reorder.</li>
          </ul>

          <h4>Library toolbar</h4>
          <p>
            The compact strip above Sequence shows consensus length, member count, what you are editing, and the
            annotation reference.
          </p>
          <ul>
            <li>
              <strong>Rebuild consensus</strong> — majority vote from enabled aligned members, then realign.
            </li>
            <li>
              <strong>Flip library</strong> — reverse-complement consensus and every member, then realign (use when the
              whole set is on the wrong strand).
            </li>
            <li>
              <strong>Combine multiple reads</strong> — group traces into multi-read members by filename convention, for
              example <code>&lt;unique_name&gt;_&lt;tag&gt;_&lt;irrelevant&gt;</code> with tags like <code>dir</code> /
              <code>rev</code>.
            </li>
            <li>
              <strong>Crop library</strong> — trim consensus and every member to the selected consensus range.
            </li>
            <li>Drag one member onto another to group them.</li>
          </ul>

          <h4>Cloning, PCR, and gels</h4>
          <p>
            Pick the library as vector, insert, or PCR template. VibeGene expands it to one choice per member. Use
            Include library members / Exclude… to drop clones that should not go into the batch. Name templates can use{' '}
            <code>&lt;insert_name&gt;</code> and <code>&lt;vector_name&gt;</code>.
          </p>
          <p>
            On a gel, choosing a library as a lane source asks which member to load (or several, for bulk add).
          </p>

          <h4>Saving and Database</h4>
          <p>
            Save a library like any DNA file. In Database it is tagged <code>library</code>; expand it to open a member
            as its own construct. Export writes one file per member when there are several members. Convert to library
            and Add members both accept Database constructs.
          </p>

          <h4>Typical workflow</h4>
          <ol>
            <li>Create the library from sequence files, a construct plus peers, or mass cloning output.</li>
            <li>Flip stray reverse members; combine F/R reads; disable junk; rebuild consensus.</li>
            <li>Set the annotation reference, then add features and primers once.</li>
            <li>
              Use the library as a cloning/PCR source, or open interesting members as standalone constructs.
            </li>
            <li>Save to Database so the set stays one row you can expand later.</li>
          </ol>

          <p className="dna-library-help-note">
            Enzyme sets and Common primers are reusable collections of enzymes and oligos. They are not DNA libraries.
            The Database is the local catalog of files; a DNA library is one of those files, with many sequences inside.
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
