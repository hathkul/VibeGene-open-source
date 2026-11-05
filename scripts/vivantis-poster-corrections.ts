import type { VivantisPosterBufferActivity, VivantisPosterRow } from './vivantis-poster-parser.ts'

type PosterCorrection = Pick<VivantisPosterRow, 'bufferActivity' | 'heatInactivation' | 'incubationC'>

// Verified against the official Vivantis RE Buffers Activity Chart (slice images).
export const vivantisPosterCorrections: Record<string, PosterCorrection> = {
  AccBSI: {
    bufferActivity: {
      v1: '100',
      v2: '75',
      v3: '50',
      v4: '75',
      v5: '100',
      ub05: '100',
      ub: '100',
      ub15: '100',
      ub2: '100',
    },
    heatInactivation: '65°C',
    incubationC: 37,
  },
  Acc16I: {
    bufferActivity: {
      v1: '10',
      v2: '25',
      v3: '50',
      v4: '75',
      v5: '100',
      ub05: '100',
      ub: '100',
      ub15: '100',
      ub2: '100',
    },
    heatInactivation: '65°C',
    incubationC: 37,
  },
  AspLEI: {
    bufferActivity: {
      v1: '10',
      v2: '50',
      v3: '75',
      v4: '25',
      v5: '10',
      ub05: '25',
      ub: '100',
      ub15: '100',
      ub2: '100',
    },
    heatInactivation: 'NO',
    incubationC: 37,
  },
  BamHI: {
    bufferActivity: {
      v1: '75',
      v2: '75',
      v3: '50',
      v4: '75',
      v5: '75',
      ub05: '100',
      ub: '25',
      ub15: '100',
      ub2: '75',
    },
    heatInactivation: '65°C',
    incubationC: 37,
  },
  BglII: {
    bufferActivity: {
      v1: '75',
      v2: '100',
      v3: '100',
      v4: '75',
      v5: '100',
      ub05: '75',
      ub: '100',
      ub15: '75',
      ub2: '100',
    },
    heatInactivation: 'NO',
    incubationC: 37,
  },
  BstSNI: {
    bufferActivity: {
      v1: '100',
      v2: '100',
      v3: '75',
      v4: '75',
      v5: '100',
      ub05: '100',
      ub: '100',
      ub15: '100',
      ub2: '100',
    },
    heatInactivation: 'NO',
    incubationC: 37,
  },
}

export function applyVivantisPosterCorrections(chart: Record<string, VivantisPosterRow>) {
  for (const [catalogName, correction] of Object.entries(vivantisPosterCorrections)) {
    const row = chart[catalogName]
    if (!row) continue
    chart[catalogName] = {
      ...row,
      ...correction,
      bufferActivity: { ...row.bufferActivity, ...correction.bufferActivity } as VivantisPosterBufferActivity,
    }
  }
  return chart
}
