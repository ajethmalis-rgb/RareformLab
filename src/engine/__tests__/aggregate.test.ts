import { describe, it, expect } from 'vitest';
import {
  median, mad, consensusFor, aggregateVariant, toDimension, nextNeed,
  MIN_CORROBORATION,
} from '../aggregate';
import { validateSubmission, isRejectable, type Submission } from '../submission';
import { isVerified } from '../types';

/** Minimal valid submission; each test overrides what it cares about. */
function sub(over: Partial<Submission> & { id: string; submitterId: string }): Submission {
  return {
    variantKey: 'e30|front|factory|factory',
    vehicleId: 'e30', axle: 'front',
    submitterName: over.submitterId, submitterVerified: false,
    submittedAt: '2026-01-01T00:00:00Z',
    suspensionPackage: 'factory', rideHeightDropMm: 0,
    bodyOriginal: true, brakePackage: 'factory',
    method: 'tape_measure', values: {}, notes: '',
    status: 'accepted', reviewNote: '', reviewedBy: '',
    ...over,
  } as Submission;
}
const withArch = (id: string, who: string, v: number, extra: Partial<Submission> = {}) =>
  sub({ id, submitterId: who, values: { archRadiusMm: v }, ...extra });

describe('robust statistics', () => {
  it('takes the median, not the mean', () => {
    expect(median([382, 385, 383])).toBe(383);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    // one transposed digit destroys a mean and barely moves a median
    expect(median([382, 385, 383, 3850])).toBe(384);
  });
  it('computes the median absolute deviation', () => {
    // values 382,385,383 -> median 383 -> deviations 1,2,0 -> median 1
    expect(mad([382, 385, 383])).toBe(1);
  });
});

describe('promotion to corroborated', () => {
  it('leaves a single submission unpromoted', () => {
    const c = consensusFor('archRadiusMm', [withArch('s1', 'alice', 383)]);
    expect(c.grade).toBe('community_reported');
    expect(isVerified(c.grade)).toBe(false);
    expect(c.agreeingSubmitters).toBe(1);
    expect(c.needsMore).toBe(MIN_CORROBORATION - 1);
    expect(c.note).toMatch(/2 more agreeing/);
  });

  it('promotes three distinct agreeing submitters, and that grade is verified', () => {
    // 382, 385, 383 -> median 383, MAD 1, band max(3*3,5)=9, no outliers
    // inlier spread (385-382)/2 = 1.5; tolerance max(tape 3, 1.5) = 3
    const c = consensusFor('archRadiusMm', [
      withArch('s1', 'alice', 382),
      withArch('s2', 'bob', 385),
      withArch('s3', 'carol', 383),
    ]);
    expect(c.grade).toBe('community_corroborated');
    expect(isVerified(c.grade)).toBe(true);
    expect(c.value).toBe(383);
    expect(c.toleranceMm).toBe(3);
    expect(c.agreeingSubmitters).toBe(3);
    expect(c.conflict).toBe(false);
  });

  it('counts people, not rows: one keen owner measuring thrice is one opinion', () => {
    const c = consensusFor('archRadiusMm', [
      withArch('s1', 'alice', 382),
      withArch('s2', 'alice', 383),
      withArch('s3', 'alice', 384),
    ]);
    expect(c.distinctSubmitters).toBe(1);
    expect(c.agreeingSubmitters).toBe(1);
    expect(c.grade).toBe('community_reported');
    expect(isVerified(c.grade)).toBe(false);
  });

  it('ignores submissions that are still pending', () => {
    const c = consensusFor('archRadiusMm', [
      withArch('s1', 'alice', 382),
      withArch('s2', 'bob', 383, { status: 'pending' }),
      withArch('s3', 'carol', 384, { status: 'pending' }),
    ]);
    expect(c.agreeingSubmitters).toBe(1);
    expect(c.grade).toBe('community_reported');
  });
});

