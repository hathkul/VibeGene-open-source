import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { ChevronDown, ChevronRight, ExternalLink } from 'lucide-react'
import { saveTextAs } from '../desktop/fileIo'
import { sgRnaOligoDirectionFromName } from '../domain/annealedOligos'
import { sgRnaHistoryOligosTsv, uniqueSgRnaHistoryOligos } from '../domain/sgrnaCloning'
import { CloningRecipeDialog } from '../CloningRecipeDialog'
import { LazyPcrRecipeDialog } from './LazyPcrRecipeDialog'
import { cloningRecipePartsFromHistory, historyJunctionsAreBlunt, recipeFragmentLength } from '../domain/cloningRecipe'
import { pcrRecipeContextFromHistory, historyNodeHasPcrRecipe } from '../domain/pcrRecipe'
import { readAppPreferences } from '../domain/appPreferences'
import {
  contributionGeometry,
  digestEnzymeNamesFromHistorySummary,
  enzymeLabel,
  isNamedEnzyme,
  parentSummaries,
  roleLabel,
  type HistoryCutSite,
  type HistoryRegion,
} from '../domain/historyContribution'
import {
  expandNextHistoryGenerations,
  initialCollapsedHistoryIds,
} from '../domain/historyTreeExpansion'
import { historyMinimapScrollPosition } from '../domain/historyMinimap'
import type { HistoryInputSummary, HistoryNode, HistoryOligo } from '../domain/types'

type OperationMeta = {
  label: string
  className: string
}

type HistoryMinimapNode = {
  id: string
  x: number
  y: number
  width: number
  height: number
}

type HistoryMinimapMetrics = {
  contentWidth: number
  contentHeight: number
  viewportWidth: number
  viewportHeight: number
  scrollLeft: number
  scrollTop: number
  nodes: HistoryMinimapNode[]
}

const HISTORY_MINIMAP_WIDTH = 300
const HISTORY_MINIMAP_HEIGHT = 156
const HISTORY_MINIMAP_PADDING = 6

const operationMeta: Record<string, OperationMeta> = {
  amplifyFragment: { label: 'PCR amplification', className: 'op-pcr' },
  overlapFragments: { label: 'Overlap-extension PCR', className: 'op-pcr' },
  overlapAndAmplify: { label: 'Overlap-extension PCR', className: 'op-pcr' },
  mutate: { label: 'Mutagenesis', className: 'op-clone' },
  insertFragment: { label: 'Insert fragment', className: 'op-clone' },
  insertFragments: { label: 'Insert fragments', className: 'op-clone' },
  ligateFragments: { label: 'Ligate fragments', className: 'op-clone' },
  gibsonAssembly: { label: 'Gibson assembly', className: 'op-clone' },
  taCloning: { label: 'TA cloning', className: 'op-clone' },
  gcCloning: { label: 'GC cloning', className: 'op-clone' },
  gatewayBp: { label: 'Gateway BP cloning', className: 'op-clone' },
  gatewayLr: { label: 'Gateway LR cloning', className: 'op-clone' },
  deleteFragment: { label: 'Delete fragment', className: 'op-clone' },
  destroySite: { label: 'Destroy restriction site', className: 'op-clone' },
  insert: { label: 'Insert bases', className: 'op-edit' },
  cloneSgRNA: { label: 'Clone sgRNA', className: 'op-clone' },
  cloneSgRNALibrary: { label: 'Create sgRNA cloning library', className: 'op-clone' },
  cloneLibrary: { label: 'Create cloning library', className: 'op-clone' },
  annealOligos: { label: 'Annealed oligos', className: 'op-clone' },
  remove: { label: 'Delete bases', className: 'op-edit' },
  replace: { label: 'Replace bases', className: 'op-edit' },
  flip: { label: 'Reverse-complement', className: 'op-edit' },
  editDNAEnds: { label: 'Edit DNA ends', className: 'op-edit' },
  invalid: { label: 'Imported / original', className: 'op-source' },
}

function metaFor(operation: string): OperationMeta {
  return operationMeta[operation] ?? { label: operation, className: 'op-edit' }
}

