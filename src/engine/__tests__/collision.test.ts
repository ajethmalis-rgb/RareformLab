import { describe, it, expect } from 'vitest';
import { resolveWheel } from '../wheel';
import { mountTire } from '../tire';
import { resolveCornerState } from '../kinematics';
import { analyseClearance, compareToBaseline, DEFAULT_THRESHOLDS } from '../collision';
import { dim, unknownDim } from '../types';
import { FIXTURE_CORNER, FIXTURE_SUSPENSION, FIXTURE_BARREL_WALL, fixtureTireData } from '@/data/fixtures';

/**
 * ACCEPTANCE: the synthetic fixture must produce a real collision, a
 * marginal case and a clear case from COMPUTED distances, with every
 * expected number hand-calculated below.
 *
 * Fixture FIX-1: archRadius 360, archLateral 90, wellCeiling 480,
 * strut at radial 150 / lateral depth 150, caliper radial 140,
 * hub spigot 56.6 dia, bump travel 80, declared linear camber curve.
 */
const state = () => resolveCornerState(FIXTURE_CORNER.kinematics, FIXTURE_SUSPENSION);

function run(
  widthIn: number, etMm: number, diameterIn: number,
  sectionMm: number, aspect: number,
  envelope = FIXTURE_CORNER,
) {
  const wheel = resolveWheel({ widthIn, diameterIn, etMm });
  const size = { sectionMm, aspect, diameterIn };
  const tire = mountTire(size, widthIn, fixtureTireData(size));
  return {
    wheel, tire,
    report: analyseClearance({
      envelope, wheel, tire, state: state(), archMod: 'untouched',
      wheelCentreBoreMm: 57.1, barrelWallMm: FIXTURE_BARREL_WALL,
      conditions: [{
        id: 'static', label: 'Static, straight ahead',
        compressionFraction: 0, steeringFraction: 0, requiresSteeringGeometry: false,
      }],
    }),
  };
}
const byId = (r: ReturnType<typeof run>['report'], id: string) =>
  r.results.find(x => x.componentId === id)!;

describe('ACCEPTANCE: clear case', () => {
  // 7J ET30 x 15, 195/65R15.
  //   overall width 203.2, centre plane x = -30, rim radius 190.5
  //   tyre on 7.0" (measuring rim 6.0) -> section 205, dia 630.5, r 315.25
  //   arch:   360 >= 315.25, so the assembly never reaches the lip
  //   well:   480 - 315.25 = 164.75 mm
  //   strut:  half at rho 150 is the flange, 101.6; depth 30 + 101.6 = 131.6
  //           -> 150 - 131.6 = 18.4 mm
  //   caliper: 190.5 - 6 - 140 = 44.5 mm
  //   bore:   (57.1 - 56.6)/2 = 0.25 mm
  const { report, tire } = run(7, 30, 15, 195, 65);

  it('reads clear overall on verified geometry', () => {
    expect(report.overall).toBe('clear');
    expect(report.overallModelled).toBe('clear');
  });
  it('shows the tyre inside the arch opening', () => {
    expect(tire.radiusMm).toBeCloseTo(315.25, 1);
    const arch = byId(report, 'fender_lip');
    expect(arch.verdict).toBe('clear');
    expect(arch.minDistanceMm).toBeNull();
    expect(arch.note).toMatch(/inside the arch opening/i);
  });
  it('reaches a verified verdict only because the barrel wall is declared', () => {
    // With the estimated default wall the caliper check cannot be
    // verified, so the whole report drops to indeterminate. That is the
    // evidence rule doing its job, not a regression.
    const wheel = resolveWheel({ widthIn: 7, diameterIn: 15, etMm: 30 });
    const tire = mountTire({ sectionMm: 195, aspect: 65, diameterIn: 15 }, 7);
    const estimated = analyseClearance({
      envelope: FIXTURE_CORNER, wheel, tire, state: state(), archMod: 'untouched',
      wheelCentreBoreMm: 57.1,
      conditions: [{
        id: 'static', label: 'Static', compressionFraction: 0,
        steeringFraction: 0, requiresSteeringGeometry: false,
      }],
    });
    const cal = estimated.results.find(r => r.componentId === 'caliper_radial')!;
    expect(cal.modelledVerdict).toBe('clear');
    expect(cal.verdict).toBe('indeterminate');
    expect(cal.note).toMatch(/screening check only/i);
    expect(estimated.overall).toBe('indeterminate');
  });

  it('computes each distance as hand-calculated', () => {
    expect(byId(report, 'well_ceiling').minDistanceMm).toBeCloseTo(164.8, 1);
    expect(byId(report, 'strut_body').minDistanceMm).toBeCloseTo(18.4, 1);
    expect(byId(report, 'caliper_radial').minDistanceMm).toBeCloseTo(44.5, 1);
    expect(byId(report, 'centre_bore').minDistanceMm).toBeCloseTo(0.25, 2);
  });
});

