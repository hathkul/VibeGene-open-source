import { useEffect } from 'react'

type DatabaseHelpDialogProps = {
  onDismiss: () => void
}

export const DATABASE_HELP_TITLE = 'Database'

export function DatabaseHelpDialog({ onDismiss }: DatabaseHelpDialogProps) {
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
        className="translation-dialog dna-library-help-dialog database-help-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="database-help-title"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <h3 id="database-help-title">{DATABASE_HELP_TITLE}</h3>
        <div className="dna-library-help-scroll">
          <p>
            VibeGene Database is a local catalog for the sequences you use repeatedly. It puts constructs, proteins,
            primers, and translated CDSes in one browsable, organized workspace, so cloning and analysis tools can
            reuse them without asking you to find the same file again.
          </p>
          <p>
            If you are used to opening individual SnapGene files, think of Database as a layer above those files:
            folders, tags, indexes, and workflow pickers for a whole collection. It does not change what a{' '}
            <code>.dna</code> file is, and it is not a cloud account.
          </p>

          <h4>What Database is for</h4>
          <ul>
            <li>
              <strong>Keep a working collection.</strong> Save vectors, inserts, strains, proteins, and DNA libraries
              once, then open or reuse them from Database.
            </li>
            <li>
              <strong>Organize by project and meaning.</strong> Build nested folders, leave temporary items in Unfiled,
              and apply tags that cut across the folder tree.
            </li>
            <li>
              <strong>Find biological parts, not just filenames.</strong> Switch among DNA, protein, primer, and CDS
              views. Primer and translated-CDS views are derived from annotations across your stored constructs.
            </li>
            <li>
              <strong>Feed workflows directly.</strong> Choose Database constructs in cloning, PCR, alignments, DNA
              libraries, and gels; mass workflows can save their products back to Database.
            </li>
            <li>
              <strong>Maintain reusable references.</strong> Keep Common primers separately and browse the built-in
              plasmid collection without mixing either into your own files.
            </li>
          </ul>

          <h4>Database and files on disk</h4>
          <table className="dna-library-help-table">
            <thead>
              <tr>
                <th>Database</th>
                <th>Files on disk</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>One local catalog managed by VibeGene</td>
                <td>Independent files and folders managed in Finder or File Explorer</td>
              </tr>
              <tr>
                <td>Folders and tags organize records inside VibeGene</td>
                <td>Folders are real filesystem locations that other applications can see</td>
              </tr>
              <tr>
                <td>Save to Database updates the catalog record</td>
                <td>Save / Save As writes a document to a path you choose</td>
              </tr>
              <tr>
                <td>Available to VibeGene workflows without browsing for a file</td>
                <td>Easy to copy, version, share, and back up with ordinary tools</td>
              </tr>
            </tbody>
          </table>
          <p>
            A Database folder is virtual unless you explicitly connect its top-level folder to a source folder in the
            desktop app. Moving or renaming an ordinary Database item therefore does not move an unrelated file on
            disk. A DNA library is different again: it is one <code>.dna</code> document containing a consensus and
            members, and Database can store that document as one expandable row.
          </p>

          <h4>Adding, browsing, and reusing records</h4>
          <ol>
            <li>
              Use <strong>Save to Database</strong> from an open construct or a cloning/PCR result, or use{' '}
              <strong>Import</strong> to add supported sequence files.
            </li>
            <li>
              Use <strong>Import folder</strong> to recreate a folder tree. On desktop, the imported top-level folder
              is also remembered as its source folder.
            </li>
            <li>
              Browse Folders, Unfiled, or Tags; switch the toolbar among DNA, Primers, Proteins, and CDSes. Sort and
              resize columns, select several rows, and move, tag, export, or delete in batches.
            </li>
            <li>
              Double-click a record to open it, or choose it from a Database picker inside another workflow. DNA
              library rows can be expanded to browse and open individual members.
            </li>
          </ol>

          <h4>Desktop folder sync</h4>
          <p>
            <strong>Import folder</strong> creates a linked Database folder: it mirrors the imported folder on disk.
            Changes made only on disk are brought into the Database; changes made only in the Database are written
            back to disk. A deleted disk file is kept as a restorable Database tombstone.
          </p>
          <ul>
            <li>
              <strong>Sync from folder</strong> is a one-time import from a folder you choose. It does not create a link.
            </li>
            <li>
              <strong>Sync and clean up</strong> is a one-time reviewed reconciliation, unless the selected folder is
              linked—in that case it reconciles its linked folder immediately.
            </li>
            <li>
              <strong>Sync to folder</strong> is a one-time export to a folder you choose. It does not create a link.
            </li>
          </ul>
          <p>
            If the same linked file changes in both places, VibeGene asks when the file is closed whether to overwrite
            the disk file or retain a dated conflicted copy. Closing a window never waits for sync or shows a conflict
            dialog; after the last window closes, linked folders reconcile in the background while VibeGene stays open.
            Folder sync is desktop-only and is not cloud sync between devices.
          </p>

          <h4>Export, transfer, and backup</h4>
          <p>
            <strong>Export database</strong> is the portable backup. The web app downloads a dated ZIP. The standalone
            app writes a folder tree. Both contain sequence files plus <code>vibegene-database.json</code>, which
            preserves the Database folder structure and metadata for <strong>Import database</strong>.
          </p>
          <p>
            Export before changing browser profiles, clearing site data, resetting or uninstalling the app, or moving
            to another computer. Importing an export adds its contents to the current Database; it is not a continuous
            two-way connection, and importing the same backup repeatedly can create duplicates.
          </p>

          <h4>Local-first privacy and safety</h4>
          <ul>
            <li>
              Database content stays on this device unless you explicitly export it, sync it to a folder, or use a
              separate feature that sends sequence data to an external service.
            </li>
            <li>
              The web app and standalone app have separate local databases. Different browsers, browser profiles,
              devices, and website origins do not automatically share a Database.
            </li>
            <li>
              In the web app, Database lives in browser storage. Clearing data for <code>vibe-gene.com</code>, using a
              temporary/private profile, or having the browser evict storage can remove it.
            </li>
            <li>
              Local storage protects against network dependence, not disk failure, accidental deletion, or device
              loss. Keep regular exports in a location covered by your normal backup system.
            </li>
            <li>
              Sync is not a substitute for backup: an accepted deletion or overwrite can propagate to the connected
              side. Review the preflight carefully, especially before <strong>Sync and clean up</strong>.
            </li>
          </ul>

          <p className="dna-library-help-note">
            A practical setup is to organize active constructs in Database, connect important desktop projects to
            ordinary folders when you need filesystem interoperability, and keep dated full Database exports as
            independent backups.
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