/** Compact site chips shown on the connector from one parent up to the cloning event. */
function ParentEdgeLabel({
  summary,
  seqLen,
  onInspectDigest,
  onInspectPrimer,
  onInspectEnzyme,
}: {
  summary: HistoryInputSummary | undefined
  seqLen: number
  onInspectDigest?: (enzymeNames: string[]) => void
  onInspectPrimer: (oligo: HistoryOligo) => void
  onInspectEnzyme: (enzymeName: string) => void
}) {
  const { sites, region, role } = useMemo(() => contributionGeometry(summary, seqLen), [seqLen, summary])
  const hasCoordinateSites = sites.length > 0 && sites.every((site) => !isNamedEnzyme(site.name))
  const isBaseEdit = summary?.manipulation === 'insert' ||
    summary?.manipulation === 'remove' ||
    summary?.manipulation === 'replace' ||
    summary?.manipulation === 'edit' ||
    (role === 'other' && hasCoordinateSites)
  const roleText = roleLabel(role)
  const assemblyPart = summary?.assemblyPart
  const fragmentLength = useMemo(
    () => assemblyPart?.length ?? recipeFragmentLength(role, region, seqLen),
    [assemblyPart, region, role, seqLen],
  )
  const digestEnzymes = useMemo(() => digestEnzymeNamesFromHistorySummary(summary), [summary])
  const canOpenDigestGel = Boolean(onInspectDigest) && digestEnzymes.length > 0
  if (!summary?.manipulation && sites.length === 0) return null

  const flipped = summary?.manipulation === 'flipAndInsert' || assemblyPart?.orientation === 'reverse'
  const showEnzymeSites =
    sites.length > 0 &&
    summary?.manipulation !== 'amplify' &&
    summary?.manipulation !== 'overlapAndAmplify' &&
    summary?.manipulation !== 'insertAt'

  return (
    <div
      className={`hedge-parent${role ? ` is-${role}` : ''}${isBaseEdit ? ' is-base-edit' : ''}${canOpenDigestGel ? ' is-digest' : ''}`}
      title={
        canOpenDigestGel
          ? `${[roleText, digestEnzymes.join(' + ')].filter(Boolean).join(' ')} — double-click for agarose gel`
          : undefined
      }
      onDoubleClick={
        canOpenDigestGel
          ? (event) => {
              event.stopPropagation()
              onInspectDigest?.(digestEnzymes)
            }
          : undefined
      }
    >
      {roleText ? <span className="hedge-parent-role">{roleText}</span> : null}
      {flipped ? <span className="hedge-parent-note">flipped</span> : null}
      {assemblyPart ? (
        <>
          <span className="hedge-parent-range">
            {assemblyPart.linearization.method === 'pcr' ? 'PCR'
              : assemblyPart.linearization.method === 'restriction' ? 'Restriction digest'
                : 'Used directly'}
          </span>
          {assemblyPart.linearization.method === 'pcr' && (
            <div className="hedge-parent-sites">
              {[assemblyPart.linearization.forwardPrimer, assemblyPart.linearization.reversePrimer].map((primer, index) => (
                <button key={`${primer.name}-${index}`} type="button" className="hedge-parent-site is-primer"
                  title={`${primer.name} — double-click or press Enter for primer properties`}
                  onClick={(event) => { if (event.detail === 0) { event.stopPropagation(); onInspectPrimer(primer) } }}
                  onDoubleClick={(event) => { event.stopPropagation(); onInspectPrimer(primer) }}>
                  {primer.name}
                </button>
              ))}
            </div>
          )}
          {assemblyPart.linearization.method === 'restriction' && digestEnzymes.length > 0 && (
            <div className="hedge-parent-sites">
              {digestEnzymes.map((name) => (
                <button key={name} type="button" className="hedge-parent-site is-enzyme"
                  title={`${name} — double-click or press Enter for enzyme database`}
                  onClick={(event) => { if (event.detail === 0) { event.stopPropagation(); onInspectEnzyme(name) } }}
                  onDoubleClick={(event) => { event.stopPropagation(); onInspectEnzyme(name) }}>
                  {name}
                </button>
              ))}
            </div>
          )}
        </>
      ) : summary?.manipulation === 'gibson' ? (
        <span className="hedge-parent-range">Preparation not recorded</span>
      ) : null}
      {showEnzymeSites ? (
        <div className="hedge-parent-sites">
          {sites.map((site, index) => (
            <span
              key={`${site.name}-${site.position}-${index}`}
              className={`hedge-parent-site${isNamedEnzyme(site.name) ? ' is-enzyme' : ''}`}
            >
              {site.name}
            </span>
          ))}
        </div>
      ) : null}
      {summary?.manipulation === 'insertAt' && sites[0] ? (
        <span className="hedge-parent-range">
          at <span className={`hedge-parent-site${isNamedEnzyme(sites[0].name) ? ' is-enzyme is-inline' : ''}`}>{sites[0].name}</span>
        </span>
      ) : null}
      {(summary?.manipulation === 'amplify' || summary?.manipulation === 'overlapAndAmplify') &&
      sites.length === 2 ? (
        <span className="hedge-parent-range">
          {(sites[0]!.position + 1).toLocaleString()}–{(sites[1]!.position + 1).toLocaleString()}
        </span>
      ) : null}
      {fragmentLength !== null && fragmentLength > 0 ? (
        <span className="hedge-parent-length">{fragmentLength.toLocaleString()} bp</span>
      ) : null}
    </div>
  )
}

/** Shared operation badge between product and its parents (no per-parent cloning details). */
function OperationInfo({
  node,
  onInspectPrimer,
  onInspectEnzyme,
  onInspectCloningRecipe,
  onInspectPcrRecipe,
  onInspectSgRnaOligos,
  onInspectLibraryCloningRecipes,
}: {
  node: HistoryNode
  onInspectPrimer: (oligo: HistoryOligo) => void
  onInspectEnzyme: (enzymeName: string) => void
  onInspectCloningRecipe: (node: HistoryNode) => void
  onInspectPcrRecipe: (node: HistoryNode) => void
  onInspectSgRnaOligos: (node: HistoryNode) => void
  onInspectLibraryCloningRecipes?: () => void
}) {
  const meta = metaFor(node.operation)
  const namedSites = useMemo(
    () => [...new Set(node.regeneratedSites.map((s) => s.name).filter((name) => name && !name.startsWith('<')))],
    [node.regeneratedSites],
  )

  // Fallback detail lines only for single-parent edits that have no per-edge geometry.
  const fallbackLines = useMemo(() => {
    if (node.children.length > 1) return [] as Array<{ key: string; text: string; enzymeName?: string }>
    if (
      node.operation === 'mutate' ||
      node.operation === 'insertFragment' ||
      node.operation === 'insertFragments' ||
      node.operation === 'ligateFragments' ||
      node.operation === 'deleteFragment' ||
      node.operation === 'destroySite'
    ) {
      return [] as Array<{ key: string; text: string; enzymeName?: string }>
    }
    const result: Array<{ key: string; text: string; enzymeName?: string }> = []
    for (const summary of node.inputSummaries) {
      if (!summary.manipulation) continue
      if (summary.manipulation === 'amplify' || summary.manipulation === 'overlapAndAmplify') continue
      if (summary.manipulation === 'replace' || summary.manipulation === 'insert' || summary.manipulation === 'flipAndInsert') {
        continue
      }
      if (summary.manipulation === 'insertAt' && summary.val1 !== undefined) {
        const name = enzymeLabel(summary.name1, '')
        if (name && isNamedEnzyme(name)) {
          result.push({ key: `insert-at-${name}`, text: `Insert at ${name}`, enzymeName: name })
        } else {
          result.push({
            key: `insert-at-${summary.val1}`,
            text: `Insert at ${(Number(summary.val1)).toLocaleString()}`,
          })
        }
      } else if (summary.manipulation === 'remove' && summary.val1 !== undefined && summary.val2 !== undefined) {
        const start = Number(summary.val1)
        const end = Number(summary.val2)
        result.push({
          key: `delete-${start}-${end}`,
          text: end >= start ? `Delete ${start.toLocaleString()}..${end.toLocaleString()}` : `Delete ${start.toLocaleString()}`,
        })
      } else if (summary.manipulation === 'edit') {
        result.push({ key: 'edit-ends', text: 'Edit DNA ends' })
      }
    }
    if (node.polymerase) result.push({ key: `pol-${node.polymerase}`, text: node.polymerase })
    const seen = new Set<string>()
    return result.filter((line) => {
      if (seen.has(line.key)) return false
      seen.add(line.key)
      return true
    })
  }, [node])

  const recipeParts = cloningRecipePartsFromHistory(node)
  const hasPcrRecipe = historyNodeHasPcrRecipe(node)
  const hasLibraryRecipes = (node.operation === 'cloneLibrary' || node.operation === 'cloneSgRNALibrary')
    && Boolean(onInspectLibraryCloningRecipes)
  const recipeTitle = hasLibraryRecipes
    ? `${meta.label} — double-click to choose cloning recipes`
    : recipeParts
    ? `${meta.label} — double-click for cloning recipe`
    : hasPcrRecipe
      ? `${meta.label} — double-click for PCR recipe`
      : undefined

  return (
    <div className="hop">
      {recipeParts || hasPcrRecipe || hasLibraryRecipes ? (
        <button
          type="button"
          className={`hop-label ${meta.className}`}
          title={recipeTitle}
          onDoubleClick={(event) => {
            event.stopPropagation()
            if (hasLibraryRecipes) onInspectLibraryCloningRecipes?.()
            else if (recipeParts) onInspectCloningRecipe(node)
            else onInspectPcrRecipe(node)
          }}
        >
          {meta.label}
        </button>
      ) : (
        <span className={`hop-label ${meta.className}`}>{meta.label}</span>
      )}
      {node.oligos.length > 0 && (
        <div className="hop-primers">
          {node.oligos.map((oligo, index) => (
            <button
              key={`${oligo.name}-${index}`}
              type="button"
              className="hop-primer"
              title={`${oligo.name} — double-click for primer properties`}
              onDoubleClick={() => onInspectPrimer(oligo)}
            >
              {oligo.name}
            </button>
          ))}
        </div>
      )}
      {node.sgRnaCloning && (
        <button type="button" className="hop-primer hop-sgrna-oligos" onClick={() => onInspectSgRnaOligos(node)}>
          View oligos ({uniqueSgRnaHistoryOligos(node.sgRnaCloning.oligos).length})
        </button>
      )}
      {namedSites.length > 0 && (
        <div className="hop-regen">
          <span className="hop-regen-label">Regenerated</span>
          {namedSites.map((name) =>
            isNamedEnzyme(name) ? (
              <button
                key={name}
                type="button"
                className="hop-regen-site is-enzyme"
                title={`${name} — double-click for enzyme database`}
                onDoubleClick={() => onInspectEnzyme(name)}
              >
                {name}
              </button>
            ) : (
              <span key={name} className="hop-regen-site">
                {name}
              </span>
            ),
          )}
        </div>
      )}
      {fallbackLines.map((line) =>
        line.enzymeName ? (
          <button
            key={line.key}
            type="button"
            className="hop-detail is-enzyme"
            title={`${line.enzymeName} — double-click for enzyme database`}
            onDoubleClick={() => onInspectEnzyme(line.enzymeName!)}
          >
            {line.text}
          </button>
        ) : (
          <span key={line.key} className="hop-detail">
            {line.text}
          </span>
        ),
      )}
    </div>
  )
}

