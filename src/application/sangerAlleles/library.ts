import { applySequenceEditTransition } from '../selectionEditing/sequenceEditTransition'
import { createRestrictionCloningProductLibraryAsync } from '../../domain/restrictionCloningBatch'
import type { AlignPendingTraces } from '../../domain/traceFileWorkflow'
import { createId, nowIso } from '../../domain/sequence'
import type { SequenceRecord } from '../../domain/types'
import type { AlleleGroupResult, AlleleVariantSelection } from '../../domain/sangerAlleles/savedAnalysis'
import { alignPendingTraces } from '../../domain/traceFileWorkflow'
import { alignCloselyRelatedAlleles } from './closelyRelatedAlignment'
import { compareIndependentReads, readComparisonMessage } from '../../domain/sangerAlleles/readComparison'

/** Allele products share their source and orientation; use the general aligner only for large divergent regions. */
function alignAlleleProducts(fallback: AlignPendingTraces): AlignPendingTraces {
  return async (traces, template, topology, signal, onProgress) => {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    let completed = 0
    const pending: typeof traces = []
    const fast = traces.map((trace) => {
      const alignment = alignCloselyRelatedAlleles(trace.sequence, template)
      if (!alignment) { pending.push(trace); return null }
      onProgress?.(++completed, traces.length)
      return { ...trace, alignment, parseError: undefined }
    })
    if (!pending.length) return fast.map((trace) => trace!)
    const slow = await fallback(pending, template, topology, signal, (count) => onProgress?.(completed + count, traces.length))
    let index = 0
    return fast.map((trace) => trace ?? slow[index++]!)
  }
}

/** Materialize selected hypothetical variants from adequately fitted trace groups. */
export async function createAlleleLibrary(source: SequenceRecord, groups: readonly AlleleGroupResult[], alignPending?: AlignPendingTraces, selections?: ReadonlyMap<string, AlleleVariantSelection>): Promise<SequenceRecord> {
  const variantNotes: string[] = []
  const products = groups.flatMap((group) => {
    if (!group.result || group.result.fit < 0.8 || group.result.perRead.some((entry) => entry.fit < 0.8)) return []
    return group.result.alleles.flatMap((allele, index) => {
      const variants = [allele.edit, ...allele.alternatives.map((alternative) => alternative.edit)]
      const chosen = allele.ambiguous ? selections?.get(group.label)?.[index] : [0]
      if (!chosen?.length) throw new Error(`Select at least one variant for ${group.label} allele ${index + 1}.`)
      if (chosen.some((variant) => !Number.isInteger(variant) || variant < 0 || variant >= variants.length)) throw new Error(`Invalid variant selection for ${group.label} allele ${index + 1}.`)
      if (allele.alternativesTruncated) variantNotes.push(`${group.label} allele_${index + 1}: additional competing variants were not listed by the model.`)
      return [...new Set(chosen)].sort((a, b) => a - b).map((variantIndex) => {
        const edit = variants[variantIndex]!
        const name = `${group.label} allele_${index + 1} variant_${variantIndex + 1} (~${(100 * allele.fraction).toFixed(1)}%)`
        const sequence = source.sequence.slice(0, edit.start) + edit.inserted + source.sequence.slice(edit.end)
        const updated = edit.start === edit.end && !edit.inserted ? source : applySequenceEditTransition(source, {
          nextSequence: sequence,
          replacement: { start: edit.start, end: edit.end, insertedLength: edit.inserted.length },
        })
        variantNotes.push(`${name}: ${edit.label}; ${allele.ambiguous ? `alternative hypothesis for allele ${index + 1}; ` : ''}estimated allele fraction ${(100 * allele.fraction).toFixed(1)}%.`)
        return { ...updated, id: createId('allele'), name,
          dna: updated.dna ? { ...updated.dna, sangerAlleleAnalysis: undefined } : undefined,
          traceFiles: undefined, history: undefined,
          description: `Candidate from ${group.traceNames.join(', ')}. Exploratory peak fit ${(100 * group.result!.fit).toFixed(1)}%; the sequence outside the inferred edit is copied from the reference.`,
          createdAt: nowIso(), updatedAt: nowIso() }
      })
    })
  })
  if (!products.length) throw new Error('No sufficiently fitted candidate alleles are available to create a library.')
  const exportedGroups = groups.filter((group) => group.result && group.result.fit >= 0.8 && group.result.perRead.every((entry) => entry.fit >= 0.8) && group.result.alleles.length > 0)
  const groupName = exportedGroups.length === 1 ? ` ${exportedGroups[0]!.label}` : ''
  const library = await createRestrictionCloningProductLibraryAsync(products, `${source.name}${groupName} · Sanger allele candidates`, alignAlleleProducts(alignPending ?? alignPendingTraces))
  return { ...library, description: `Exploratory Sanger peak-deconvolution candidates, not confirmed genotypes. Reference sequence is assumed outside each modeled edit. Variants of the same allele are competing hypotheses, not independent alleles; the estimated fraction applies to the allele as a whole, not to each variant.\n${groups.map((group) => `${group.label}: ${group.traceNames.join(', ')}; ${group.error ?? `fit ${((group.result?.fit ?? 0) * 100).toFixed(1)}%; ${group.result?.warnings.join(' ') ?? ''}`}${group.traceNames.length === 2 ? ` ${readComparisonMessage(compareIndependentReads(source.sequence, group.independentReads))}` : ''}`).join('\n')}\n${variantNotes.join('\n')}` }
}