describe('ACCEPTANCE: marginal case', () => {
  // 7J ET42 x 15, 205/60R15.
  //   centre plane x = -42
  //   tyre on 7.0" (measuring rim 6.5) -> section 210, dia 625, r 312.5
  //   strut: depth 42 + 101.6 = 143.6 -> 150 - 143.6 = 6.4 mm,
  //          under the 8 mm inner threshold, so MARGINAL
  const { report } = run(7, 42, 15, 205, 60);

  it('is marginal, driven by the strut', () => {
    expect(byId(report, 'strut_body').minDistanceMm).toBeCloseTo(6.4, 1);
    expect(byId(report, 'strut_body').modelledVerdict).toBe('marginal');
    expect(report.overall).toBe('marginal');
    expect(report.binding!.componentId).toBe('centre_bore'); // 0.25 mm is tighter still
  });
  it('names the mechanism in the note', () => {
    expect(byId(report, 'strut_body').note).toMatch(/More offset moves toward it/);
  });
  it('sits below the inner threshold but above zero', () => {
    const d = byId(report, 'strut_body').minDistanceMm!;
    expect(d).toBeGreaterThan(0);
    expect(d).toBeLessThan(DEFAULT_THRESHOLDS.innerMm);
  });
});

describe('ACCEPTANCE: interference at the strut', () => {
  // 8J ET55 x 15, 225/60R15.
  //   overall 228.6, half 114.3, centre plane x = -55
  //   strut: depth 55 + 114.3 = 169.3 -> 150 - 169.3 = -19.3 mm
  const { report } = run(8, 55, 15, 225, 60);
  it('predicts contact and reports the overlap', () => {
    expect(byId(report, 'strut_body').minDistanceMm).toBeCloseTo(-19.3, 1);
    expect(byId(report, 'strut_body').verdict).toBe('interference');
    expect(report.overall).toBe('interference');
  });
});

describe('ACCEPTANCE: interference at the fender lip', () => {
  // 9J ET0 x 18, 265/60R18.
  //   overall 254, half 127, rim radius 228.6, centre plane x = 0
  //   tyre on 9.0" (measuring rim 8.5) -> section 270, dia 773.2, r 386.6
  //   arch binds because 360 < 386.6. At rho = 360:
  //     sidewall height 158, u = 131.4/158 = 0.8316, past the 0.45 peak
  //     k = 0.6938, half = 135 - 24.3 x sin(0.6938 x pi/2)^1.6
  //                       = 135 - 24.3 x 0.8238 = 114.98
  //     gap = 90 - 114.98 = -24.98 mm
  const { report, tire } = run(9, 0, 18, 265, 60);
  it('binds at the arch, not the strut', () => {
    expect(tire.radiusMm).toBeCloseTo(386.6, 1);
    const arch = byId(report, 'fender_lip');
    expect(arch.minDistanceMm).toBeCloseTo(-25.0, 1);
    expect(arch.verdict).toBe('interference');
    expect(byId(report, 'strut_body').modelledVerdict).toBe('clear');
    expect(report.binding!.componentId).toBe('fender_lip');
  });
});

describe('the evidence rule', () => {
  it('never returns green on estimated geometry', () => {
    const env = {
      ...FIXTURE_CORNER,
      archRadiusMm: dim(360, 'estimated'),
      archLateralMm: dim(90, 'estimated'),
    };
    const { report } = run(7, 30, 15, 195, 65, env);
    const arch = byId(report, 'fender_lip');
    expect(arch.modelledVerdict).toBe('clear');     // arithmetic is fine
    expect(arch.verdict).toBe('indeterminate');     // but it is not evidence
    expect(report.overall).toBe('indeterminate');
    expect(report.overallModelled).toBe('clear');
  });

  it('never returns green on unknown geometry, and says what to measure', () => {
    const env = { ...FIXTURE_CORNER, archRadiusMm: unknownDim(), archLateralMm: unknownDim() };
    const { report } = run(7, 30, 15, 195, 65, env);
    const arch = byId(report, 'fender_lip');
    expect(arch.verdict).toBe('indeterminate');
    expect(arch.minDistanceMm).toBeNull();
    expect(arch.governingGrade).toBe('unknown');
    expect(arch.note).toMatch(/Measure/i);
  });

  it('still reports a predicted hit on weak data, because that is useful', () => {
    const env = {
      ...FIXTURE_CORNER,
      inner: [{
        ...FIXTURE_CORNER.inner[0]!,
        radialMm: dim(150, 'community_reported'),
        lateralDepthMm: dim(150, 'community_reported'),
      }],
    };
    const { report } = run(8, 55, 15, 225, 60, env);
    expect(byId(report, 'strut_body').verdict).toBe('interference');
  });
});

