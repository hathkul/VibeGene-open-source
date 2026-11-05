import { describe, expect, it } from 'vitest';
import {
  compareCircularRoutingCandidates,
  type CircularRoutingPolicyCandidate,
  type CircularRoutingPolicyQuality,
} from '../src/domain/circularRoutingPolicy';

const options = {
  baselineGrowth: { horizontal: 40, vertical: 30 },
  maxAdditionalGrowth: { horizontal: 20, vertical: 15 },
  angleTarget: 120,
};

function route(overrides: Partial<CircularRoutingPolicyQuality> = {}, state: Partial<CircularRoutingPolicyCandidate> = {}): CircularRoutingPolicyCandidate {
  return {
    valid: true,
    complete: true,
    quality: {
      minBendAngle: 125,
      meanBendAngle: 150,
      belowTargetBendCount: 0,
      belowTargetBendSeverity: 0,
      canvasGrowthHorizontalPx: 40,
      canvasGrowthVerticalPx: 30,
      maxLeaderLength: 20,
      meanLeaderLength: 12,
      ...overrides,
    },
    ...state,
  };
}

describe('compareCircularRoutingCandidates', () => {
  it('rejects a severe worst bend before secondary quality', () => {
    const severe = route({ minBendAngle: 65, meanBendAngle: 170, belowTargetBendCount: 1 });
    const improved = route({ minBendAngle: 92, meanBendAngle: 145, belowTargetBendCount: 2, belowTargetBendSeverity: 4 });
    expect(compareCircularRoutingCandidates(improved, severe, options)).toBeLessThan(0);
  });

  it('does not trade a tiny angle gain for materially more canvas growth', () => {
    const tinyGain = route({ minBendAngle: 119, canvasGrowthHorizontalPx: 55 });
    const compact = route({ minBendAngle: 118, canvasGrowthHorizontalPx: 41 });
    expect(compareCircularRoutingCandidates(tinyGain, compact, options)).toBeGreaterThan(0);
  });

  it('measures total growth from the fixed baseline budget', () => {
    const within = route({ canvasGrowthHorizontalPx: 60, canvasGrowthVerticalPx: 45 });
    const exceeds = route({ canvasGrowthHorizontalPx: 61, canvasGrowthVerticalPx: 30 });
    expect(compareCircularRoutingCandidates(within, exceeds, options)).toBeLessThan(0);
    // Repeating the same comparison uses the same baseline, not the prior winner's growth.
    expect(compareCircularRoutingCandidates(exceeds, within, options)).toBeGreaterThan(0);
  });

  it('prefers valid and complete candidates over invalid or incomplete ones', () => {
    const good = route({ minBendAngle: 121 });
    expect(compareCircularRoutingCandidates(good, route({}, { valid: false }), options)).toBeLessThan(0);
    expect(compareCircularRoutingCandidates(good, route({}, { complete: false }), options)).toBeLessThan(0);
  });

  it('ranks validity before growth budget eligibility', () => {
    const validOverBudget = route({ canvasGrowthHorizontalPx: 80 });
    const invalidWithinBudget = route({}, { valid: false });
    expect(compareCircularRoutingCandidates(validOverBudget, invalidWithinBudget, options)).toBeLessThan(0);
  });

  it('treats the angle target as a preference, not a feasibility boundary', () => {
    const justShort = route({ minBendAngle: 119, belowTargetBendCount: 1, belowTargetBendSeverity: 1 });
    const reached = route({ minBendAngle: 120, belowTargetBendCount: 0, belowTargetBendSeverity: 0 });
    expect(compareCircularRoutingCandidates(reached, justShort, options)).toBeLessThan(0);
    expect(compareCircularRoutingCandidates(justShort, route({ minBendAngle: 118, belowTargetBendCount: 1, belowTargetBendSeverity: 2 }), options)).toBeLessThan(0);
  });

  it('uses the larger canvas extent rather than summing horizontal and vertical growth', () => {
    const balanced = route({ canvasGrowthHorizontalPx: 50, canvasGrowthVerticalPx: 40 });
    const lopsided = route({ canvasGrowthHorizontalPx: 55, canvasGrowthVerticalPx: 30 });
    expect(compareCircularRoutingCandidates(balanced, lopsided, options)).toBeLessThan(0);
  });

  it('prefers shorter leaders for near ties and is deterministic for equal values', () => {
    const shorter = route({ maxLeaderLength: 18, meanLeaderLength: 10 });
    const longer = route({ maxLeaderLength: 21, meanLeaderLength: 14 });
    expect(compareCircularRoutingCandidates(shorter, longer, options)).toBeLessThan(0);
    expect(compareCircularRoutingCandidates(route(), route(), options)).toBe(0);
  });

  it('uses the configured angle target for mean-angle preference', () => {
    const higherMean = route({ minBendAngle: 130, meanBendAngle: 150 });
    const lowerMean = route({ minBendAngle: 130, meanBendAngle: 140 });
    expect(compareCircularRoutingCandidates(higherMean, lowerMean, { ...options, angleTarget: 125 })).toBeLessThan(0);
  });

  it('treats small numeric jitter as a tie and compares antisymmetrically', () => {
    const a = route({ minBendAngle: 125.1, meanBendAngle: 150.1, canvasGrowthHorizontalPx: 40.2, maxLeaderLength: 20.2 });
    const b = route({ minBendAngle: 125, meanBendAngle: 150, canvasGrowthHorizontalPx: 40, maxLeaderLength: 20 });
    expect(compareCircularRoutingCandidates(a, b, options)).toBe(0);
    const largerGrowth = route({ canvasGrowthHorizontalPx: 45 });
    const lessGrowth = route({ canvasGrowthHorizontalPx: 40 });
    expect(compareCircularRoutingCandidates(lessGrowth, largerGrowth, options)).toBe(-compareCircularRoutingCandidates(largerGrowth, lessGrowth, options));
  });

  it('lets a sub-two-degree improvement yield to substantially worse bend severity', () => {
    const slightAngleGain = route({ minBendAngle: 119, belowTargetBendCount: 2, belowTargetBendSeverity: 30 });
    const lessSeverity = route({ minBendAngle: 118, belowTargetBendCount: 2, belowTargetBendSeverity: 8 });
    expect(compareCircularRoutingCandidates(slightAngleGain, lessSeverity, options)).toBeGreaterThan(0);
  });

  it('does not let a better worst bend excuse a pathological increase in short bends', () => {
    const isolatedSevereBend = route({ minBendAngle: 55, belowTargetBendCount: 1, belowTargetBendSeverity: 65 });
    const manyShortBends = route({ minBendAngle: 95, belowTargetBendCount: 14, belowTargetBendSeverity: 110 });
    expect(compareCircularRoutingCandidates(manyShortBends, isolatedSevereBend, options)).toBeGreaterThan(0);
  });
});
