import { useEffect, useState } from 'react'
import { TELEGRAM_GROUP_URL } from './domain/externalLinks'
import { openExternalUrl } from './desktop/openExternalUrl'

export function TelegramGroupDialog({ onDismiss }: { onDismiss: () => void }) {
  const [openError, setOpenError] = useState(false)
  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onDismiss()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onDismiss])

  return (
    <div className="translation-dialog-backdrop" role="presentation" onPointerDown={onDismiss}>
      <div className="translation-dialog" role="dialog" aria-modal="true" aria-labelledby="telegram-group-title" onPointerDown={(event) => event.stopPropagation()}>
        <h3 id="telegram-group-title">Telegram group</h3>
        <p>Use this invite link to join the VibeGene Telegram group:</p>
        <a className="telegram-group-link" href={TELEGRAM_GROUP_URL} target="_blank" rel="noopener noreferrer" onClick={(event) => {
          event.preventDefault()
          setOpenError(false)
          void openExternalUrl(TELEGRAM_GROUP_URL).then((opened) => setOpenError(!opened)).catch(() => setOpenError(true))
        }}>{TELEGRAM_GROUP_URL}</a>
        {openError && <p role="alert">Could not open the link. Copy it into your browser instead.</p>}
        <div className="translation-dialog-footer">
          <div className="translation-actions"><button type="button" className="primary" onClick={onDismiss} autoFocus>OK</button></div>
        </div>
      </div>
    </div>
  )
}
