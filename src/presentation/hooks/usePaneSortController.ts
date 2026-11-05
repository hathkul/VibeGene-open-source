import { useState } from 'react'
import { nextSortState } from '../../application/paneInteractions/paneInteractions'
import type { EnzymeTabSortDirection, EnzymeTabSortMode, FeatureTabSortDirection, FeatureTabSortMode, PrimerTabSortDirection } from '../sequence'
import type { PrimerTabSortMode } from '../../domain/primerExport'
import type { SgRnaPaneSortMode } from '../../domain/primerPaneEntries'

export function usePaneSortController() {
  const [enzymeTabSortMode, setEnzymeTabSortMode] = useState<EnzymeTabSortMode>('name')
  const [enzymeTabSortDirection, setEnzymeTabSortDirection] = useState<EnzymeTabSortDirection>('asc')
  const [featureTabSortMode, setFeatureTabSortMode] = useState<FeatureTabSortMode>('location')
  const [featureTabSortDirection, setFeatureTabSortDirection] = useState<FeatureTabSortDirection>('asc')
  const [primerTabSortMode, setPrimerTabSortMode] = useState<PrimerTabSortMode>('name')
  const [primerTabSortDirection, setPrimerTabSortDirection] = useState<PrimerTabSortDirection>('asc')
  const [oligoTabSortMode, setOligoTabSortMode] = useState<PrimerTabSortMode>('name')
  const [oligoTabSortDirection, setOligoTabSortDirection] = useState<PrimerTabSortDirection>('asc')
  const [sgRnaTabSortMode, setSgRnaTabSortMode] = useState<SgRnaPaneSortMode>('name')
  const [sgRnaTabSortDirection, setSgRnaTabSortDirection] = useState<PrimerTabSortDirection>('asc')

  return {
    enzymeTabSortMode, enzymeTabSortDirection,
    featureTabSortMode, featureTabSortDirection,
    primerTabSortMode, primerTabSortDirection,
    oligoTabSortMode, oligoTabSortDirection,
    sgRnaTabSortMode, sgRnaTabSortDirection,
    toggleEnzymeTabSort: (mode: EnzymeTabSortMode) => {
      const next = nextSortState(enzymeTabSortMode, enzymeTabSortDirection, mode, mode === 'site-count' ? 'desc' : 'asc')
      setEnzymeTabSortMode(next.mode)
      setEnzymeTabSortDirection((current) =>
        enzymeTabSortMode === mode
          ? (current === 'asc' ? 'desc' : 'asc')
          : next.direction as EnzymeTabSortDirection,
      )
    },
    toggleFeatureTabSort: (mode: FeatureTabSortMode) => {
      const next = nextSortState(featureTabSortMode, featureTabSortDirection, mode)
      setFeatureTabSortMode(next.mode)
      setFeatureTabSortDirection((current) =>
        featureTabSortMode === mode
          ? (current === 'asc' ? 'desc' : 'asc')
          : next.direction as FeatureTabSortDirection,
      )
    },
    togglePrimerTabSort: (mode: PrimerTabSortMode) => {
      const next = nextSortState(primerTabSortMode, primerTabSortDirection, mode)
      setPrimerTabSortMode(next.mode)
      setPrimerTabSortDirection((current) =>
        primerTabSortMode === mode
          ? (current === 'asc' ? 'desc' : 'asc')
          : next.direction as PrimerTabSortDirection,
      )
    },
    toggleOligoTabSort: (mode: PrimerTabSortMode) => {
      const next = nextSortState(oligoTabSortMode, oligoTabSortDirection, mode)
      setOligoTabSortMode(next.mode)
      setOligoTabSortDirection((current) =>
        oligoTabSortMode === mode
          ? (current === 'asc' ? 'desc' : 'asc')
          : next.direction as PrimerTabSortDirection,
      )
    },
    toggleSgRnaTabSort: (mode: SgRnaPaneSortMode) => {
      const next = nextSortState(sgRnaTabSortMode, sgRnaTabSortDirection, mode)
      setSgRnaTabSortMode(next.mode)
      setSgRnaTabSortDirection((current) =>
        sgRnaTabSortMode === mode
          ? (current === 'asc' ? 'desc' : 'asc')
          : next.direction as PrimerTabSortDirection,
      )
    },
  }
}
