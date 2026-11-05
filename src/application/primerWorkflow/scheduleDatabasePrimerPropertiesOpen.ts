import type { PrimerPropertiesPayload } from '../ports/hybridWindows'

export function scheduleDatabasePrimerPropertiesOpen(options: {
  hybridWindow: boolean
  onOpenPrimerProperties?: (payload: PrimerPropertiesPayload) => void
  resolvePayload: () => Promise<PrimerPropertiesPayload>
  openInline: (payload: PrimerPropertiesPayload) => void
}) {
  void (async () => {
    const payload = await options.resolvePayload()
    if (options.hybridWindow && options.onOpenPrimerProperties) {
      options.onOpenPrimerProperties(payload)
      return
    }
    options.openInline(payload)
  })()
}
