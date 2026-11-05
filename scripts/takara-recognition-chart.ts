import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseUsbRecognition } from '../src/domain/enzymeParser.ts'
import { nebRecognitionChart } from './neb-recognition-chart.ts'
import { rocheNotationFor } from './roche-recognition-chart.ts'

const root = dirname(fileURLToPath(import.meta.url))

/** TaKaRa-specific recognition notations not covered by NEB/Roche/USB. */
export const takaraRecognitionOverrides: Record<string, string> = {
  BlnI: 'C/CTAGG',
  MroI: 'T/CCGGA',
  BanI: 'G/GGYCC',
  BanII: 'G/GGCC',
  EclXI: 'C/CWWGG',
  Asp718I: 'CTGCA/G',
  AspEI: 'ATGCA/T',
  Asp700I: 'GDGCH/C',
  XmaCI: 'C/CCGGG',
  EcoT14I: 'C/CWWGG',
}

const nebNotationByName = new Map<string, string>()
for (const [name, notation] of nebRecognitionChart) {
  nebNotationByName.set(name.replace(/[®§]/g, ''), notation)
}

export const takaraAlsoKnownAsOverrides: Record<string, string> = {
  AccII: 'MvnI',
  AccIII: 'MroI',
  AfaI: 'RsaI',
  Aor13HI: 'MroI',
  Aor51HI: 'AfeI',
  BalI: 'MluNI',
  BmeT110I: 'AvaI',
  BmgT120I: 'Sau96I',
  BspT104I: 'SfuI',
  BspT107I: 'BanI',
  BstPI: 'BstEII',
  EcoO65I: 'BstEII',
  EcoRVI: 'EcoRV',
  EcoT14I: 'ErhI',
  EcoT22I: 'NsiI',
  FbaI: 'BclI',
  HapII: 'HpaII',
  PmaCI: 'XmaI',
  PshBI: 'AseI',
  SpeI: 'AhlI',
  Sse8387I: 'SbfI',
  VpaK11BI: 'AvaII',
  XspI: 'MaeI',
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

export function takaraNotationFor(enzymeName: string, alsoKnownAs: string | null = null): string | null {
  const override = takaraRecognitionOverrides[enzymeName]
  if (override) return override

  for (const variant of [enzymeName, `${enzymeName}-HF`]) {
    const neb = nebNotationByName.get(variant)
    if (neb) return neb
  }

  const roche = rocheNotationFor(enzymeName)
  if (roche) return roche

  const usb = usbNotationByName.get(enzymeName)
  if (usb) return usb

  const alias = alsoKnownAs ?? takaraAlsoKnownAsOverrides[enzymeName] ?? null
  if (alias && alias !== enzymeName) {
    return takaraNotationFor(alias, null)
  }

  return null
}
