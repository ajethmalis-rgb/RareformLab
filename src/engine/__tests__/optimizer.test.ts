import { describe, it, expect } from 'vitest';
import { optimizeFitment, DEFAULT_CONSTRAINTS } from '../optimizer';
import { resolveWheel, type BarrelComponent, type DiscComponent } from '../wheel';
import { mountTire } from '../tire';
import { FIXTURE_CORNER, FIXTURE_SUSPENSION, FIXTURE_BARREL_WALL, fixtureTireData } from '@/data/fixtures';

const lips: BarrelComponent[] = [2.0, 2.5, 3.0, 3.5].map(w => ({
  id: `LIP-16-${w}`, kind: 'outer_lip', diameterIn: 16, widthIn: w,
  profile: 'J', flangeMm: 12.7, mateAllowanceMm: 6.35,
}));
const barrels: BarrelComponent[] = [4.5, 5.0, 5.5, 6.0].map(w => ({
  id: `BAR-16-${w}`, kind: 'inner_barrel', diameterIn: 16, widthIn: w,
  profile: 'J', flangeMm: 12.7, mateAllowanceMm: 6.35,
}));
const discs: DiscComponent[] = [2.5, 3.0, 3.5, 4.0].map(pd => ({
  id: `DISC-16-PD${pd}`, name: `Fixture face PD${pd}`, padDepthIn: pd,
  padThicknessMm: 10, mount: 'front_mount',
  boltPattern: { count: 5, pcdMm: 120 }, centreBoreMm: 57.1, faceDiameterIn: 16,
}));

const baselineWheel = resolveWheel({ widthIn: 7, diameterIn: 15, etMm: 30 });
const baselineTire = mountTire({ sectionMm: 195, aspect: 65, diameterIn: 15 }, 7);

const base = {
  envelope: FIXTURE_CORNER,
  suspension: FIXTURE_SUSPENSION,
  construction: 'three_piece' as const,
  diameterIn: 16,
  outerLips: lips, innerBarrels: barrels, discs,
  baselineWheelGeometry: baselineWheel,
  baselineTire,
  barrelWallMm: FIXTURE_BARREL_WALL,
  tireDataFor: fixtureTireData,
  widthRange: [7, 9] as [number, number],
};

describe('BUILD TO FIT optimizer', () => {
  it('finds verified candidates on verified fixture geometry', () => {
    const r = optimizeFitment({ ...base, goal: 'conservative_street' });
    expect(r.searched).toBeGreaterThan(0);
    expect(r.verified.length).toBeGreaterThan(0);
    for (const c of r.verified) {
      expect(c.verdict).toBe('clear');
      expect(c.verified).toBe(true);
    }
  });

  it('never silently relaxes the no-spacer constraint', () => {
    const r = optimizeFitment({
      ...base, goal: 'max_width',
      constraints: { ...DEFAULT_CONSTRAINTS, allowSpacers: false, maxSpacerMm: 0 },
    });
    for (const c of [...r.verified, ...r.unverified]) expect(c.spacerMm).toBe(0);
  });

  it('considers spacers only when explicitly allowed', () => {
    const r = optimizeFitment({
      ...base, goal: 'nearly_flush',
      constraints: { ...DEFAULT_CONSTRAINTS, allowSpacers: true, maxSpacerMm: 10 },
      spacerOptions: [0, 5, 10, 20],
    });
    const used = new Set([...r.verified, ...r.unverified].map(c => c.spacerMm));
    for (const s of used) expect(s).toBeLessThanOrEqual(10);
  });

  it('excludes stretched tyres when the constraint is set', () => {
    const r = optimizeFitment({
      ...base, goal: 'max_width',
      constraints: { ...DEFAULT_CONSTRAINTS, noStretchedTires: true },
    });
    for (const c of [...r.verified, ...r.unverified])
      expect(['balloon', 'full', 'oem', 'mild']).toContain(c.tire.sidewall.klass);
  });

  it('applies no arch credit under untouched factory metal', () => {
    const strict = optimizeFitment({
      ...base, goal: 'nearly_flush', archMod: 'rolled_and_pulled',
      constraints: { ...DEFAULT_CONSTRAINTS, untouchedFactoryMetal: true },
    });
    const relaxed = optimizeFitment({
      ...base, goal: 'nearly_flush', archMod: 'rolled_and_pulled',
      constraints: { ...DEFAULT_CONSTRAINTS, untouchedFactoryMetal: false },
    });
    expect(strict.limitations.join(' ')).toMatch(/Untouched factory metal/i);
    // Credit changes the reported arch distance, so the two runs differ.
    const archOf = (r: typeof strict) =>
      r.verified[0]?.clearance.results.find(x => x.componentId === 'fender_lip')?.minDistanceMm ?? null;
    expect(strict.verified.length + relaxed.verified.length).toBeGreaterThan(0);
    if (archOf(strict) !== null && archOf(relaxed) !== null)
      expect(archOf(relaxed)!).toBeGreaterThanOrEqual(archOf(strict)!);
  });

  it('enforces the minimum clearance floor', () => {
    const r = optimizeFitment({
      ...base, goal: 'max_width',
      constraints: { ...DEFAULT_CONSTRAINTS, minClearanceMm: 25 },
    });
    for (const c of [...r.verified, ...r.unverified]) {
      for (const res of c.clearance.results)
        if (res.minDistanceMm !== null && res.componentId !== 'centre_bore')
          expect(res.minDistanceMm).toBeGreaterThanOrEqual(25);
    }
  });

  it('reports rejections with reasons instead of hiding them', () => {
    const r = optimizeFitment({
      ...base, goal: 'max_width',
      constraints: { ...DEFAULT_CONSTRAINTS, minClearanceMm: 60 },
    });
    expect(r.rejected.length).toBeGreaterThan(0);
    expect(r.rejected.some(x => x.violations.some(v => /minimum/i.test(v)))).toBe(true);
  });

  it('lands every candidate in unverified without measured tyre data', () => {
    // Drop the tyre data and nothing can be verified, because the tyre's
    // overall diameter is then only a nominal designation. This is the
    // evidence rule, not a bug: fender clearance depends on tyre radius.
    const { tireDataFor, ...noTireData } = base;
    const r = optimizeFitment({ ...noTireData, goal: 'conservative_street' });
    expect(r.verified).toHaveLength(0);
    expect(r.unverified.length).toBeGreaterThan(0);
    const well = r.unverified[0]!.clearance.results
      .find(x => x.componentId === 'well_ceiling')!;
    expect(well.governingGrade).toBe('estimated');
    expect(well.verdict).toBe('indeterminate');
    expect(well.modelledVerdict).toBe('clear');
  });

  it('separates unverified candidates when geometry is estimated', () => {
    const env = {
      ...FIXTURE_CORNER,
      archRadiusMm: { ...FIXTURE_CORNER.archRadiusMm, grade: 'estimated' as const },
    };
    const r = optimizeFitment({ ...base, envelope: env, goal: 'conservative_street' });
    expect(r.verified).toHaveLength(0);
    expect(r.unverified.length).toBeGreaterThan(0);
  });

  it('ranks max_lip above conservative_street on exposed lip', () => {
    const lipRun = optimizeFitment({ ...base, goal: 'max_lip' });
    const safeRun = optimizeFitment({ ...base, goal: 'conservative_street' });
    const top = (r: typeof lipRun) => (r.verified[0] ?? r.unverified[0]);
    const a = top(lipRun), b = top(safeRun);
    if (a && b) expect(a.assembly.exposedLipIn).toBeGreaterThanOrEqual(b.assembly.exposedLipIn);
  });
});
