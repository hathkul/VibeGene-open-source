import { gibsonMethodLabel } from '../../domain/gibsonAssembly'
import { gatewayMethodLabel } from '../../domain/gatewayBpCloning'
import { taGcMethodLabel } from '../../domain/taGcCloning'
import type { GibsonAssemblyMethod } from '../../domain/gibsonAssembly'
import type { GatewayCloningMethod } from '../../domain/gatewayBpCloning'
import type { TaGcCloningMethod } from '../../domain/taGcCloning'
import type { SequenceRecord } from '../../domain/types'

export function restrictionCloningOpenStatus(products: SequenceRecord[]): string {
  if (products.length === 1) {
    const product = products[0]!
    return `Opened cloning product ${product.name} (${product.sequence.length} bp).`
  }
  return `Opened ${products.length} restriction-cloning products.`
}

export function gibsonAssemblyOpenStatus(products: SequenceRecord[], method: GibsonAssemblyMethod): string {
  const label = gibsonMethodLabel(method)
  if (products.length === 1) {
    const product = products[0]!
    return `Opened ${label} product ${product.name} (${product.sequence.length} bp).`
  }
  return `Opened ${products.length} ${label} products.`
}

export function taGcCloningOpenStatus(products: SequenceRecord[], method: TaGcCloningMethod): string {
  const label = taGcMethodLabel(method)
  if (products.length === 1) {
    const product = products[0]!
    return `Opened ${label} product ${product.name} (${product.sequence.length} bp).`
  }
  return `Opened ${products.length} ${label} products.`
}

export function gatewayCloningOpenStatus(products: SequenceRecord[], method: GatewayCloningMethod): string {
  const label = gatewayMethodLabel(method)
  if (products.length === 1) {
    const product = products[0]!
    return `Opened ${label} product ${product.name} (${product.sequence.length} bp).`
  }
  return `Opened ${products.length} ${label} products.`
}

export function mutagenesisOpenStatus(product: SequenceRecord): string {
  return `Opened mutagenesis product ${product.name} (${product.sequence.length} bp).`
}

export function pcrOpenStatus(products: SequenceRecord[]): string | null {
  const last = products[products.length - 1]
  if (!last) return null
  if (products.length > 1) {
    return `Saving ${products.length} PCR products to local projects and opening tabs (fused first)…`
  }
  return `Opened PCR product ${last.name} (${last.sequence.length} bp).`
}

export function blockedBatchProductOpenStatus(productName: string): string {
  return `Opened ${productName} in a new tab.`
}
