import { useEffect, useMemo, useState } from 'react'
import type { Primer, PrimerBindingLayout, SequenceRecord } from '../../domain/types'
import type { Primer3ThalInput } from '../../domain/primer3/thalProtocol'
import type { PrimerFrameDisplay } from '../../domain/primerSequenceLayout'
import { defaultPrimerTmConditionValues, primerTmConditionsForCalculation } from './PrimerTmConditionsModel'
import { buildPrimer3ThalRequest, displayPrimer3ThalResult, primerFrameDisplayFromPrimer3Thal } from './primer3ThalForBinding'
import { runPrimer3Thal } from '../../primer3/thalClient'

function displayIdentity(recordId: string, topology: SequenceRecord['topology'], display: PrimerFrameDisplay): string {
  return [recordId, topology, display.primerId, display.strand,
    display.selectRange.start, display.selectRange.end, display.sequence].join('|')
}

type RequestEntry = {
  key: string
  identity: string
  display: PrimerFrameDisplay
  primer: Primer
  binding: PrimerBindingLayout
  input: Primer3ThalInput
  excludedPrimer5PrimeBases?: string
}

function primerFrameDisplayKey(display: PrimerFrameDisplay): string {
  return JSON.stringify([
    display.primerId,
    display.strand,
    display.selectRange.start,
    display.selectRange.end,
    display.sequence,
  ])
}

export function mergePrimerFrameDisplayOverrides(
  displays: PrimerFrameDisplay[],
  refinedDisplays: PrimerFrameDisplay[],
): PrimerFrameDisplay[] {
  const refinedByKey = new Map(refinedDisplays.map((display) => [primerFrameDisplayKey(display), display]))
  return displays.map((display) => {
    const refined = refinedByKey.get(primerFrameDisplayKey(display))
    return refined ? {
      ...display,
      glyphs: refined.glyphs,
      templateSpanStart: refined.templateSpanStart,
      templateSpanEnd: refined.templateSpanEnd,
    } : display
  })
}

/**
 * Async preferred sequence-track drawing. Existing displays are returned immediately;
 * each site only replaces its fallback after a successful, coordinate-verified THAL parse.
 */
export function usePrimer3PrimerFrameDisplays(
  record: SequenceRecord,
  displays: PrimerFrameDisplay[],
  enabled: boolean,
): PrimerFrameDisplay[] {
  const { id: recordId, sequence: template, topology, primers } = record
  const displayInputsSignature = JSON.stringify(displays.map((display) => [
    display.primerId,
    display.strand,
    display.selectRange.start,
    display.selectRange.end,
    display.sequence,
  ]))
  const entries = useMemo<RequestEntry[]>(() => {
    if (!enabled) return []
    const conditions = primerTmConditionsForCalculation({ ...defaultPrimerTmConditionValues })
    if (!conditions) return []
    const byId = new Map(primers.map((primer) => [primer.id, primer]))
    const displayInputs = JSON.parse(displayInputsSignature) as Array<[
      string,
      PrimerFrameDisplay['strand'],
      number,
      number,
      string,
    ]>
    return displayInputs.flatMap(([primerId, strand, start, end, sequence]) => {
      const display: PrimerFrameDisplay = {
        primerId,
        name: '',
        color: '',
        strand,
        sequence,
        glyphs: [],
        templateSpanStart: start,
        templateSpanEnd: end,
        selectRange: { start, end },
      }
      const primer = byId.get(display.primerId)
      if (!primer || primer.sequence.toUpperCase() !== display.sequence.toUpperCase()) return []
      // Reuse the real saved binding so tails, mismatches, and insertion components
      // remain available to the request builder. A synthesized full-span component
      // would falsely claim every primer base anneals and could trim the wrong 5′ bases.
      let binding = primer.bindings?.find((candidate) =>
        candidate.strand === display.strand &&
        candidate.templateStart === display.selectRange.start &&
        candidate.templateEnd === display.selectRange.end,
      )
      if (!binding) {
        const { start, end } = display.selectRange
        const selectedSpan = topology === 'circular' && template.length > 0
          ? (end > start ? end - start : ((end - start) % template.length + template.length) % template.length)
          : end - start
        // The historical fallback is safe while neither sequence must be trimmed.
        // For a both-long request, however, only a real saved layout can prove the
        // omitted 5′ bases are unpaired; never infer that from a fabricated component.
        if (primer.sequence.length > 60 && selectedSpan > 60) return []
        binding = {
          strand: display.strand,
          templateStart: start,
          templateEnd: end,
          components: [{ primerBases: primer.sequence, templateStart: start, templateEnd: end }],
        }
      }
      const request = buildPrimer3ThalRequest({
        primer: primer.sequence,
        template,
        topology,
        binding,
        conditions,
      })
      const identity = displayIdentity(recordId, topology, display)
      return request.status === 'ready'
        ? [{
          key: JSON.stringify([identity, request.input, request.approximation]),
          identity,
          display,
          primer,
          binding,
          input: request.input,
          excludedPrimer5PrimeBases: request.approximation?.excludedPrimer5PrimeBases,
        }]
        : []
    })
  }, [displayInputsSignature, enabled, primers, recordId, template, topology])

  const [overrides, setOverrides] = useState<Map<string, Pick<PrimerFrameDisplay, 'glyphs' | 'templateSpanStart' | 'templateSpanEnd'>>>(() => new Map())
  useEffect(() => {
    if (!entries.length) return
    const controller = new AbortController()
    void Promise.allSettled(entries.map((entry) => runPrimer3Thal(entry.input, { signal: controller.signal })))
      .then((settled) => {
        if (controller.signal.aborted) return
        const next = new Map<string, Pick<PrimerFrameDisplay, 'glyphs' | 'templateSpanStart' | 'templateSpanEnd'>>()
        settled.forEach((item, index) => {
          if (item.status !== 'fulfilled') return
          const entry = entries[index]!
          const validated = displayPrimer3ThalResult(item.value)
          if (validated.status !== 'estimated') return
          const converted = primerFrameDisplayFromPrimer3Thal({
            primer: entry.primer,
            template,
            topology,
            binding: entry.binding,
            input: entry.input,
            result: item.value,
            fallbackDisplay: entry.display,
            excludedPrimer5PrimeBases: entry.excludedPrimer5PrimeBases,
          })
          if (converted) next.set(entry.key, {
            glyphs: converted.display.glyphs,
            templateSpanStart: converted.display.templateSpanStart,
            templateSpanEnd: converted.display.templateSpanEnd,
          })
        })
        setOverrides(next)
      })
      .catch(() => {
        // One failed site leaves all of its existing display frames intact.
      })
    return () => controller.abort()
  }, [entries, template, topology])

  return useMemo(() => {
    const entryByIdentity = new Map(entries.map((entry) => [entry.identity, entry]))
    return displays.map((display) => {
      if (!enabled) return display
      const entry = entryByIdentity.get(displayIdentity(recordId, topology, display))
      const override = entry ? overrides.get(entry.key) : undefined
      return override ? { ...display, ...override } : display
    })
  }, [displays, enabled, entries, overrides, recordId, topology])
}