function estimateSiteLabelWidth(name: string) {
  // 9px bold sans — enough slack so leaders don't collide with the card body.
  return Math.ceil(name.length * 5.6 + 4)
}

const CIRCULAR_SITE_LABEL_HALF_HEIGHT = 7
/** Tangential stagger when two cut-site labels would otherwise collide (MCS). */
const CIRCULAR_SITE_STAGGER_PX = 11

function circularLabelTextAnchor(angle: number): 'start' | 'middle' | 'end' {
  const cos = Math.cos(angle)
  if (cos > 0.25) return 'start'
  if (cos < -0.25) return 'end'
  return 'middle'
}

/**
 * When cloning cut sites sit close together (e.g. MCS), push labels apart along
 * the local tangent so their names stay readable.
 */
function staggerCircularSiteOffsets(
  sites: HistoryCutSite[],
  seqLen: number,
  labelRadius: number,
): number[] {
  const offsets = sites.map(() => 0)
  if (sites.length < 2 || seqLen <= 0) return offsets

  const order = sites
    .map((site, index) => ({
      index,
      angle: (site.position / seqLen) * Math.PI * 2 - Math.PI / 2,
      width: estimateSiteLabelWidth(site.name),
    }))
    .sort((a, b) => a.angle - b.angle)

  const pairNeedsStagger = (a: (typeof order)[number], b: (typeof order)[number]) => {
    let delta = Math.abs(b.angle - a.angle)
    if (delta > Math.PI) delta = Math.PI * 2 - delta
    const chord = 2 * labelRadius * Math.sin(delta / 2)
    // Labels collide when their centers are closer than combined half-heights,
    // with a little width slack for similarly-anchored names.
    const minClearance = CIRCULAR_SITE_LABEL_HALF_HEIGHT * 2 + 4
    return chord < Math.max(minClearance, Math.min(a.width, b.width) * 0.35)
  }

  for (let i = 0; i < order.length; i += 1) {
    const a = order[i]!
    const b = order[(i + 1) % order.length]!
    if (order.length === 2 && i === 1) break
    if (!pairNeedsStagger(a, b)) continue
    // Opposite tangential offsets: earlier (CCW order) goes one way, next the other.
    if (offsets[a.index] === 0) offsets[a.index] = -CIRCULAR_SITE_STAGGER_PX
    if (offsets[b.index] === 0) offsets[b.index] = CIRCULAR_SITE_STAGGER_PX
    // If a site is already staggered from a previous neighbor, push the next further out.
    if (offsets[a.index] !== 0 && offsets[b.index] === offsets[a.index]) {
      offsets[b.index] = -offsets[a.index]
    }
  }

  // Two-site MCS: always mirror if still overlapping after the pass above.
  if (sites.length === 2 && offsets[0] === 0 && offsets[1] === 0) {
    const a = order[0]!
    const b = order[1]!
    if (pairNeedsStagger(a, b)) {
      offsets[a.index] = -CIRCULAR_SITE_STAGGER_PX
      offsets[b.index] = CIRCULAR_SITE_STAGGER_PX
    }
  }

  return offsets
}

