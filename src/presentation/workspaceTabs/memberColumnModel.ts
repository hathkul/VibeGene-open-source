import type { MemberColumnId } from '../sequence'

export const MEMBER_COLUMN_ORDER: MemberColumnId[] = [
  'ref',
  'on',
  'name',
  'length',
  'reads',
  'strand',
  'aligned',
  'mismatches',
  'features',
  'primers',
  'status',
  'actions',
]

export const DEFAULT_MEMBER_COLUMN_WIDTHS: Record<MemberColumnId, number> = {
  ref: 44,
  on: 44,
  name: 200,
  length: 76,
  reads: 56,
  strand: 64,
  aligned: 90,
  mismatches: 88,
  features: 68,
  primers: 68,
  status: 160,
  actions: 96,
}
