import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseUsbRecognition } from '../src/domain/enzymeParser.ts'
import { nebRecognitionChart } from './neb-recognition-chart.ts'
import { rocheNotationFor } from './roche-recognition-chart.ts'

const root = dirname(fileURLToPath(import.meta.url))

export const promegaRecognitionOverrides: Record<string, string> = {
  CspI: 'CG/CGYCG',
  Hsp92I: 'G(A/C)TC',
  StyI: 'C/CWWGG',
  EclHKI: 'GAGCT/C',
  CfoI: 'G/CGC',
  EcoICRI: 'GAGCT/C',
}

const nebNotationByName = new Map<string, string>()
for (const [name, notation] of nebRecognitionChart) {
  nebNotationByName.set(name.replace(/[®§]/g, ''), notation)
}

export const promegaAlsoKnownAsOverrides: Record<string, string> = {
  AgeI: 'AgeI-HF',
  BbuI: 'SphI',
  BsaMI: 'BsmAI',
  BsrSI: 'BsrBI',
  Bst98I: 'BstUI',
  BstEII: 'BstEII-HF',
  BstOI: 'BstNI',
  BstZI: 'EagI-HF',
  Csp45I: 'SfuI',
  CspI: 'SmaI',
  EclHKI: 'SacII',
  Hsp92II: 'HpaII',
  SgfI: 'PpuMI',
  SinI: 'AvaII',
  StyI: 'StyI-HF',
  XhoII: 'MflI',
  AccB7I: 'PflMI',
  Alw44I: 'VneI',
  EcoICRI: 'SacI',
  Tru9I: 'MseI',
  Tth111I: 'AspI',
}

type UsbRecognitionSource = {
  catalogName: string
  recognitionRaw: string
}

function usbRecognitionSources(): UsbRecognitionSource[] {
  try {
    const usbChart = JSON.parse(readFileSync(join(root, 'usb-buffer-chart.json'), 'utf8')) as Record<
      string,
      UsbRecognitionSource
    >
    return Object.values(usbChart)
  } catch {
    return []
  }
}

const usbNotationByName = new Map<string, string>()
for (const profile of usbRecognitionSources()) {
  const parsed = parseUsbRecognition(profile.recognitionRaw)
  if (parsed?.notation) usbNotationByName.set(profile.catalogName, parsed.notation)
}

export function promegaNotationFor(enzymeName: string, alsoKnownAs: string | null = null): string | null {
  const override = promegaRecognitionOverrides[enzymeName]
  if (override) return override

  for (const variant of [enzymeName, `${enzymeName}-HF`]) {
    const neb = nebNotationByName.get(variant)
    if (neb) return neb
  }

  const roche = rocheNotationFor(enzymeName)
  if (roche) return roche

  const usb = usbNotationByName.get(enzymeName)
  if (usb) return usb

  const alias = alsoKnownAs ?? promegaAlsoKnownAsOverrides[enzymeName] ?? null
  if (alias && alias !== enzymeName) {
    return promegaNotationFor(alias, null)
  }

  return null
}
