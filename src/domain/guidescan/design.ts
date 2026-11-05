import {
  fetchGuideScanJobResultJson,
  fetchGuideScanSupported,
  pollGuideScanJob,
  submitGuideScanQuery,
} from './client'
import { fetchGuideScanGeneSequence, resolveGuideScanGeneSymbol } from './gene'
import { normalizeGuideScanResultJson } from './normalize'
import type {
  GuideScanAwaitOptions,
  GuideScanDesignRequest,
  GuideScanDesignResult,
  GuideScanGeneSequenceResult,
  GuideScanGeneSuggestion,
  GuideScanSubmitResult,
  GuideScanSupportedInfo,
} from './types'
import { GuideScanError } from './types'

export type GuideScanDesignSession = {
  request: GuideScanDesignRequest
  /** Canonical gene symbol used for GuideScan when kind === 'gene'. */
  resolvedGene?: GuideScanGeneSuggestion
  submit: GuideScanSubmitResult
}

/**
 * Validate / normalize a design request for UI consumption.
 * For gene mode, optionally resolve an exact canonical symbol via Ensembl first.
 */
export async function prepareGuideScanDesignRequest(
  request: GuideScanDesignRequest,
  options?: GuideScanAwaitOptions & {
    resolveGeneSymbol?: boolean
    resolvedGene?: GuideScanGeneSuggestion
  },
): Promise<GuideScanDesignRequest & { resolvedGene?: GuideScanGeneSuggestion }> {
  if (!request.organism.trim()) {
    throw new GuideScanError('invalid_request', 'Choose a GuideScan reference genome.')
  }
  if (!String(request.enzyme).trim()) {
    throw new GuideScanError('invalid_request', 'Choose a Cas enzyme supported by GuideScan2.')
  }

  if (request.kind === 'gene') {
    if (options?.resolveGeneSymbol === false && options.resolvedGene) {
      const resolvedGene = options.resolvedGene
      return {
        ...request,
        geneName: resolvedGene.symbol,
        queryText: request.queryText?.trim() || resolvedGene.entrezId || resolvedGene.symbol,
        resolvedGene,
      }
    }
    if (options?.resolveGeneSymbol !== false && !request.queryText?.trim()) {
      options?.onProgress?.(`Resolving gene ${request.geneName ?? ''}…`)
      const resolvedGene = await resolveGuideScanGeneSymbol(request.organism, request.geneName ?? '', options)
      const entrezNote = resolvedGene.entrezId ? ` (Entrez ${resolvedGene.entrezId})` : ''
      options?.onProgress?.(`Resolved gene ${resolvedGene.symbol}${entrezNote}`)
      return {
        ...request,
        geneName: resolvedGene.symbol,
        queryText: resolvedGene.entrezId || resolvedGene.symbol,
        resolvedGene,
      }
    }
  }
  return { ...request }
}

export async function startGuideScanDesign(
  request: GuideScanDesignRequest,
  options?: GuideScanAwaitOptions & {
    resolveGeneSymbol?: boolean
    resolvedGene?: GuideScanGeneSuggestion
  },
): Promise<GuideScanDesignSession> {
  const prepared = await prepareGuideScanDesignRequest(request, options)
  options?.onProgress?.('Submitting job to GuideScan2…')
  const submit = await submitGuideScanQuery(prepared, options)
  options?.onProgress?.(`Job accepted: ${submit.jobId}`)
  return {
    request: prepared,
    resolvedGene: prepared.resolvedGene,
    submit,
  }
}

export async function completeGuideScanDesign(
  session: GuideScanDesignSession,
  options?: GuideScanAwaitOptions,
): Promise<GuideScanDesignResult> {
  const status = await pollGuideScanJob(session.submit.jobId, options)
  if (status.status === 'completed') {
    options?.onProgress?.('Job completed')
  }
  options?.onProgress?.('Fetching results…')
  const raw = await fetchGuideScanJobResultJson(session.submit.jobId, options)
  const result = normalizeGuideScanResultJson(raw, {
    jobId: session.submit.jobId,
    organism: session.request.organism,
    enzyme: String(session.request.enzyme),
    resultType: status.resultType,
  })
  options?.onProgress?.(`Received ${result.guides.length} candidate guides`)
  return result
}

/**
 * Submit → poll → normalize in one call. Supports AbortSignal and overall timeout.
 */
export async function designGuidesWithGuideScan(
  request: GuideScanDesignRequest,
  options?: GuideScanAwaitOptions & { resolveGeneSymbol?: boolean },
): Promise<GuideScanDesignResult> {
  const session = await startGuideScanDesign(request, options)
  return completeGuideScanDesign(session, options)
}

export async function loadGuideScanCatalog(
  options?: GuideScanAwaitOptions,
): Promise<GuideScanSupportedInfo> {
  return fetchGuideScanSupported(options)
}

/**
 * Convenience for gene-name mode: open a new Vibegene sequence from Ensembl genomic DNA.
 */
export async function openGeneSequenceForGuideScan(
  organism: string,
  geneName: string,
  options?: GuideScanAwaitOptions & { includeAnnotations?: boolean; resolved?: GuideScanGeneSuggestion },
): Promise<GuideScanGeneSequenceResult> {
  return fetchGuideScanGeneSequence(organism, geneName, options)
}
