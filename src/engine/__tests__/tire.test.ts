import { describe, it, expect } from 'vitest';
import {
  derivedMeasuringRimIn, mountTire, assessSidewall, assemblyHalfWidth,
  widestPoint, speedoDeviationPct, findTireSizes, stretchIn,
} from '../tire';
import { resolveWheel } from '../wheel';

describe('measuring rim, against published values', () => {
  it('matches the published measuring rim for known sizes', () => {
    expect(derivedMeasuringRimIn({ sectionMm: 185, aspect: 70, diameterIn: 13 })).toBe(5.5);
    expect(derivedMeasuringRimIn({ sectionMm: 195, aspect: 65, diameterIn: 15 })).toBe(6.0);
    expect(derivedMeasuringRimIn({ sectionMm: 205, aspect: 55, diameterIn: 16 })).toBe(6.5);
    expect(derivedMeasuringRimIn({ sectionMm: 225, aspect: 45, diameterIn: 17 })).toBe(7.5);
    expect(derivedMeasuringRimIn({ sectionMm: 245, aspect: 40, diameterIn: 18 })).toBe(8.5);
    expect(derivedMeasuringRimIn({ sectionMm: 275, aspect: 35, diameterIn: 19 })).toBe(9.5);
  });

  it('prefers supplied manufacturer data over the derivation', () => {
    const t = { sectionMm: 225, aspect: 45, diameterIn: 17 };
    expect(stretchIn(t, 8.0, { measuringRimIn: 8.0 })).toBe(0);
    expect(stretchIn(t, 8.0)).toBeCloseTo(0.5, 6); // derived 7.5
  });
});

describe('tyre dimensions, against published values', () => {
  it('computes overall diameter on the measuring rim', () => {
    // 195/65R15: 15 x 25.4 + 2 x (195 x 0.65) = 381 + 253.5 = 634.5 mm
    const a = mountTire({ sectionMm: 195, aspect: 65, diameterIn: 15 }, 6.0);
    expect(a.diameterMm).toBeCloseTo(634.5, 1);
    expect(a.sidewallMm).toBeCloseTo(126.75, 2);

    // 205/55R16: 406.4 + 2 x 112.75 = 631.9 mm
    const b = mountTire({ sectionMm: 205, aspect: 55, diameterIn: 16 }, 6.5);
    expect(b.diameterMm).toBeCloseTo(631.9, 1);

    // 225/45R17: 431.8 + 2 x 101.25 = 634.3 mm
    const c = mountTire({ sectionMm: 225, aspect: 45, diameterIn: 17 }, 7.5);
    expect(c.diameterMm).toBeCloseTo(634.3, 1);

    // 245/40R18: 457.2 + 2 x 98 = 653.2 mm
    const d = mountTire({ sectionMm: 245, aspect: 40, diameterIn: 18 }, 8.5);
    expect(d.diameterMm).toBeCloseTo(653.2, 1);
  });

  it('grows section width by 5 mm per half inch of rim', () => {
    // 205/55 measures on 6.5". On 8.0" that is +1.5" -> +30 mm -> 235 mm.
    const t = mountTire({ sectionMm: 205, aspect: 55, diameterIn: 16 }, 8.0);
    expect(t.sectionMm).toBeCloseTo(220, 1); // 205 + (8.0-6.5)*10
    // and on 5.5" that is -1.0" -> -20 mm -> 185 mm
    const n = mountTire({ sectionMm: 205, aspect: 55, diameterIn: 16 }, 5.5);
    expect(n.sectionMm).toBeCloseTo(195, 1);
  });

  it('marks stretch classes at the right boundaries', () => {
    // 205/40 measures on 7.0". On 8.0" that is +1.0" -> mild.
    expect(assessSidewall({ sectionMm: 205, aspect: 40, diameterIn: 16 }, 8.0).klass).toBe('mild');
    // 195/50 measures on 6.5". On 9.0" that is +2.5" -> beyond spec.
    expect(assessSidewall({ sectionMm: 195, aspect: 50, diameterIn: 15 }, 9.0).klass).toBe('beyond_spec');
    // on its own measuring rim -> oem
    expect(assessSidewall({ sectionMm: 195, aspect: 65, diameterIn: 15 }, 6.0).klass).toBe('oem');
    // narrower than the measuring rim -> balloon
    expect(assessSidewall({ sectionMm: 215, aspect: 60, diameterIn: 15 }, 5.5).klass).toBe('balloon');
  });

  it('flags a rim width outside the approved range', () => {
    const a = assessSidewall({ sectionMm: 205, aspect: 55, diameterIn: 16 }, 9.0,
      { approvedRimRangeIn: [5.5, 7.5] });
    expect(a.withinApprovedRange).toBe(false);
    expect(a.note).toMatch(/OUTSIDE the manufacturer approved range/);
    const b = assessSidewall({ sectionMm: 205, aspect: 55, diameterIn: 16 }, 7.0,
      { approvedRimRangeIn: [5.5, 7.5] });
    expect(b.withinApprovedRange).toBe(true);
  });

  it('uses measured rolling circumference when it exists', () => {
    const base = mountTire({ sectionMm: 205, aspect: 55, diameterIn: 16 }, 6.5);
    expect(base.circumferenceGrade).toBe('estimated');
    const measured = mountTire({ sectionMm: 205, aspect: 55, diameterIn: 16 }, 6.5, {
      rollingCircumferenceMm: 1935, grade: 'manufacturer_documented',
    });
    expect(measured.circumferenceMm).toBe(1935);
    expect(measured.circumferenceGrade).toBe('manufacturer_documented');
  });

  it('computes speedometer deviation against a baseline', () => {
    const baseline = mountTire({ sectionMm: 195, aspect: 65, diameterIn: 15 }, 6.0);
    const taller = mountTire({ sectionMm: 205, aspect: 65, diameterIn: 15 }, 6.5);
    // 205/65R15 = 381 + 266.5 = 647.5 vs 634.5 -> +2.049%
    expect(speedoDeviationPct(taller, baseline)).toBeCloseTo(2.05, 1);
  });
});

