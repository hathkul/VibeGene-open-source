import {
  chooseCircularMapRadius,
  collectLayoutViolations,
  layoutEnzymeCallouts,
  layoutLengthMetrics,
  type EnzymeCalloutLayoutInput,
} from '../src/domain/mapLayout'
import type { RestrictionSite } from '../src/domain/types'

type Scenario = {
  name: string
  sequenceLength: number
  starts: Array<{ name: string; start: number }>
}

function site(name: string, start: number): RestrictionSite {
  return {
    enzyme: {
      name,
      notation: 'G/AATTC',
      recognition: 'GAATTC',
      cutTop: 1,
      cutBottom: 5,
      type: 'II',
      overhang: { type: "5'", sequence: 'AATT', length: 4 },
      manufacturers: [],
      notes: [],
    },
    start,
    end: start + 6,
    match: 'GAATTC',
    cutTop: start + 1,
    cutBottom: start + 5,
  }
}

function buildInput(scenario: Scenario): EnzymeCalloutLayoutInput {
  const mapSize = 900
  const center = mapSize / 2
  const outerFeatureOffset = 18
  const sites = scenario.starts.map(({ name, start }) => site(name, start))
  const radius = chooseCircularMapRadius({
    sites,
    sequenceLength: scenario.sequenceLength,
    mapSize,
    center,
    outerFeatureOffset,
  })
  return {
    sites,
    sequenceLength: scenario.sequenceLength,
    mapSize,
    center,
    radius,
    outerFeatureOffset,
  }
}

const scenarios: Scenario[] = [
  {
    name: 'VibeGene-pDemo MCS cluster',
    sequenceLength: 900,
    starts: [
      { name: 'EcoRI', start: 0 },
      { name: 'NheI', start: 6 },
      { name: 'HindIII', start: 29 },
      { name: 'NotI', start: 35 },
      { name: 'XhoI', start: 42 },
      { name: 'BsaI', start: 48 },
      { name: 'SpeI', start: 54 },
      { name: 'HindIII', start: 851 },
      { name: 'KpnI', start: 857 },
      { name: 'BamHI', start: 863 },
      { name: 'PstI', start: 869 },
      { name: 'NdeI', start: 875 },
      { name: 'NotI', start: 881 },
    ],
  },
  {
    name: 'All quadrants',
    sequenceLength: 900,
    starts: [20, 60, 120, 190, 260, 330, 420, 490, 570, 650, 735, 810, 870].map((start, index) => ({
      name: `E${index + 1}`,
      start,
    })),
  },
  {
    name: 'Dense upper-right stress',
    sequenceLength: 900,
    starts: [5, 11, 17, 23, 29, 35, 41, 47, 53, 59, 65, 71].map((start, index) => ({
      name: `D${index + 1}`,
      start,
    })),
  },
]

for (const scenario of scenarios) {
  const input = buildInput(scenario)
  const callouts = layoutEnzymeCallouts(input)
  const metrics = layoutLengthMetrics(callouts)
  const violations = collectLayoutViolations(callouts, input)

  console.log(`\n${scenario.name}`)
  console.log(`radius=${input.radius.toFixed(1)} total=${metrics.total.toFixed(1)} average=${metrics.average.toFixed(1)} violations=${violations.length}`)
  if (metrics.longest) {
    console.log(`longest=${metrics.longest.label} ${metrics.longest.total.toFixed(1)}px`)
  }
  console.table(
    metrics.perCallout.map((metric) => ({
      label: metric.label,
      start: metric.start,
      first: metric.firstSegment.toFixed(1),
      second: metric.secondSegment.toFixed(1),
      total: metric.total.toFixed(1),
    })),
  )
  if (violations.length) {
    console.log(violations)
  }
}