describe('outliers are excluded, not averaged in', () => {
  it('drops a stray and keeps the cluster’s value', () => {
    // 382,385,383,420 -> median 384, MAD 1.5, band 9, threshold 9
    // deviations 2,1,1,36 -> only 420 is an outlier
    const c = consensusFor('archRadiusMm', [
      withArch('s1', 'alice', 382),
      withArch('s2', 'bob', 385),
      withArch('s3', 'carol', 383),
      withArch('s4', 'dave', 420),
    ]);
    const stray = c.points.find(p => p.value === 420)!;
    expect(stray.outlier).toBe(true);
    expect(c.points.filter(p => p.outlier)).toHaveLength(1);
    // the consensus is the cluster's median, NOT pulled toward 420
    expect(c.value).toBe(383);
    expect(c.agreeingSubmitters).toBe(3);
    expect(c.grade).toBe('community_corroborated');
    expect(c.note).toMatch(/1 outlier excluded/);
  });
});

describe('disagreement is surfaced, never resolved by arithmetic', () => {
  it('refuses to invent a value between two camps', () => {
    // 380,381,420,421: MAD is 20, which exceeds the 9 mm band. A naive
    // MAD-scaled threshold would find NO outliers here and report a
    // corroborated 400.5 mm that nobody measured.
    const c = consensusFor('archRadiusMm', [
      withArch('s1', 'alice', 380),
      withArch('s2', 'bob', 381),
      withArch('s3', 'carol', 420),
      withArch('s4', 'dave', 421),
    ]);
    expect(c.conflict).toBe(true);
    expect(c.grade).toBe('community_reported');
    expect(isVerified(c.grade)).toBe(false);
    expect(c.note).toMatch(/disagreement about what this variant is/);
    expect(c.note).toMatch(/no average is reported/);
  });

  it('calls it a conflict when the strays outnumber the cluster', () => {
    const c = consensusFor('archRadiusMm', [
      withArch('s1', 'alice', 383),
      withArch('s2', 'bob', 405),
      withArch('s3', 'carol', 362),
    ]);
    expect(c.conflict).toBe(true);
    expect(c.grade).toBe('community_reported');
  });
});

describe('instrument honesty', () => {
  it('will not let tape measurements claim sub-millimetre tolerance', () => {
    // three identical tape readings: spread is zero, but a tape is not a CMM
    const c = consensusFor('archRadiusMm', [
      withArch('s1', 'alice', 383),
      withArch('s2', 'bob', 383),
      withArch('s3', 'carol', 383),
    ]);
    expect(c.grade).toBe('community_corroborated');
    expect(c.toleranceMm).toBe(3); // the tape's own repeatability, not 0
  });

  it('promotes an instrument measurement only from a verified submitter', () => {
    const unverified = consensusFor('archRadiusMm', [
      withArch('s1', 'shop', 383, { method: 'cmm', submitterVerified: false }),
    ]);
    expect(unverified.grade).toBe('community_reported');

    const verified = consensusFor('archRadiusMm', [
      withArch('s1', 'shop', 383, { method: 'cmm', submitterVerified: true }),
    ]);
    expect(verified.grade).toBe('professionally_measured');
    expect(verified.toleranceMm).toBe(0.5);
  });
});

describe('variant rollup', () => {
  const four = (who: string, n: number, over: Partial<Submission> = {}) =>
    sub({
      id: 's' + who + n, submitterId: who,
      values: { archRadiusMm: 382 + n, archLateralMm: 88 + n, innerDepthMm: 165 + n, travelMm: 80 + n },
      ...over,
    });

  it('promotes a variant once every core measurement is corroborated', () => {
    const v = aggregateVariant('e30|front|factory|factory',
      [four('alice', 0), four('bob', 1), four('carol', 2)]);
    expect(v.coreComplete).toBe(true);
    expect(v.weakestCoreGrade).toBe('community_corroborated');
    expect(v.analysable).toBe(true);
    expect(nextNeed(v)).toMatch(/returns real verdicts/);
  });

  it('holds modified bodywork out of the consensus but keeps it on record', () => {
    const v = aggregateVariant('e30|front|factory|factory', [
      four('alice', 0), four('bob', 1), four('carol', 2),
      four('dave', 40, { bodyOriginal: false }),
    ]);
    expect(v.excluded).toHaveLength(1);
    expect(v.excluded[0]!.reason).toMatch(/not original/);
    // and the pulled-arch car has not moved the agreed figure
    expect(v.byKey.archRadiusMm!.value).toBe(383);
  });

  it('tells a contributor exactly what is still needed', () => {
    const v = aggregateVariant('e30|front|factory|factory', [four('alice', 0)]);
    expect(v.analysable).toBe(false);
    expect(nextNeed(v)).toMatch(/2 more independent measurements/);
  });

  it('reports which core measurement is missing entirely', () => {
    const partial = sub({
      id: 'p1', submitterId: 'alice',
      values: { archRadiusMm: 383, archLateralMm: 88 },
    });
    const v = aggregateVariant('e30|front|factory|factory', [partial]);
    expect(v.coreComplete).toBe(false);
    expect(nextNeed(v)).toMatch(/Needs a first measurement of/);
    expect(nextNeed(v)).toMatch(/bump stop/);
  });
});