function ConstructGlyph({
  node,
  cutSites = [],
  region = null,
  onInspectEnzyme,
}: {
  node: HistoryNode
  cutSites?: HistoryCutSite[]
  region?: HistoryRegion | null
  onInspectEnzyme?: (enzymeName: string) => void
}) {
  const hasSites = cutSites.length > 0 || Boolean(region)
  const size = hasSites ? 132 : 86
  const center = size / 2
  const seqLen = Math.max(1, node.seqLen)
  const features = useMemo(() => node.features.slice(0, 48), [node.features])
  const regionClass = region ? `is-${region.kind}` : ''

  if (node.circular) {
    const radius = hasSites ? center - 26 : center - 9
    const tickOuter = radius + 4
    const leaderEnd = radius + 11
    const labelRadius = radius + 18
    const point = (position: number, r: number) => {
      const angle = (position / seqLen) * Math.PI * 2 - Math.PI / 2
      return { x: center + Math.cos(angle) * r, y: center + Math.sin(angle) * r, angle }
    }
    const arc = (start: number, end: number, r: number) => {
      const from = point(start, r)
      const to = point(end, r)
      const span = end >= start ? end - start : seqLen - start + end
      const largeArc = span / seqLen > 0.5 ? 1 : 0
      return `M ${from.x} ${from.y} A ${r} ${r} 0 ${largeArc} 1 ${to.x} ${to.y}`
    }

    const tangentOffsets = staggerCircularSiteOffsets(cutSites, seqLen, labelRadius)
    const placed = cutSites.map((site, index) => {
      const inner = point(site.position, radius - 1)
      const outer = point(site.position, tickOuter)
      const base = point(site.position, labelRadius)
      const leaderBase = point(site.position, leaderEnd)
      const tangentOffset = tangentOffsets[index] ?? 0
      // Tangential unit (perpendicular to radial) — “up/down” when sites sit on left/right.
      const tx = -Math.sin(base.angle)
      const ty = Math.cos(base.angle)
      const labelX = base.x + tx * tangentOffset
      const labelY = base.y + ty * tangentOffset
      const leaderX = leaderBase.x + tx * tangentOffset * 0.65
      const leaderY = leaderBase.y + ty * tangentOffset * 0.65
      const textAnchor = circularLabelTextAnchor(base.angle)
      return { site, index, inner, outer, labelX, labelY, leaderX, leaderY, textAnchor, angle: base.angle }
    })

    let padLeft = 0
    let padRight = 0
    let padTop = 0
    let padBottom = 0
    for (const label of placed) {
      const cos = Math.cos(label.angle)
      const sin = Math.sin(label.angle)
      const labelWidth = estimateSiteLabelWidth(label.site.name)
      const textLeft =
        label.textAnchor === 'start'
          ? label.labelX
          : label.textAnchor === 'end'
            ? label.labelX - labelWidth
            : label.labelX - labelWidth / 2
      const textRight = textLeft + labelWidth
      padLeft = Math.max(padLeft, -textLeft)
      padRight = Math.max(padRight, textRight - size)
      padTop = Math.max(padTop, -(label.labelY - CIRCULAR_SITE_LABEL_HALF_HEIGHT))
      padBottom = Math.max(padBottom, label.labelY + CIRCULAR_SITE_LABEL_HALF_HEIGHT - size)
      if (cos > 0.25) padRight = Math.max(padRight, 6)
      if (cos < -0.25) padLeft = Math.max(padLeft, 6)
      if (sin < -0.55) padTop = Math.max(padTop, 4)
      if (sin > 0.55) padBottom = Math.max(padBottom, 4)
    }
    padLeft = Math.ceil(padLeft)
    padRight = Math.ceil(padRight)
    padTop = Math.ceil(padTop)
    padBottom = Math.ceil(padBottom)
    const svgWidth = size + padLeft + padRight
    const svgHeight = size + padTop + padBottom
    const wide = padLeft + padRight > 0

    return (
      <svg
        className={`history-glyph${hasSites ? ' has-sites' : ''}${wide ? ' is-padded' : ''}`}
        width={svgWidth}
        height={svgHeight}
        viewBox={`${-padLeft} ${-padTop} ${svgWidth} ${svgHeight}`}
        aria-hidden
      >
        <circle className="history-glyph-backbone" cx={center} cy={center} r={radius} />
        {region ? <path className={`history-glyph-region ${regionClass}`} d={arc(region.start, region.end, radius)} /> : null}
        {features.flatMap((feature, featureIndex) =>
          feature.segments.map((segment, segmentIndex) => (
            <path key={`${featureIndex}-${segmentIndex}`} d={arc(segment.start, segment.end, radius)} stroke={feature.color} />
          )),
        )}
        {placed.map((label) => (
          <g key={`${label.site.name}-${label.site.position}-${label.index}`} className="history-glyph-site">
            <line
              className="history-glyph-tick"
              x1={label.inner.x}
              y1={label.inner.y}
              x2={label.outer.x}
              y2={label.outer.y}
            />
            <line
              className="history-glyph-leader"
              x1={label.outer.x}
              y1={label.outer.y}
              x2={label.leaderX}
              y2={label.leaderY}
            />
            <text
              x={label.labelX}
              y={label.labelY}
              textAnchor={label.textAnchor}
              dominantBaseline="middle"
              className={isNamedEnzyme(label.site.name) && onInspectEnzyme ? 'is-enzyme' : undefined}
              style={isNamedEnzyme(label.site.name) && onInspectEnzyme ? { cursor: 'pointer' } : undefined}
              onDoubleClick={
                isNamedEnzyme(label.site.name) && onInspectEnzyme
                  ? (event) => {
                      event.stopPropagation()
                      onInspectEnzyme(label.site.name)
                    }
                  : undefined
              }
            >
              {label.site.name}
            </text>
          </g>
        ))}
      </svg>
    )
  }

  const left = hasSites ? 18 : 7
  const right = size - (hasSites ? 18 : 7)
  const width = right - left
  const baseline = center
  const scale = (position: number) => left + (position / seqLen) * width

  let padLeft = 0
  let padRight = 0
  let padTop = 0
  let padBottom = 0
  cutSites.forEach((site, index) => {
    const x = scale(site.position)
    const labelWidth = estimateSiteLabelWidth(site.name)
    const labelAbove = index % 2 === 0
    padLeft = Math.max(padLeft, labelWidth / 2 - x)
    padRight = Math.max(padRight, x + labelWidth / 2 - size)
    if (labelAbove) padTop = Math.max(padTop, 18)
    else padBottom = Math.max(padBottom, 18)
  })
  padLeft = Math.ceil(padLeft)
  padRight = Math.ceil(padRight)
  padTop = Math.ceil(padTop)
  padBottom = Math.ceil(padBottom)
  const svgWidth = size + padLeft + padRight
  const svgHeight = size + padTop + padBottom

  return (
    <svg
      className={`history-glyph${hasSites ? ' has-sites' : ''}${padLeft + padRight > 0 ? ' is-padded' : ''}`}
      width={svgWidth}
      height={svgHeight}
      viewBox={`${-padLeft} ${-padTop} ${svgWidth} ${svgHeight}`}
      aria-hidden
    >
      <line className="history-glyph-backbone" x1={left} y1={baseline} x2={right} y2={baseline} />
      {region ? (
        <line
          className={`history-glyph-region ${regionClass}`}
          x1={scale(region.start)}
          y1={baseline}
          x2={scale(region.end)}
          y2={baseline}
        />
      ) : null}
      {features.flatMap((feature, featureIndex) =>
        feature.segments.map((segment, segmentIndex) => (
          <line
            key={`${featureIndex}-${segmentIndex}`}
            x1={scale(segment.start)}
            y1={baseline}
            x2={scale(segment.end)}
            y2={baseline}
            stroke={feature.color}
          />
        )),
      )}
      {cutSites.map((site, index) => {
        const x = scale(site.position)
        const labelAbove = index % 2 === 0
        return (
          <g key={`${site.name}-${site.position}-${index}`} className="history-glyph-site">
            <line x1={x} y1={baseline - 7} x2={x} y2={baseline + 7} />
            <text
              x={x}
              y={labelAbove ? baseline - 14 : baseline + 16}
              textAnchor="middle"
              dominantBaseline="middle"
              className={isNamedEnzyme(site.name) && onInspectEnzyme ? 'is-enzyme' : undefined}
              style={isNamedEnzyme(site.name) && onInspectEnzyme ? { cursor: 'pointer' } : undefined}
              onDoubleClick={
                isNamedEnzyme(site.name) && onInspectEnzyme
                  ? (event) => {
                      event.stopPropagation()
                      onInspectEnzyme(site.name)
                    }
                  : undefined
              }
            >
              {site.name}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

function hasDecodedSequence(node: HistoryNode): boolean {
  return typeof node.sequence === 'string' && node.sequence.length > 0
}

function HistoryBranch({
  node,
  isRoot = false,
  contribution,
  collapsedIds,
  onToggle,
  onOpenConstruct,
  onInspectPrimer,
  onInspectEnzyme,
  onInspectCloningRecipe,
  onInspectPcrRecipe,
  onInspectSgRnaOligos,
  onInspectLibraryCloningRecipes,
  onInspectRestrictionDigest,
}: {
  node: HistoryNode
  isRoot?: boolean
  /** How this construct contributed to the product above (from that product's InputSummary). */
  contribution?: HistoryInputSummary
  collapsedIds: Set<string>
  onToggle: (id: string) => void
  onOpenConstruct: (node: HistoryNode) => void
  onInspectPrimer: (oligo: HistoryOligo) => void
  onInspectEnzyme: (enzymeName: string) => void
  onInspectCloningRecipe: (node: HistoryNode) => void
  onInspectPcrRecipe: (node: HistoryNode) => void
  onInspectSgRnaOligos: (node: HistoryNode) => void
  onInspectLibraryCloningRecipes?: () => void
  onInspectRestrictionDigest?: (node: HistoryNode, enzymeNames: string[]) => void
}) {
  const hasParents = node.children.length > 0
  const collapsed = collapsedIds.has(node.id)
  const showParents = hasParents && !collapsed
  const sequenceUndecoded = !isRoot && !hasDecodedSequence(node)
  const geometry = useMemo(() => contributionGeometry(contribution, node.seqLen), [contribution, node.seqLen])
  const summaries = useMemo(() => (showParents ? parentSummaries(node) : []), [node, showParents])

  const childBranches: ReactNode = showParents ? (
    <ul className={`hparents ${node.children.length > 1 ? 'is-multi' : 'is-single'}`}>
      {node.children.map((child, index) => (
        <HistoryBranch
          key={`${child.id}-${index}`}
          node={child}
          contribution={summaries[index]}
          collapsedIds={collapsedIds}
          onToggle={onToggle}
          onOpenConstruct={onOpenConstruct}
          onInspectPrimer={onInspectPrimer}
          onInspectEnzyme={onInspectEnzyme}
          onInspectCloningRecipe={onInspectCloningRecipe}
          onInspectPcrRecipe={onInspectPcrRecipe}
          onInspectSgRnaOligos={onInspectSgRnaOligos}
          onInspectLibraryCloningRecipes={onInspectLibraryCloningRecipes}
          onInspectRestrictionDigest={onInspectRestrictionDigest}
        />
      ))}
    </ul>
  ) : null

  return (
    <li className={`hbranch${contribution ? ' has-contribution' : ''}`}>
      {contribution ? (
        <ParentEdgeLabel
          summary={contribution}
          seqLen={node.seqLen}
          onInspectPrimer={onInspectPrimer}
          onInspectEnzyme={onInspectEnzyme}
          onInspectDigest={
            onInspectRestrictionDigest
              ? (enzymeNames) => onInspectRestrictionDigest(node, enzymeNames)
              : undefined
          }
        />
      ) : null}
      <div
        className={`hcard${node.operation === 'invalid' ? ' is-source' : ''}${
          geometry.sites.length > 0 || geometry.region ? ' has-sites' : ''
        }`}
        data-history-node-id={node.id}
      >
        <ConstructGlyph
          node={node}
          cutSites={geometry.sites}
          region={geometry.region}
          onInspectEnzyme={onInspectEnzyme}
        />
        <div className="hcard-body">
          <button
            type="button"
            className={`hcard-name${sequenceUndecoded ? ' is-undecoded' : ''}`}
            title={
              sequenceUndecoded
                ? `${node.name} — sequence not decoded; bases unknown`
                : `Open ${node.name} in a new tab`
            }
            onClick={() => onOpenConstruct(node)}
          >
            {node.name}
            <ExternalLink size={12} />
          </button>
          <span className="hcard-meta">
            {node.seqLen.toLocaleString()} bp · {node.circular ? 'circular' : 'linear'}
          </span>
          {hasParents && (
            <button type="button" className="hcard-toggle" onClick={() => onToggle(node.id)}>
              {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
              {collapsed ? 'Show sources' : 'Hide sources'}
            </button>
          )}
        </div>
      </div>

      {(showParents || node.sgRnaCloning || node.operation === 'cloneLibrary' || node.operation === 'cloneSgRNALibrary') && (
        <>
          <div className="hedge">
            <span className="hedge-arrow" />
            <span className="hedge-line" />
            <OperationInfo
              node={node}
              onInspectPrimer={onInspectPrimer}
              onInspectEnzyme={onInspectEnzyme}
              onInspectCloningRecipe={onInspectCloningRecipe}
              onInspectPcrRecipe={onInspectPcrRecipe}
              onInspectSgRnaOligos={onInspectSgRnaOligos}
              onInspectLibraryCloningRecipes={onInspectLibraryCloningRecipes}
            />
          </div>
          {showParents && childBranches}
        </>
      )}
    </li>
  )
}

function visibleHistoryEdges(root: HistoryNode, visibleIds: ReadonlySet<string>) {
  const edges: Array<{ parentId: string; childId: string }> = []
  const visit = (node: HistoryNode) => {
    for (const child of node.children) {
      if (visibleIds.has(node.id) && visibleIds.has(child.id)) {
        edges.push({ parentId: node.id, childId: child.id })
      }
      visit(child)
    }
  }
  visit(root)
  return edges
}

function HistoryTreeMinimap({
  root,
  metrics,
  onNavigate,
}: {
  root: HistoryNode
  metrics: HistoryMinimapMetrics | null
  onNavigate: (left: number, top: number) => void
}) {
  const dragRef = useRef<{
    pointerId: number
    offsetX: number
    offsetY: number
  } | null>(null)
  const scale = metrics
    ? Math.min(
        (HISTORY_MINIMAP_WIDTH - HISTORY_MINIMAP_PADDING * 2) / Math.max(1, metrics.contentWidth),
        (HISTORY_MINIMAP_HEIGHT - HISTORY_MINIMAP_PADDING * 2) / Math.max(1, metrics.contentHeight),
      )
    : 1
  const contentWidth = (metrics?.contentWidth ?? 0) * scale
  const contentHeight = (metrics?.contentHeight ?? 0) * scale
  const offsetX = (HISTORY_MINIMAP_WIDTH - contentWidth) / 2
  const offsetY = (HISTORY_MINIMAP_HEIGHT - contentHeight) / 2
  const nodes = metrics?.nodes ?? []
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const edges = visibleHistoryEdges(root, new Set(byId.keys()))
  const projectX = (value: number) => offsetX + value * scale
  const projectY = (value: number) => offsetY + value * scale
  const pointerPosition = (event: ReactPointerEvent<SVGRectElement>) => {
    const svg = event.currentTarget.ownerSVGElement
    const rect = svg?.getBoundingClientRect()
    if (!rect?.width || !rect.height) return { x: 0, y: 0 }
    return {
      x: ((event.clientX - rect.left) / rect.width) * HISTORY_MINIMAP_WIDTH,
      y: ((event.clientY - rect.top) / rect.height) * HISTORY_MINIMAP_HEIGHT,
    }
  }
  const navigateFromPointer = (event: ReactPointerEvent<SVGRectElement>) => {
    const drag = dragRef.current
    if (!drag || !metrics || drag.pointerId !== event.pointerId) return
    const pointer = pointerPosition(event)
    const position = historyMinimapScrollPosition({
      pointerX: pointer.x,
      pointerY: pointer.y,
      contentOffsetX: offsetX,
      contentOffsetY: offsetY,
      scale,
      dragOffsetX: drag.offsetX,
      dragOffsetY: drag.offsetY,
      contentWidth: metrics.contentWidth,
      contentHeight: metrics.contentHeight,
      viewportWidth: metrics.viewportWidth,
      viewportHeight: metrics.viewportHeight,
    })
    onNavigate(position.left, position.top)
  }
  const startDragging = (event: ReactPointerEvent<SVGRectElement>) => {
    if (!metrics) return
    const pointer = pointerPosition(event)
    dragRef.current = {
      pointerId: event.pointerId,
      offsetX: (pointer.x - offsetX) / scale - metrics.scrollLeft,
      offsetY: (pointer.y - offsetY) / scale - metrics.scrollTop,
    }
    event.currentTarget.setPointerCapture?.(event.pointerId)
    event.preventDefault()
  }
  const stopDragging = (event: ReactPointerEvent<SVGRectElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return
    dragRef.current = null
    event.currentTarget.releasePointerCapture?.(event.pointerId)
  }

  return (
    <svg
      className="history-tree-minimap"
      viewBox={`0 0 ${HISTORY_MINIMAP_WIDTH} ${HISTORY_MINIMAP_HEIGHT}`}
      role="img"
      aria-label="History minimap"
    >
      <title>History minimap; outlined rectangle shows the visible area</title>
      {edges.map((edge) => {
        const parent = byId.get(edge.parentId)
        const child = byId.get(edge.childId)
        if (!parent || !child) return null
        return (
          <line
            key={`${edge.parentId}-${edge.childId}`}
            className="history-tree-minimap-edge"
            x1={projectX(parent.x + parent.width / 2)}
            y1={projectY(parent.y + parent.height)}
            x2={projectX(child.x + child.width / 2)}
            y2={projectY(child.y)}
          />
        )
      })}
      {nodes.map((node) => (
        <rect
          key={node.id}
          className="history-tree-minimap-node"
          x={projectX(node.x)}
          y={projectY(node.y)}
          width={Math.max(1.5, node.width * scale)}
          height={Math.max(1.5, node.height * scale)}
          rx={1}
        />
      ))}
      {metrics ? (
        <rect
          className="history-tree-minimap-viewport"
          x={projectX(metrics.scrollLeft)}
          y={projectY(metrics.scrollTop)}
          width={Math.min(contentWidth, metrics.viewportWidth * scale)}
          height={Math.min(contentHeight, metrics.viewportHeight * scale)}
          onPointerDown={startDragging}
          onPointerMove={navigateFromPointer}
          onPointerUp={stopDragging}
          onPointerCancel={stopDragging}
          onLostPointerCapture={() => { dragRef.current = null }}
        />
      ) : null}
    </svg>
  )
}

export function HistoryTreePane({
  root,
  libraryRecipeMembers = [],
  onOpenConstruct,
  onInspectPrimer,
  onInspectEnzyme,
  onInspectRestrictionDigest,
  onOpenAnnealedInsert,
}: {
  root: HistoryNode
  libraryRecipeMembers?: Array<{ id: string; name: string; history: HistoryNode }>
  onOpenConstruct: (node: HistoryNode) => void
  onInspectPrimer: (oligo: HistoryOligo) => void
  onInspectEnzyme: (enzymeName: string) => void
  onInspectRestrictionDigest?: (node: HistoryNode, enzymeNames: string[]) => void
  onOpenAnnealedInsert?: (node: HistoryNode, guideId: string) => void
}) {
  const defaultCollapsedIds = useMemo(() => initialCollapsedHistoryIds(root), [root])
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(
    () => new Set(defaultCollapsedIds),
  )
  const [expandGenerations, setExpandGenerations] = useState(1)
  const [minimapMetrics, setMinimapMetrics] = useState<HistoryMinimapMetrics | null>(null)
  const [cloningRecipeNode, setCloningRecipeNode] = useState<HistoryNode | null>(null)
  const [libraryRecipeSelection, setLibraryRecipeSelection] = useState<string[] | null>(null)
  const [libraryRecipeIds, setLibraryRecipeIds] = useState<string[] | null>(null)
  const [pcrRecipeNode, setPcrRecipeNode] = useState<HistoryNode | null>(null)
  const [sgRnaOligoNode, setSgRnaOligoNode] = useState<HistoryNode | null>(null)
  const [sgRnaOligoStatus, setSgRnaOligoStatus] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const cloningRecipeParts = cloningRecipeNode
    ? cloningRecipePartsFromHistory(cloningRecipeNode)
    : null
  const pcrRecipe = pcrRecipeNode
    ? pcrRecipeContextFromHistory(pcrRecipeNode, readAppPreferences().pcr)
    : null
  const listedSgRnaOligos = sgRnaOligoNode?.sgRnaCloning
    ? uniqueSgRnaHistoryOligos(sgRnaOligoNode.sgRnaCloning.oligos)
    : []
  const libraryRecipes = libraryRecipeIds
    ? libraryRecipeMembers.flatMap((member) => {
        if (!libraryRecipeIds.includes(member.id)) return []
        const parts = cloningRecipePartsFromHistory(member.history)
        return parts ? [{
          id: member.id,
          productName: member.name,
          parts,
          junctionsBlunt: historyJunctionsAreBlunt(member.history),
          linearLigation: member.history.operation === 'ligateFragments',
        }] : []
      })
    : []

  const toggle = (id: string) => {
    setCollapsedIds((previous) => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const expandAll = () => setCollapsedIds(new Set())
  const collapseToDefault = () => setCollapsedIds(new Set(defaultCollapsedIds))
  const expandNext = () => setCollapsedIds((previous) => (
    expandNextHistoryGenerations(root, previous, expandGenerations)
  ))
  const isCollapsedToDefault = collapsedIds.size === defaultCollapsedIds.size
    && [...defaultCollapsedIds].every((id) => collapsedIds.has(id))
  const navigateFromMinimap = (left: number, top: number) => {
    scrollRef.current?.scrollTo({ left, top, behavior: 'auto' })
  }

  useLayoutEffect(() => {
    const scroll = scrollRef.current
    if (!scroll) return
    let animationFrame = 0
    const measure = () => {
      const scrollRect = scroll.getBoundingClientRect()
      const nodes = [...scroll.querySelectorAll<HTMLElement>('[data-history-node-id]')]
        .map((element) => {
          const rect = element.getBoundingClientRect()
          return {
            id: element.dataset.historyNodeId!,
            x: rect.left - scrollRect.left + scroll.scrollLeft,
            y: rect.top - scrollRect.top + scroll.scrollTop,
            width: rect.width,
            height: rect.height,
          }
        })
      setMinimapMetrics({
        contentWidth: Math.max(1, scroll.scrollWidth),
        contentHeight: Math.max(1, scroll.scrollHeight),
        viewportWidth: scroll.clientWidth,
        viewportHeight: scroll.clientHeight,
        scrollLeft: scroll.scrollLeft,
        scrollTop: scroll.scrollTop,
        nodes,
      })
    }
    const updateViewport = () => setMinimapMetrics((previous) => previous ? {
      ...previous,
      viewportWidth: scroll.clientWidth,
      viewportHeight: scroll.clientHeight,
      scrollLeft: scroll.scrollLeft,
      scrollTop: scroll.scrollTop,
    } : previous)
    const schedule = (callback: () => void) => {
      window.cancelAnimationFrame(animationFrame)
      animationFrame = window.requestAnimationFrame(callback)
    }
    const scheduleMeasure = () => schedule(measure)
    const scheduleViewport = () => schedule(updateViewport)
    measure()
    scroll.addEventListener('scroll', scheduleViewport, { passive: true })
    window.addEventListener('resize', scheduleMeasure)
    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(scheduleMeasure)
    resizeObserver?.observe(scroll)
    const tree = scroll.querySelector('.htree')
    if (tree) resizeObserver?.observe(tree)
    return () => {
      window.cancelAnimationFrame(animationFrame)
      scroll.removeEventListener('scroll', scheduleViewport)
      window.removeEventListener('resize', scheduleMeasure)
      resizeObserver?.disconnect()
    }
  }, [collapsedIds, root])

  return (
    <div className="history-tree-pane">
      <div className="history-tree-toolbar">
        <button
          type="button"
          onClick={collapseToDefault}
          disabled={isCollapsedToDefault}
          title="Collapse history to the current construct and five parent generations"
        >
          Collapse
        </button>
        <button type="button" onClick={expandAll}>
          Expand all
        </button>
        <label className="history-tree-expand-generations">
          <span>Extra generations</span>
          <input
            type="number"
            aria-label="Extra history generations"
            min={1}
            step={1}
            value={expandGenerations}
            onChange={(event) => setExpandGenerations(
              Math.max(1, Math.floor(Number(event.target.value) || 1)),
            )}
          />
        </label>
        <button type="button" onClick={expandNext} disabled={collapsedIds.size === 0}>
          Expand next
        </button>
      </div>
      <HistoryTreeMinimap
        root={root}
        metrics={minimapMetrics}
        onNavigate={navigateFromMinimap}
      />
      <div className="history-tree-scroll" ref={scrollRef}>
        <ul className="htree">
          <HistoryBranch
            node={root}
            isRoot
            collapsedIds={collapsedIds}
            onToggle={toggle}
            onOpenConstruct={onOpenConstruct}
            onInspectPrimer={onInspectPrimer}
            onInspectEnzyme={onInspectEnzyme}
            onInspectCloningRecipe={setCloningRecipeNode}
            onInspectPcrRecipe={setPcrRecipeNode}
            onInspectSgRnaOligos={(node) => { setSgRnaOligoNode(node); setSgRnaOligoStatus('') }}
            onInspectLibraryCloningRecipes={libraryRecipeMembers.length
              ? () => setLibraryRecipeSelection(libraryRecipeMembers.map((member) => member.id))
              : undefined}
            onInspectRestrictionDigest={onInspectRestrictionDigest}
          />
        </ul>
      </div>
      {cloningRecipeNode && cloningRecipeParts ? (
        <CloningRecipeDialog
          productName={cloningRecipeNode.name}
          parts={cloningRecipeParts}
          junctionsBlunt={historyJunctionsAreBlunt(cloningRecipeNode)}
          linearLigation={cloningRecipeNode.operation === 'ligateFragments'}
          onClose={() => setCloningRecipeNode(null)}
        />
      ) : null}
      {libraryRecipeSelection ? (
        <div className="translation-dialog-backdrop" role="presentation" onPointerDown={() => setLibraryRecipeSelection(null)}>
          <div className="translation-dialog cloning-recipe-member-picker" role="dialog" aria-modal="true" aria-labelledby="cloning-recipe-member-picker-title" onPointerDown={(event) => event.stopPropagation()}>
            <h3 id="cloning-recipe-member-picker-title">Choose library-member recipes</h3>
            <p>Select the reactions to include. Each selected member will have its own recipe section.</p>
            <div className="cloning-recipe-member-list">
              {libraryRecipeMembers.map((member) => (
                <label key={member.id}>
                  <input
                    type="checkbox"
                    checked={libraryRecipeSelection.includes(member.id)}
                    onChange={(event) => setLibraryRecipeSelection((current) => current
                      ? event.target.checked ? [...current, member.id] : current.filter((id) => id !== member.id)
                      : current)}
                  />
                  <span>{member.name.replace(/\.dna$/i, '')}</span>
                </label>
              ))}
            </div>
            <div className="translation-dialog-footer">
              <button type="button" onClick={() => setLibraryRecipeSelection(null)}>Cancel</button>
              <button type="button" className="primary" disabled={!libraryRecipeSelection.length} onClick={() => {
                setLibraryRecipeIds(libraryRecipeSelection)
                setLibraryRecipeSelection(null)
              }}>Show recipes</button>
            </div>
          </div>
        </div>
      ) : null}
      {libraryRecipes.length ? (
        <CloningRecipeDialog
          productName={root.name}
          parts={libraryRecipes[0]!.parts}
          junctionsBlunt={libraryRecipes[0]!.junctionsBlunt}
          recipes={libraryRecipes}
          onClose={() => setLibraryRecipeIds(null)}
        />
      ) : null}
      {pcrRecipe ? (
        <LazyPcrRecipeDialog recipe={pcrRecipe} onClose={() => setPcrRecipeNode(null)} />
      ) : null}
      {sgRnaOligoNode?.sgRnaCloning ? (
        <div className="translation-dialog-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setSgRnaOligoNode(null)
        }}>
          <div className="translation-dialog restriction-cloning-dialog history-sgrna-oligos-dialog" role="dialog" aria-modal="true" aria-label="sgRNA cloning oligos">
            <header className="restriction-cloning-header"><h3>sgRNA cloning oligos</h3>
              <button type="button" className="history-sgrna-oligos-close" onClick={() => setSgRnaOligoNode(null)}>Close</button>
            </header>
            <div className="history-sgrna-oligos-body">
              <p>{sgRnaOligoNode.sgRnaCloning.guides.length} guide{sgRnaOligoNode.sgRnaCloning.guides.length === 1 ? '' : 's'} · vector {sgRnaOligoNode.sgRnaCloning.sourceVector.name} · {sgRnaOligoNode.sgRnaCloning.cloningChoice.label}</p>
              <div className="history-sgrna-oligos-list">
                {listedSgRnaOligos.map((oligo) => {
                  const isSense = sgRnaOligoDirectionFromName(oligo.name) === 'sense'
                  const hasAntisense = listedSgRnaOligos.some((candidate) => candidate.guideId === oligo.guideId && sgRnaOligoDirectionFromName(candidate.name) === 'antisense')
                  const openable = Boolean(onOpenAnnealedInsert && isSense && hasAntisense)
                  return (
                    <div key={`${oligo.guideId}:${oligo.sequence}:${oligo.modification}`} className="history-sgrna-oligo-row">
                      <span title={`${oligo.name} [${oligo.modification}]`}>{oligo.name} <small>[{oligo.modification}]</small></span>
                      <code title={oligo.sequence}>{oligo.sequence}</code>
                      <span className="history-sgrna-oligo-action">
                        {openable && (
                          <button type="button" className="history-sgrna-oligo-open" onClick={() => onOpenAnnealedInsert!(sgRnaOligoNode, oligo.guideId)}>
                            Open as sequence
                          </button>
                        )}
                      </span>
                    </div>
                  )
                })}
              </div>
              <div className="sgrna-cloning-source-actions">
                <button type="button" onClick={() => {
                  void navigator.clipboard.writeText(sgRnaHistoryOligosTsv(sgRnaOligoNode.sgRnaCloning!))
                    .then(() => setSgRnaOligoStatus('Copied order-ready oligos.'))
                    .catch(() => setSgRnaOligoStatus('Clipboard unavailable; use Export oligos.'))
                }}>Copy oligos</button>
                <button type="button" onClick={() => {
                  void saveTextAs(`sgRNA oligos for ${sgRnaOligoNode.name.replace(/\.dna$/i, '')}.txt`, sgRnaHistoryOligosTsv(sgRnaOligoNode.sgRnaCloning!), 'text/plain')
                    .then(() => setSgRnaOligoStatus('Oligo list exported.'))
                    .catch((error: unknown) => setSgRnaOligoStatus(error instanceof Error ? error.message : 'Export failed.'))
                }}>Export oligos…</button>
              </div>
              {sgRnaOligoStatus && <p role="status">{sgRnaOligoStatus}</p>}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
