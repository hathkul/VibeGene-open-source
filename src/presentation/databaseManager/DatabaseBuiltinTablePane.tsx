import type { DatabaseManagerBuiltInPaneModel } from './databaseManagerTableTypes'

export type DatabaseBuiltinTableCommands = {
  onOpenRow: (id: string) => void
  onOpenRowDoubleClick: (id: string) => void
}

export type DatabaseBuiltinTablePaneProps = {
  model: DatabaseManagerBuiltInPaneModel
  commands: DatabaseBuiltinTableCommands
}

export function DatabaseBuiltinTablePane({ model, commands }: DatabaseBuiltinTablePaneProps) {
  if (model.emptyMessage) {
    return (
      <div className="db-file-empty-wrap">
        <p className="muted db-file-empty">{model.emptyMessage}</p>
      </div>
    )
  }

  return (
    <table className="db-file-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Type</th>
          <th>Length</th>
          <th aria-label="Actions" />
        </tr>
      </thead>
      <tbody>
        {model.rows.map((entry) => (
          <tr
            key={entry.id}
            onDoubleClick={() => {
              window.getSelection()?.removeAllRanges()
              commands.onOpenRowDoubleClick(entry.id)
            }}
          >
            <td>
              <strong className="db-file-name">{entry.label}</strong>
            </td>
            <td>{entry.kindLabel}</td>
            <td>{entry.length.toLocaleString()} bp</td>
            <td className="db-file-row-actions">
              <button type="button" onClick={() => commands.onOpenRow(entry.id)}>
                Open
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