describe('consensus to solver input', () => {
  it('carries the agreed value, its spread and its grade into a Dimension', () => {
    const c = consensusFor('archRadiusMm', [
      withArch('s1', 'alice', 382),
      withArch('s2', 'bob', 385),
      withArch('s3', 'carol', 383),
    ]);
    const d = toDimension(c)!;
    expect(d.value).toBe(383);
    expect(d.toleranceMm).toBe(3);
    expect(d.grade).toBe('community_corroborated');
    expect(isVerified(d.grade)).toBe(true);
    expect(d.source).toMatch(/3 submitters/);
  });
  it('returns null when there is nothing usable', () => {
    expect(toDimension(consensusFor('archRadiusMm', []))).toBeNull();
  });
});

describe('validation before a reviewer ever sees it', () => {
  const wheel = { widthIn: 7, diameterIn: 15, etMm: 30, tireSectionMm: 195, tireAspect: 65 };

  it('rejects a value outside the physically possible range', () => {
    const issues = validateSubmission(withArch('s1', 'alice', 38));
    expect(isRejectable(issues)).toBe(true);
    expect(issues[0]!.message).toMatch(/outside the possible range/);
  });

  it('catches the commonest error: measuring to the tyre, not the hub', () => {
    // 195/65R15 has a 317 mm radius; an arch radius below that is impossible
    const issues = validateSubmission(
      withArch('s1', 'alice', 250, { wheelOnCar: wheel }));
    expect(isRejectable(issues)).toBe(true);
    expect(issues[0]!.message).toMatch(/resting on its own arch/);
    expect(issues[0]!.message).toMatch(/top of the tyre rather than to the hub/);
  });

  it('accepts a sane measurement against the fitted wheel', () => {
    const issues = validateSubmission(
      withArch('s1', 'alice', 383, { wheelOnCar: wheel }));
    expect(isRejectable(issues)).toBe(false);
  });

  it('refuses a submission that does not say how it was measured', () => {
    for (const m of ['unknown', 'declared', 'derived'] as const) {
      const issues = validateSubmission(withArch('s1', 'alice', 383, { method: m }));
      expect(isRejectable(issues)).toBe(true);
      expect(issues.some(i => /must state how it was measured/.test(i.message))).toBe(true);
    }
  });

  it('flags modified bodywork without rejecting it', () => {
    const issues = validateSubmission(withArch('s1', 'alice', 383, { bodyOriginal: false }));
    expect(isRejectable(issues)).toBe(false);
    expect(issues.some(i => i.severity === 'flag' && /excluded from the consensus/.test(i.message))).toBe(true);
  });
});

describe('a conflicted consensus never reaches the solver', () => {
  it('returns null rather than a between-camps figure', () => {
    const c = consensusFor('archRadiusMm', [
      withArch('s1', 'alice', 380),
      withArch('s2', 'bob', 381),
      withArch('s3', 'carol', 420),
      withArch('s4', 'dave', 421),
    ]);
    expect(c.conflict).toBe(true);
    // the cluster median is still shown to a reviewer...
    expect(Number.isFinite(c.value)).toBe(true);
    // ...but nothing is handed to the collision engine
    expect(toDimension(c)).toBeNull();
  });
});
