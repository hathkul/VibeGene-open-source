import { useCallback } from 'react'
import { applyBinderNumbering, detectBinderStructure, type BinderNumbering } from '../../domain/binderStructure'
import { buildImmunoglobulinAnnotationPlan, replaceAutomaticImmunoglobulinAnnotations } from '../../domain/immunoglobulinAnnotations'
import type { ImmunoglobulinNumbering } from '../../domain/immunoglobulinNumbering'
import { buildDarpinAnnotationPlan, replaceAutomaticDarpinAnnotations } from '../../domain/darpinAnnotations'
import type { DarpinDetection } from '../../domain/darpinDetection'
import { buildScfvAnnotationPlan, replaceAutomaticScfvAnnotations } from '../../domain/scfvAnnotations'
import type { ScfvDetection } from '../../domain/scfvDetection'
import { buildTcrAnnotationPlan, replaceAutomaticTcrAnnotations } from '../../domain/tcrAnnotations'
import type { TcrNumbering } from '../../domain/tcrNumbering'
import { buildVnarAnnotationPlan, replaceAutomaticVnarAnnotations } from '../../domain/vnarAnnotations'
import type { VnarDetection } from '../../domain/vnarDetection'
import { replaceProteinAnnotations } from '../../application/proteinWorkflow/proteinWorkflow'
import type { SequenceRecord } from '../../domain/types'

export type ProteinAnnotationControllerOptions = {
  record: SequenceRecord
  updateRecord: (updater: (current: SequenceRecord) => SequenceRecord) => void
  setStatus: (status: string) => void
}