describe('assembly profile', () => {
  it('puts the widest point partway up the sidewall when not stretched', () => {
    // 195/65R15 on a 6J: section 195 (on its measuring rim), so the
    // sidewall at 97.5 mm half-width beats the 88.9 mm flange.
    const w = resolveWheel({ widthIn: 6, diameterIn: 15, etMm: 42 });
    const t = mountTire({ sectionMm: 195, aspect: 65, diameterIn: 15 }, 6.0);
    const wp = widestPoint(t, w.rimRadiusMm, w.overallWidthMm);
    expect(wp.halfWidthMm).toBeCloseTo(97.5, 1);
    expect(wp.rhoMm).toBeGreaterThan(w.rimRadiusMm);
    expect(wp.rhoMm).toBeLessThan(t.radiusMm);
  });

  it('makes the flange the widest point on a stretched fitment', () => {
    // 205/40R16 on an 8J: section 215 -> half 107.5, flange half 114.3.
    // The rim, not the tyre, is the outermost thing — which is why
    // stretched wheels are the ones with bent lips.
    const w = resolveWheel({ widthIn: 8, diameterIn: 16, etMm: 20 });
    const t = mountTire({ sectionMm: 205, aspect: 40, diameterIn: 16 }, 8.0);
    expect(t.sectionMm).toBeCloseTo(215, 1);
    const wp = widestPoint(t, w.rimRadiusMm, w.overallWidthMm);
    expect(wp.halfWidthMm).toBeCloseTo(114.3, 1);
  });

  it('returns the flange half-width inside the rim radius', () => {
    const w = resolveWheel({ widthIn: 7, diameterIn: 15, etMm: 30 });
    const t = mountTire({ sectionMm: 195, aspect: 65, diameterIn: 15 }, 7.0);
    expect(assemblyHalfWidth(100, t, w.rimRadiusMm, w.overallWidthMm))
      .toBeCloseTo(w.overallWidthMm / 2, 6);
  });
});

describe('size finder', () => {
  it('honours the diameter tolerance and excludes stretch when asked', () => {
    const baseline = mountTire({ sectionMm: 195, aspect: 65, diameterIn: 15 }, 6.0);
    const found = findTireSizes({
      diameterIn: 16, rimWidthIn: 8, baseline,
      tolerancePct: 3, approvedOnly: true, limit: 20,
    });
    expect(found.length).toBeGreaterThan(0);
    for (const c of found) {
      expect(Math.abs(c.deviationPct)).toBeLessThanOrEqual(3);
      expect(['balloon', 'full', 'oem', 'mild']).toContain(c.mounted.sidewall.klass);
    }
  });

  it('can be filtered to one sidewall class', () => {
    const baseline = mountTire({ sectionMm: 205, aspect: 55, diameterIn: 16 }, 6.5);
    const found = findTireSizes({
      diameterIn: 16, rimWidthIn: 8, baseline,
      tolerancePct: 5, wantClass: 'oem', limit: 20,
    });
    for (const c of found) expect(c.mounted.sidewall.klass).toBe('oem');
  });
});
