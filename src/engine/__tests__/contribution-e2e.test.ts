import { describe, it, expect } from 'vitest';
import {
  aggregateVariant, envelopeFromConsensus, travelOverrideFrom, camberOverrideFrom,
} from '../aggregate';
import type { Submission } from '../submission';
import { resolveWheel } from '../wheel';
import { mountTire } from '../tire';
import { resolveCornerState, type CornerKinematics } from '../kinematics';
import { analyseClearance } from '../collision';
import { dim } from '../types';
import { fixtureTireData } from '@/data/fixtures';

/**
 * ACCEPTANCE FOR THE CONTRIBUTION LOOP.
 *
 * The same car, the same wheel, the same arithmetic. The ONLY thing that
 * changes between these two runs is how well the car has been measured.
 * If contributed measurements do not move a corner off `indeterminate`,
 * nobody has any reason to measure their car, and the library never
 * compounds. This test is the proof that they do.
 */

const KIN: CornerKinematics = { architecture: 'macpherson_strut', bumpTravelMm: 80 };

/** One contributor's four core measurements, with a few mm of hand variation. */
const contributor = (who: string, jitter: number): Submission => ({
  id: 'sub-' + who, variantKey: 'e30|front|factory|factory',
  vehicleId: 'e30', axle: 'front',
  submitterId: who, submitterName: who, submitterVerified: false,
  submittedAt: '2026-01-01T00:00:00Z',
  suspensionPackage: 'factory', rideHeightDropMm: 0,
  bodyOriginal: true, brakePackage: 'factory',
  method: 'tape_measure',
  values: {
    archRadiusMm: 382 + jitter,
    archLateralMm: 150 + jitter,
    innerDepthMm: 190 + jitter,
    travelMm: 80,
    camberDeg: -0.5 + jitter * 0.05,
  },
  notes: '', status: 'accepted', reviewNote: '', reviewedBy: '',
});

function runClearance(
  envelopeArgs: Parameters<typeof analyseClearance>[0]['envelope'],
  travel: number | null,
  camber?: { deg: number; grade: Parameters<typeof resolveCornerState>[1]['camberOverrideGrade'] },
) {
  const wheel = resolveWheel({ widthIn: 7, diameterIn: 15, etMm: 30 });
  const size = { sectionMm: 195, aspect: 65, diameterIn: 15 };
  const tire = mountTire(size, 7, fixtureTireData(size));
  const state = resolveCornerState(KIN, {
    package: 'factory', dropMm: 0, compressionMm: 0,
    travelMmOverride: travel, travelGradeOverride: 'community_corroborated',
    camberDegOverride: camber ? camber.deg : null,
    camberOverrideGrade: camber ? camber.grade : undefined,
  });
  return analyseClearance({
    envelope: envelopeArgs, wheel, tire, state, archMod: 'untouched',
    barrelWallMm: dim(6, 'professionally_measured', { toleranceMm: 0 }),
    conditions: [{
      id: 'static', label: 'Static', compressionFraction: 0,
      steeringFraction: 0, requiresSteeringGeometry: false,
    }],
  });
}

describe('contributed measurements change the verdict, not the geometry', () => {
  // the library's own estimate: right numbers, weak evidence
  const estimated = envelopeFromConsensus(
    aggregateVariant('e30|front|factory|factory', []), KIN, 'front', 'Strut body',
    {
      archRadiusMm: dim(383, 'estimated'),
      archLateralMm: dim(151, 'estimated'),
      wellCeilingMm: dim(498, 'estimated'),
      inner: [{
        id: 'strut', label: 'Strut body',
        radialMm: dim(150, 'estimated'), lateralDepthMm: dim(191, 'estimated'),
        hits: 'both',
      }],
    });

  it('reads UNKNOWN on the estimated preset, however precise it looks', () => {
    const r = runClearance(estimated, 80);
    expect(r.overall).toBe('indeterminate');
    // the arithmetic is perfectly happy; it is the evidence that is missing
    expect(r.overallModelled).toBe('clear');
  });

  it('reads CLEAR once three independent people have measured it', () => {
    const v = aggregateVariant('e30|front|factory|factory', [
      contributor('alice', 0), contributor('bob', 1), contributor('carol', 2),
    ]);
    expect(v.analysable).toBe(true);
    expect(v.weakestCoreGrade).toBe('community_corroborated');

    const measured = envelopeFromConsensus(v, KIN, 'front', 'Strut body', {
      wellCeilingMm: dim(498, 'estimated'),
    });
    const travel = travelOverrideFrom(v)!;
    expect(travel.mm).toBe(80);
    const camber = camberOverrideFrom(v)!;
    expect(camber.grade).toBe('community_corroborated');
    expect(camber.deg).toBeCloseTo(-0.45, 2);

    const r = runClearance(measured, travel.mm, camber);
    const arch = r.results.find(x => x.componentId === 'fender_lip')!;
    const inner = r.results.find(x => x.componentId === 'measured_inner')!;

    expect(arch.verdict).toBe('clear');
    expect(arch.governingGrade).toBe('community_corroborated');
    expect(inner.verdict).toBe('clear');
    // the well ceiling was never contributed, so it stays unknown and the
    // headline verdict stays honest about that
    const well = r.results.find(x => x.componentId === 'well_ceiling')!;
    expect(well.verdict).toBe('indeterminate');
  });

  it('is the evidence that moved, not the numbers', () => {
    const v = aggregateVariant('e30|front|factory|factory', [
      contributor('alice', 0), contributor('bob', 1), contributor('carol', 2),
    ]);
    const measured = envelopeFromConsensus(v, KIN, 'front', 'Strut body');
    const camber = camberOverrideFrom(v)!;
    const before = runClearance(estimated, 80, camber).results.find(x => x.componentId === 'fender_lip')!;
    const after = runClearance(measured, 80, camber).results.find(x => x.componentId === 'fender_lip')!;
    // same modelled arithmetic either way
    expect(after.modelledVerdict).toBe(before.modelledVerdict);
    // different formal verdict, purely because of grade
    expect(before.verdict).toBe('indeterminate');
    expect(after.verdict).toBe('clear');
  });

  it('refuses to promote when the contributors disagree', () => {
    const v = aggregateVariant('e30|front|factory|factory', [
      contributor('alice', 0), contributor('bob', 1),
      contributor('carol', 40), contributor('dave', 41),
    ]);
    expect(v.byKey.archRadiusMm!.conflict).toBe(true);
    expect(v.analysable).toBe(false);
    const measured = envelopeFromConsensus(v, KIN, 'front', 'Strut body');
    const r = runClearance(measured, 80);
    expect(r.results.find(x => x.componentId === 'fender_lip')!.verdict).toBe('indeterminate');
  });
});
