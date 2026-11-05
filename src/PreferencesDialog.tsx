import { useState } from 'react'
import {
  normalizeAppPreferences,
  type AppPreferences,
  writeAppPreferences,
} from './domain/appPreferences'
import type { PcrMixSettings } from './domain/pcrRecipe'

type PreferencesTab = 'general' | 'pcr'

function PcrPrefInput({
  value,
  onChange,
  ariaLabel,
  step,
}: {
  value: number
  onChange: (value: number) => void
  ariaLabel: string
  step: number
}) {
  return (
    <input
      type="number"
      className="preferences-bp-input preferences-pcr-input"
      min={0}
      step={step}
      value={value}
      aria-label={ariaLabel}
      onChange={(event) => onChange(Number(event.target.value))}
    />
  )
}

export function PreferencesDialog({
  initial,
  onClose,
  onSave,
  onTabChange,
}: {
  initial: AppPreferences
  onClose: () => void
  onSave?: (preferences: AppPreferences) => void
  onTabChange?: (tab: PreferencesTab) => void
}) {
  const [draft, setDraft] = useState<AppPreferences>(() => normalizeAppPreferences(initial))
  const [tab, setTab] = useState<PreferencesTab>('general')

  function patchPcr(patch: Partial<PcrMixSettings>) {
    setDraft((current) => ({ ...current, pcr: { ...current.pcr, ...patch } }))
  }

  function commit() {
    const saved = writeAppPreferences(draft)
    onSave?.(saved)
    onClose()
  }

  return (
    <div className="translation-dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="translation-dialog preferences-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="preferences-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h3 id="preferences-dialog-title">Preferences</h3>
        <div className="preferences-tabs" role="tablist" aria-label="Preferences">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'general'}
            className={tab === 'general' ? 'is-active' : undefined}
            onClick={() => { setTab('general'); onTabChange?.('general') }}
          >
            General
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'pcr'}
            className={tab === 'pcr' ? 'is-active' : undefined}
            onClick={() => { setTab('pcr'); onTabChange?.('pcr') }}
          >
            PCR
          </button>
        </div>

        {tab === 'general' ? (
          <div className="preferences-options">
            <label className="preferences-option">
              <input
                type="checkbox"
                checked={draft.skipEnzymeScanForLongSequences}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    skipEnzymeScanForLongSequences: event.target.checked,
                  }))
                }
              />
              <span className="preferences-option-text">
                Don&apos;t scan for RE sites sequences longer than
                <input
                  type="number"
                  className="preferences-bp-input"
                  min={1000}
                  step={1000}
                  disabled={!draft.skipEnzymeScanForLongSequences}
                  value={draft.enzymeScanMaxBp}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      enzymeScanMaxBp: Number(event.target.value),
                    }))
                  }
                  onClick={(event) => event.stopPropagation()}
                  aria-label="Maximum sequence length for automatic RE scanning"
                />
                b.p.
              </span>
              <span className="muted preferences-help">
                Long sequences open with the enzyme toolbar off. Turning it on scans for sites anyway.
              </span>
            </label>

            <label className="preferences-option">
              <span className="preferences-option-text">
                Keep up to
                <input
                  type="number"
                  className="preferences-bp-input"
                  min={1}
                  max={50}
                  step={1}
                  value={draft.maxUnsavedDrafts}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      maxUnsavedDrafts: Number(event.target.value),
                    }))
                  }
                  onClick={(event) => event.stopPropagation()}
                  aria-label="Maximum number of auto-saved unsaved drafts"
                />
                unsaved drafts
              </span>
            </label>

            <label className="preferences-option">
              <span className="preferences-option-text">
                Show up to
                <input
                  type="number"
                  className="preferences-bp-input"
                  min={1}
                  max={100}
                  step={1}
                  value={draft.maxRecentFiles}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      maxRecentFiles: Number(event.target.value),
                    }))
                  }
                  onClick={(event) => event.stopPropagation()}
                  aria-label="Maximum number of recent files in the File menu"
                />
                recent files
              </span>
              <span className="muted preferences-help">
                Unsaved drafts and recently opened files appear under File.
              </span>
            </label>

            <label className="preferences-option">
              <input
                type="checkbox"
                checked={draft.descriptionPanelDefaultVisible}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    descriptionPanelDefaultVisible: event.target.checked,
                  }))
                }
              />
              <span>
                Description panel default state
                <span className="muted preferences-option-note">
                  {' '}
                  — {draft.descriptionPanelDefaultVisible ? 'on' : 'off'} when opening a construct
                </span>
              </span>
              <span className="muted preferences-help">
                The description panel setting applies the next time a construct is opened.
              </span>
            </label>

            <label className="preferences-option">
              <input
                type="checkbox"
                checked={draft.shareAnonymousUsage}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, shareAnonymousUsage: event.target.checked }))
                }
              />
              <span>
                Share anonymous usage
                <span className="muted preferences-option-note">
                  {' '}
                  — occasional install ping (version / platform only; no sequences)
                </span>
              </span>
            </label>
          </div>
        ) : (
          <div className="preferences-pcr">
            <p className="preferences-pcr-lead">
              Defaults for the History PCR recipe. The calculator can still override them per reaction.
            </p>
            <table className="preferences-pcr-table">
              <tbody>
                <tr>
                  <th scope="row">Reaction volume</th>
                  <td>
                    <PcrPrefInput
                      value={draft.pcr.reactionVolumeUl}
                      onChange={(reactionVolumeUl) => patchPcr({ reactionVolumeUl })}
                      ariaLabel="Default PCR volume (µl)"
                      step={1}
                    />
                    µl
                  </td>
                </tr>
                <tr>
                  <th scope="row">Primer stock</th>
                  <td>
                    <PcrPrefInput
                      value={draft.pcr.primerStockuM}
                      onChange={(primerStockuM) => patchPcr({ primerStockuM })}
                      ariaLabel="Default primer stock (µM)"
                      step={1}
                    />
                    µM
                  </td>
                </tr>
                <tr>
                  <th scope="row">Primer in mix (Taq)</th>
                  <td>
                    <PcrPrefInput
                      value={draft.pcr.primerFinalTaquM}
                      onChange={(primerFinalTaquM) => patchPcr({ primerFinalTaquM })}
                      ariaLabel="Default Taq primer final concentration (µM)"
                      step={0.1}
                    />
                    µM each
                  </td>
                </tr>
                <tr>
                  <th scope="row">Primer in mix (HF)</th>
                  <td>
                    <PcrPrefInput
                      value={draft.pcr.primerFinalHfuM}
                      onChange={(primerFinalHfuM) => patchPcr({ primerFinalHfuM })}
                      ariaLabel="Default high-fidelity primer final concentration (µM)"
                      step={0.1}
                    />
                    µM each
                  </td>
                </tr>
                <tr>
                  <th scope="row">Buffer stock</th>
                  <td>
                    <PcrPrefInput
                      value={draft.pcr.bufferFold}
                      onChange={(bufferFold) => patchPcr({ bufferFold })}
                      ariaLabel="Default PCR buffer fold"
                      step={1}
                    />
                    ×
                  </td>
                </tr>
                <tr>
                  <th scope="row">dNTP stock</th>
                  <td>
                    <PcrPrefInput
                      value={draft.pcr.dntpStockmM}
                      onChange={(dntpStockmM) => patchPcr({ dntpStockmM })}
                      ariaLabel="Default dNTP stock (mM)"
                      step={1}
                    />
                    mM
                  </td>
                </tr>
                <tr>
                  <th scope="row">dNTP in mix</th>
                  <td>
                    <PcrPrefInput
                      value={draft.pcr.dntpFinalmM}
                      onChange={(dntpFinalmM) => patchPcr({ dntpFinalmM })}
                      ariaLabel="Default dNTP final concentration (mM)"
                      step={0.05}
                    />
                    mM
                  </td>
                </tr>
                <tr>
                  <th scope="row">Polymerase</th>
                  <td>
                    <PcrPrefInput
                      value={draft.pcr.polymeraseUl}
                      onChange={(polymeraseUl) => patchPcr({ polymeraseUl })}
                      ariaLabel="Default polymerase volume (µl per reaction)"
                      step={0.1}
                    />
                    µl / reaction
                  </td>
                </tr>
                <tr>
                  <th scope="row">Template DNA</th>
                  <td>
                    <PcrPrefInput
                      value={draft.pcr.templateUl}
                      onChange={(templateUl) => patchPcr({ templateUl })}
                      ariaLabel="Default template DNA volume (µl per reaction)"
                      step={0.5}
                    />
                    µl / reaction
                  </td>
                </tr>
                <tr>
                  <th scope="row">Cycles</th>
                  <td>
                    <PcrPrefInput
                      value={draft.pcr.cycles}
                      onChange={(cycles) => patchPcr({ cycles })}
                      ariaLabel="Default PCR cycle count"
                      step={1}
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        <div className="translation-dialog-footer preferences-footer">
          <div className="translation-actions">
            <button type="button" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="primary" onClick={commit}>
              OK
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
