import {
  loadGatewayStandardVector,
  loadGatewayVectorCatalog,
  type GatewayVectorCatalogEntry,
} from './gatewayBpCloning'
import {
  loadTaGcCommercialVector,
  loadTaGcVectorCatalog,
  type TaGcVectorCatalogEntry,
} from './taGcCloning'
import type { SequenceRecord } from './types'

export type BuiltInPlasmidKind = 'gateway-donor' | 'gateway-destination' | 'ta' | 'gc'

export type BuiltInPlasmidGroupId =
  | 'builtin'
  | 'gateway'
  | 'gateway-donor'
  | 'gateway-destination'
  | 'ta-gc'
  | 'ta'
  | 'gc'

export type BuiltInPlasmidEntry = {
  id: string
  kind: BuiltInPlasmidKind
  group: 'gateway' | 'ta-gc'
  label: string
  length: number
  kindLabel: string
  gateway?: GatewayVectorCatalogEntry
  tagc?: TaGcVectorCatalogEntry
}

export type BuiltInPlasmidTreeNode = {
  id: BuiltInPlasmidGroupId
  name: string
  children: BuiltInPlasmidTreeNode[]
}

export const BUILTIN_PLASMID_TREE: BuiltInPlasmidTreeNode[] = [
  {
    id: 'gateway',
    name: 'Gateway cloning vectors',
    children: [
      { id: 'gateway-donor', name: 'Donor', children: [] },
      { id: 'gateway-destination', name: 'Destination', children: [] },
    ],
  },
  {
    id: 'ta-gc',
    name: 'TA/GC vectors',
    children: [
      { id: 'ta', name: 'TA', children: [] },
      { id: 'gc', name: 'GC', children: [] },
    ],
  },
]

const KIND_LABEL: Record<BuiltInPlasmidKind, string> = {
  'gateway-donor': 'Gateway donor',
  'gateway-destination': 'Gateway destination',
  ta: 'TA vector',
  gc: 'GC vector',
}

let indexPromise: Promise<BuiltInPlasmidEntry[]> | null = null

export function builtInGroupTitle(groupId: BuiltInPlasmidGroupId): string {
  if (groupId === 'builtin') return 'Built-in'
  if (groupId === 'gateway') return 'Gateway cloning vectors'
  if (groupId === 'gateway-donor') return 'Gateway donor vectors'
  if (groupId === 'gateway-destination') return 'Gateway destination vectors'
  if (groupId === 'ta-gc') return 'TA/GC vectors'
  if (groupId === 'ta') return 'TA vectors'
  return 'GC vectors'
}

export function entryMatchesBuiltInGroup(entry: BuiltInPlasmidEntry, groupId: BuiltInPlasmidGroupId) {
  if (groupId === 'builtin') return true
  if (groupId === 'gateway') return entry.group === 'gateway'
  if (groupId === 'ta-gc') return entry.group === 'ta-gc'
  return entry.kind === groupId
}

export function loadBuiltInPlasmidIndex(): Promise<BuiltInPlasmidEntry[]> {
  if (!indexPromise) {
    indexPromise = Promise.all([loadGatewayVectorCatalog(), loadTaGcVectorCatalog()])
      .then(([gateway, tagc]) => {
        const entries: BuiltInPlasmidEntry[] = []
        for (const item of gateway.donor) {
          entries.push({
            id: item.id,
            kind: 'gateway-donor',
            group: 'gateway',
            label: item.label,
            length: item.length,
            kindLabel: KIND_LABEL['gateway-donor'],
            gateway: item,
          })
        }
        for (const item of gateway.destination ?? []) {
          entries.push({
            id: item.id,
            kind: 'gateway-destination',
            group: 'gateway',
            label: item.label,
            length: item.length,
            kindLabel: KIND_LABEL['gateway-destination'],
            gateway: item,
          })
        }
        for (const item of tagc.ta) {
          entries.push({
            id: item.id,
            kind: 'ta',
            group: 'ta-gc',
            label: item.label,
            length: item.length,
            kindLabel: KIND_LABEL.ta,
            tagc: item,
          })
        }
        for (const item of tagc.gc) {
          entries.push({
            id: item.id,
            kind: 'gc',
            group: 'ta-gc',
            label: item.label,
            length: item.length,
            kindLabel: KIND_LABEL.gc,
            tagc: item,
          })
        }
        return entries.sort((left, right) =>
          left.label.localeCompare(right.label, undefined, { sensitivity: 'base' }),
        )
      })
      .catch((error) => {
        indexPromise = null
        throw error
      })
  }
  return indexPromise
}

export async function loadBuiltInPlasmidRecord(entry: BuiltInPlasmidEntry): Promise<SequenceRecord> {
  if (entry.gateway) return loadGatewayStandardVector(entry.gateway)
  if (entry.tagc) return loadTaGcCommercialVector(entry.tagc)
  throw new Error(`Unknown built-in plasmid ${entry.id}`)
}
