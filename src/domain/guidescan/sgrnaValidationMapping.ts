type GuideScanEnzymeMapping =
  | { ok: true; enzyme: string }
  | { ok: false; reason: string }

export function mapSgRnaPresetToGuideScanEnzyme(presetId: string): GuideScanEnzymeMapping {
  if (presetId === 'SpCas9') return { ok: true, enzyme: 'cas9' }
  if (presetId === 'Cas12a') return { ok: true, enzyme: 'cpf1' }
  if (presetId === 'SaCas9') return { ok: false, reason: 'SaCas9 is not supported by GuideScan2 validation.' }
  if (presetId === 'custom') return { ok: false, reason: 'Custom nucleases are not supported by GuideScan2 validation.' }
  return { ok: false, reason: 'Choose SpCas9 or Cas12a / Cpf1 for GuideScan2 validation.' }
}