describe('evaluation conditions', () => {
  it('skips steered conditions when steering geometry is missing', () => {
    const wheel = resolveWheel({ widthIn: 7, diameterIn: 15, etMm: 30 });
    const tire = mountTire({ sectionMm: 195, aspect: 65, diameterIn: 15 }, 7);
    const r = analyseClearance({
      envelope: FIXTURE_CORNER, wheel, tire, state: state(), archMod: 'untouched',
    });
    const skipped = r.conditionsSkipped.map(s => s.id);
    expect(skipped).toContain('full_lock');
    expect(skipped).toContain('half_lock');
    expect(r.conditionsEvaluated).toContain('full_bump');
    expect(r.limitations.join(' ')).toMatch(/steering-axis geometry/i);
    expect(r.limitations.join(' ')).toMatch(/not continuous motion/i);
  });

  it('evaluates steered conditions once steering geometry exists', () => {
    const env = {
      ...FIXTURE_CORNER,
      kinematics: {
        ...FIXTURE_CORNER.kinematics,
        steeringAxis: {
          scrubRadiusMm: 10, kingpinInclinationDeg: 12, casterDeg: 6,
          maxSteerDeg: 35, grade: 'professionally_measured' as const,
        },
      },
    };
    const wheel = resolveWheel({ widthIn: 7, diameterIn: 15, etMm: 30 });
    const tire = mountTire({ sectionMm: 195, aspect: 65, diameterIn: 15 }, 7);
    const r = analyseClearance({
      envelope: env, wheel, tire, state: state(), archMod: 'untouched',
    });
    expect(r.conditionsSkipped).toHaveLength(0);
    expect(r.conditionsEvaluated).toContain('full_lock');
  });
});

describe('arch modification credit', () => {
  it('credits a rolled arch laterally and only laterally', () => {
    const wheel = resolveWheel({ widthIn: 9, diameterIn: 18, etMm: 0 });
    const tire = mountTire({ sectionMm: 265, aspect: 60, diameterIn: 18 }, 9);
    const opts = {
      envelope: FIXTURE_CORNER, wheel, tire, state: state(),
      conditions: [{
        id: 'static', label: 'Static', compressionFraction: 0,
        steeringFraction: 0, requiresSteeringGeometry: false,
      }],
    };
    const plain = analyseClearance({ ...opts, archMod: 'untouched' as const });
    const rolled = analyseClearance({ ...opts, archMod: 'rolled' as const });
    const pulled = analyseClearance({ ...opts, archMod: 'rolled_and_pulled' as const });
    const d = (r: typeof plain) => r.results.find(x => x.componentId === 'fender_lip')!.minDistanceMm!;
    expect(d(rolled) - d(plain)).toBeCloseTo(8, 1);
    expect(d(pulled) - d(plain)).toBeCloseTo(14, 1);
    // vertical ceiling is unaffected by rolling a lip
    const w = (r: typeof plain) => r.results.find(x => x.componentId === 'well_ceiling')!.minDistanceMm!;
    expect(w(rolled)).toBeCloseTo(w(plain), 3);
  });
});

describe('baseline comparison is exact and needs no car data', () => {
  it('reports outboard and inboard movement separately', () => {
    // baseline 6J ET42, 195/65 on 6.0": section 195, widest half 97.5
    //   outer = -42 + 97.5 =  55.5 ;  inner = 42 + 97.5 = 139.5
    // proposed 7J ET30, 195/65 on 7.0": section 205, widest half 102.5
    //   outer = -30 + 102.5 = 72.5 ;  inner = 30 + 102.5 = 132.5
    //   outboard +17.0, inboard -7.0 (i.e. AWAY from the strut)
    const bw = resolveWheel({ widthIn: 6, diameterIn: 15, etMm: 42 });
    const bt = mountTire({ sectionMm: 195, aspect: 65, diameterIn: 15 }, 6);
    const pw = resolveWheel({ widthIn: 7, diameterIn: 15, etMm: 30 });
    const pt = mountTire({ sectionMm: 195, aspect: 65, diameterIn: 15 }, 7);
    const d = compareToBaseline(pw, pt, bw, bt);
    expect(d.outboardMm).toBeCloseTo(17.0, 1);
    expect(d.inboardMm).toBeCloseTo(-7.0, 1);
    expect(d.halfTrackMm).toBeCloseTo(12, 1);
  });

  it('shows that less offset moves a wheel away from the strut', () => {
    const bw = resolveWheel({ widthIn: 8, diameterIn: 16, etMm: 40 });
    const pw = resolveWheel({ widthIn: 8, diameterIn: 16, etMm: 10 });
    const t = mountTire({ sectionMm: 205, aspect: 55, diameterIn: 16 }, 8);
    const d = compareToBaseline(pw, t, bw, t);
    expect(d.outboardMm).toBeCloseTo(30, 1);
    expect(d.inboardMm).toBeCloseTo(-30, 1);
  });
});
