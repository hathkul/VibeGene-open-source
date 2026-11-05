import type { ComponentProps, ReactNode } from 'react'
import { AlignmentTraceFileList } from '../../components/AlignmentTraceFileList'
import { DnaComparisonSourceList } from '../../components/DnaComparisonPane'
import { ProteinMapPane, ProteinViewSidebar } from '../protein'
import { ViewSidebar } from '../dnaViewControls/ViewSidebar'
import { MapZoomStrip } from '../map/MapZoomStrip'
import { TrackMap } from '../map/TrackMap'
import { CircularMapStage } from '../map'
import type { DisplaySettings } from '../sequence'
import { selectWorkspaceMapVariant } from './workspaceMapViewModel'

type ProteinMapProps = {
  sidebar: ComponentProps<typeof ProteinViewSidebar>
  pane: ComponentProps<typeof ProteinMapPane>
}

type DnaMapProps = {
  sidebar: ComponentProps<typeof ViewSidebar>
  zoomStrip: ComponentProps<typeof MapZoomStrip> | null
  alignment: {
    comparative: ComponentProps<typeof DnaComparisonSourceList>
    trace: ComponentProps<typeof AlignmentTraceFileList>
    comparativeMode: boolean
    sidebarWidthPx: number
    onResize: ComponentProps<'div'>['onPointerDown']
    map: ComponentProps<typeof TrackMap>
  } | null
  library: {
    navigator: ReactNode
    linear: ComponentProps<typeof TrackMap>
    circular: ComponentProps<typeof CircularMapStage<DisplaySettings>>
    linearMode: boolean
    zoomed: boolean
  }
}

export type WorkspaceMapHostProps = {
  activeTab: string
  mapAvailable: boolean
  protein: ProteinMapProps | null
  dna: DnaMapProps | null
}

/** Main Map-tab rendering host; App supplies already-bound workflow and adapter props. */
export function WorkspaceMapHost({ activeTab, mapAvailable, protein, dna }: WorkspaceMapHostProps) {
  const variant = selectWorkspaceMapVariant({ activeTab, mapAvailable, protein, dna })
  if (variant === 'hidden') return null
  if (variant === 'protein' && protein) {
    return (
      <div className="map-tab protein-map-tab">
        <ProteinViewSidebar {...protein.sidebar} />
        <ProteinMapPane {...protein.pane} />
      </div>
    )
  }
  if (!dna) return null
  return (
    <div className="map-tab">
      <ViewSidebar {...dna.sidebar} />
      <div className="view-main">
        {dna.zoomStrip ? <MapZoomStrip {...dna.zoomStrip} /> : null}
        {dna.alignment ? (
          <div
            className="map-alignment-layout"
            style={{ ['--map-alignment-sidebar-width' as string]: `${dna.alignment.sidebarWidthPx}px` }}
          >
            {dna.alignment.comparativeMode ? (
              <DnaComparisonSourceList {...dna.alignment.comparative} />
            ) : (
              <AlignmentTraceFileList {...dna.alignment.trace} />
            )}
            <div
              className="map-alignment-splitter"
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize alignment file list"
              onPointerDown={dna.alignment.onResize}
            />
            <div className="map-alignment-map-host">
              <div className="linear-map-stage">
                <TrackMap {...dna.alignment.map} />
              </div>
            </div>
          </div>
        ) : (
          <>
            {dna.library.navigator}
            {dna.library.linearMode
              ? <div className={`linear-map-stage${dna.library.zoomed ? ' is-zoomed' : ''}`}><TrackMap {...dna.library.linear} /></div>
              : <CircularMapStage {...dna.library.circular} />
            }
          </>
        )}
      </div>
    </div>
  )
}