export function useProteinAnnotationController(options: ProteinAnnotationControllerOptions) {
  const annotateProteinImmunoglobulin = useCallback((numbering: ImmunoglobulinNumbering) => {
    if (options.record.molecule !== 'protein' || !options.record.protein) return
    try {
      const plan = buildImmunoglobulinAnnotationPlan(options.record.sequence, numbering)
      options.updateRecord((current) => {
        const replacement = replaceAutomaticImmunoglobulinAnnotations(current.features, current.protein?.bonds ?? [], plan)
        return replaceProteinAnnotations(
          current,
          replacement.features,
          replacement.bonds,
          'annotateImmunoglobulin',
          `Annotated ${numbering.scheme.toUpperCase()} ${numbering.vhh?.subtype ?? numbering.chain} FR/CDR regions and bonds`,
        )
      })
      const bondMessage = plan.predictedAdditionalBond
        ? plan.missingCanonicalBond
          ? ' and 1 predicted additional VHH disulfide; the canonical cysteine pair was not present'
          : ' and 2 disulfide bonds (1 canonical, 1 predicted additional VHH bond)'
        : plan.missingCanonicalBond
          ? '; the canonical cysteine pair was not present'
          : ' and the canonical V-domain disulfide bond'
      options.setStatus(`Annotated ${plan.features.length} ${numbering.scheme.toUpperCase()} ${numbering.vhh?.subtype === 'VHH' ? 'VHH ' : ''}features${bondMessage}.`)
    } catch (error) {
      options.setStatus(error instanceof Error ? error.message : 'Could not annotate the immunoglobulin domain.')
    }
  }, [options])

  const annotateProteinDarpin = useCallback((detection: DarpinDetection) => {
    if (options.record.molecule !== 'protein' || !options.record.protein) return
    try {
      const plan = buildDarpinAnnotationPlan(options.record.sequence, detection)
      options.updateRecord((current) => replaceProteinAnnotations(
        current,
        replaceAutomaticDarpinAnnotations(current.features, plan),
        undefined,
        'annotateDarpin',
        `Annotated DARPin ${detection.format} modules and paratope residues`,
      ))
      options.setStatus(`Annotated ${plan.features.length} DARPin ${detection.format} features (${Math.round(detection.confidence * 100)}% confidence).`)
    } catch (error) {
      options.setStatus(error instanceof Error ? error.message : 'Could not annotate the DARPin domain.')
    }
  }, [options])

  const annotateProteinScfv = useCallback((detection: ScfvDetection) => {
    if (options.record.molecule !== 'protein' || !options.record.protein) return
    try {
      const plan = buildScfvAnnotationPlan(options.record.sequence, detection)
      options.updateRecord((current) => {
        const replacement = replaceAutomaticScfvAnnotations(current.features, current.protein?.bonds ?? [], plan)
        return replaceProteinAnnotations(current, replacement.features, replacement.bonds, 'annotateScfv', `Annotated scFv ${detection.orientation} domains, linker, and bonds`)
      })
      options.setStatus(`Annotated ${plan.features.length} scFv ${detection.orientation} features and ${plan.bonds.length} disulfide bond${plan.bonds.length === 1 ? '' : 's'} (${Math.round(detection.confidence * 100)}% confidence).`)
    } catch (error) {
      options.setStatus(error instanceof Error ? error.message : 'Could not annotate the scFv.')
    }
  }, [options])

  const annotateProteinTcr = useCallback((numbering: TcrNumbering) => {
    if (options.record.molecule !== 'protein' || !options.record.protein) return
    try {
      const plan = buildTcrAnnotationPlan(options.record.sequence, numbering)
      options.updateRecord((current) => {
        const replacement = replaceAutomaticTcrAnnotations(current.features, current.protein?.bonds ?? [], plan)
        return replaceProteinAnnotations(current, replacement.features, replacement.bonds, 'annotateTcr', `Annotated IMGT TCR ${numbering.chain} FR/CDR regions and bonds`)
      })
      options.setStatus(`Annotated ${plan.features.length} IMGT TCR features${plan.missingCanonicalBond ? '; the canonical cysteine pair was not present' : ' and the canonical V-domain disulfide bond'}.`)
    } catch (error) {
      options.setStatus(error instanceof Error ? error.message : 'Could not annotate the TCR domain.')
    }
  }, [options])

  const annotateProteinVnar = useCallback((detection: VnarDetection) => {
    if (options.record.molecule !== 'protein' || !options.record.protein) return
    try {
      const plan = buildVnarAnnotationPlan(options.record.sequence, detection)
      options.updateRecord((current) => {
        const replacement = replaceAutomaticVnarAnnotations(current.features, current.protein?.bonds ?? [], plan)
        return replaceProteinAnnotations(current, replacement.features, replacement.bonds, 'annotateVnar', `Annotated VNAR type ${detection.vnarType} FR/HV/CDR regions and bonds`)
      })
      const extraBonds = plan.bonds.length - (plan.missingCanonicalBond ? 0 : 1)
      options.setStatus(`Annotated ${plan.features.length} VNAR type ${detection.vnarType} features${plan.missingCanonicalBond ? '; the canonical cysteine pair was not present' : ' and the canonical FR1–FR3 disulfide'}${extraBonds > 0 ? ` plus ${extraBonds} type-specific disulfide${extraBonds === 1 ? '' : 's'}` : ''}.`)
    } catch (error) {
      options.setStatus(error instanceof Error ? error.message : 'Could not annotate the VNAR domain.')
    }
  }, [options])

  const annotateProteinBinder = useCallback((numbering: BinderNumbering) => {
    if (numbering.kind === 'immunoglobulin') return annotateProteinImmunoglobulin(numbering.data)
    if (numbering.kind === 'scfv') return annotateProteinScfv(numbering.data)
    if (numbering.kind === 'tcr') return annotateProteinTcr(numbering.data)
    if (numbering.kind === 'vnar') return annotateProteinVnar(numbering.data)
    return annotateProteinDarpin(numbering.data)
  }, [annotateProteinDarpin, annotateProteinImmunoglobulin, annotateProteinScfv, annotateProteinTcr, annotateProteinVnar])

  const annotateAutoProteinBinder = useCallback((scheme?: 'imgt' | 'kabat') => {
    void (async () => {
      try {
        const structure = await detectBinderStructure(options.record.sequence)
        const numbering = await applyBinderNumbering(options.record.sequence, structure, scheme)
        annotateProteinBinder(numbering)
      } catch (error) {
        options.setStatus(error instanceof Error ? error.message : 'Could not detect and annotate the protein binder.')
      }
    })()
  }, [annotateProteinBinder, options])

  return {
    annotateProteinBinder,
    annotateProteinImmunoglobulin,
    annotateProteinDarpin,
    annotateProteinScfv,
    annotateProteinTcr,
    annotateProteinVnar,
    annotateAutoProteinBinder,
  }
}
