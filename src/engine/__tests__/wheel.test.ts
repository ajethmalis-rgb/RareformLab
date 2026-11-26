import { describe, it, expect } from 'vitest';
import {
  resolveWheel, assembleWheel, padDepthForTargetEt, hardwareCount, FLANGE_MM,
} from '../wheel';
import { mmToIn } from '../units';
import {
  FIXTURE_LIP_3IN, FIXTURE_BARREL_5_5IN, FIXTURE_DISC,
} from '@/data/fixtures';

/**
 * Every expectation below is hand-calculated in the comment above it.
 * Nothing here is snapshotted from the implementation's own output.
 */
describe('rim geometry, reference identities', () => {
  it('reproduces the standard shop formula for a J profile', () => {
    // BS(in) = (W + 1)/2 + ET/25.4, because 2 x 12.7 mm = 1 inch of flange.
    // 8J ET0  -> (8+1)/2 + 0      = 4.5000 in = 114.30 mm
    const a = resolveWheel({ widthIn: 8, diameterIn: 16, etMm: 0 });
    expect(a.backspacingMm).toBeCloseTo(114.3, 2);
    expect(a.backspacingIn).toBeCloseTo(4.5, 4);

    // 8J ET20 -> 4.5 + 20/25.4   = 5.28740 in = 134.30 mm
    const b = resolveWheel({ widthIn: 8, diameterIn: 16, etMm: 20 });
    expect(b.backspacingMm).toBeCloseTo(134.3, 2);
    expect(b.backspacingIn).toBeCloseTo(5.2874, 4);

    // 9J ET15 frontspacing -> (9+1)/2 - 15/25.4 = 4.40945 in = 112.00 mm
    const c = resolveWheel({ widthIn: 9, diameterIn: 17, etMm: 15 });
    expect(c.frontspacingMm).toBeCloseTo(112.0, 2);
    expect(c.frontspacingIn).toBeCloseTo(4.40945, 4);
  });

  it('handles negative offset', () => {
    // 10J ET-12 -> BS = (10+1)/2 + (-12)/25.4 = 5.5 - 0.47244 = 5.02756 in
    //           -> 127.70 mm.  Centre plane sits OUTBOARD of the hub face.
    const w = resolveWheel({ widthIn: 10, diameterIn: 17, etMm: -12 });
    expect(w.backspacingIn).toBeCloseTo(5.02756, 4);
    expect(w.backspacingMm).toBeCloseTo(127.7, 2);
    expect(w.centrePlaneX).toBeCloseTo(12, 6);
  });

  it('bead-seat distances follow the documented identity', () => {
    // 8J ET20: inner = W/2 + ET_eff = 101.6 + 20 = 121.6
    //          outer = W/2 - ET_eff = 101.6 - 20 =  81.6
    const w = resolveWheel({ widthIn: 8, diameterIn: 16, etMm: 20 });
    expect(w.innerBeadSeatDistanceMm).toBeCloseTo(121.6, 6);
    expect(w.outerBeadSeatDistanceMm).toBeCloseTo(81.6, 6);
    expect(w.nominalWidthMm).toBeCloseTo(203.2, 6);
  });

  it('treats a spacer as a reduction in effective offset', () => {
    // ET35 with a 15 mm spacer is geometrically ET20.
    const spaced = resolveWheel({ widthIn: 8, diameterIn: 16, etMm: 35, spacerMm: 15 });
    const plain = resolveWheel({ widthIn: 8, diameterIn: 16, etMm: 20 });
    expect(spaced.etEffMm).toBe(20);
    expect(spaced.backspacingMm).toBeCloseTo(plain.backspacingMm, 6);
    expect(spaced.outerFlangeX).toBeCloseTo(plain.outerFlangeX, 6);
  });

  it('derives physical width from flange geometry, not the nominal shortcut', () => {
    // A K profile carries 14.2 mm of flange per side, so overall width is
    // 203.2 + 28.4 = 231.6 mm, NOT the 228.6 mm the "+1 inch" rule gives.
    const j = resolveWheel({ widthIn: 8, diameterIn: 16, etMm: 20, profile: 'J' });
    const k = resolveWheel({ widthIn: 8, diameterIn: 16, etMm: 20, profile: 'K' });
    expect(j.overallWidthMm).toBeCloseTo(228.6, 6);
    expect(k.overallWidthMm).toBeCloseTo(231.6, 6);
    expect(k.backspacingMm).toBeCloseTo(135.8, 6); // 20 + 101.6 + 14.2
    expect(k.backspacingMm).not.toBeCloseTo(j.backspacingMm, 2);
    expect(FLANGE_MM.K).toBe(14.2);
  });

  it('accepts a measured flange width over the profile lookup', () => {
    const w = resolveWheel({
      widthIn: 8, diameterIn: 16, etMm: 20,
      flangeInnerMm: 11.0, flangeOuterMm: 15.0,
    });
    expect(w.backspacingMm).toBeCloseTo(132.6, 6); // 20 + 101.6 + 11.0
    expect(w.frontspacingMm).toBeCloseTo(96.6, 6); // -20 + 101.6 + 15.0
  });
});

describe('multipiece assembly', () => {
  it('computes finished width from mating geometry, not advertised sum', () => {
    // Lip 3.0" + barrel 5.5" = 8.5" advertised.
    // Mate allowance 6.35 + 6.35 = 12.70 mm = 0.5", so finished bead-seat
    // width is 8.0". Advertised sum does NOT equal finished width.
    const r = assembleWheel({
      construction: 'three_piece', diameterIn: 16,
      outerLip: FIXTURE_LIP_3IN, innerBarrel: FIXTURE_BARREL_5_5IN,
      disc: FIXTURE_DISC,
    });
    expect(r.ok).toBe(true);
    expect(r.naiveWidthIn).toBeCloseTo(8.5, 4);
    expect(r.mateAllowanceMm).toBeCloseTo(12.7, 4);
    expect(r.achievedWidthIn).toBeCloseTo(8.0, 3);
  });

  it('derives offset from where the disc sits in the shell', () => {
    // ET_eff = W/2 + flangeOuter - padDepth
    //        = 101.6 + 12.7 - 76.2 = 38.1 mm
    // and the frontspacing must come back out as the pad depth, 76.2 mm.
    const r = assembleWheel({
      construction: 'three_piece', diameterIn: 16,
      outerLip: FIXTURE_LIP_3IN, innerBarrel: FIXTURE_BARREL_5_5IN,
      disc: FIXTURE_DISC, targetEtMm: 20,
    });
    expect(r.achievedEtMm).toBeCloseTo(38.1, 1);
    expect(r.geometry!.frontspacingMm).toBeCloseTo(76.2, 2);
    // Target vs achieved is surfaced rather than silently absorbed.
    expect(r.etErrorMm).toBeCloseTo(18.1, 1);
  });

  it('reports visible lip as pad depth less pad thickness', () => {
    // 3.0 in pad depth, 10 mm pad -> 3.0 - 0.39370 = 2.60630 in visible.
    const r = assembleWheel({
      construction: 'three_piece', diameterIn: 16,
      outerLip: FIXTURE_LIP_3IN, innerBarrel: FIXTURE_BARREL_5_5IN,
      disc: FIXTURE_DISC,
    });
    expect(r.exposedLipIn).toBeCloseTo(3.0 - mmToIn(10), 3);
    expect(r.exposedLipIn).toBeCloseTo(2.6063, 3);
  });

  it('shows no outer lip for a reverse-mount disc', () => {
    const r = assembleWheel({
      construction: 'three_piece', diameterIn: 16,
      outerLip: FIXTURE_LIP_3IN, innerBarrel: FIXTURE_BARREL_5_5IN,
      disc: { ...FIXTURE_DISC, mount: 'reverse_mount' },
    });
    expect(r.exposedLipIn).toBe(0);
  });

  it('inverts cleanly: pad depth for a target offset', () => {
    // Target ET20 on an 8.0" J shell -> padDepth = (101.6 + 12.7 - 20)/25.4
    //                                            = 94.3/25.4 = 3.71260 in
    const pd = padDepthForTargetEt(8.0, 12.7, 20);
    expect(pd).toBeCloseTo(3.7126, 4);
    const r = assembleWheel({
      construction: 'three_piece', diameterIn: 16,
      outerLip: { ...FIXTURE_LIP_3IN, widthIn: 3.25, mateAllowanceMm: 6.35 },
      innerBarrel: { ...FIXTURE_BARREL_5_5IN, widthIn: 5.25, mateAllowanceMm: 6.35 },
      disc: { ...FIXTURE_DISC, padDepthIn: pd },
      targetEtMm: 20,
    });
    expect(r.achievedWidthIn).toBeCloseTo(8.0, 3);
    expect(r.achievedEtMm).toBeCloseTo(20, 1);
    expect(r.etErrorMm).toBeCloseTo(0, 1);
  });

  it('rejects invalid combinations rather than inventing a wheel', () => {
    const mismatch = assembleWheel({
      construction: 'three_piece', diameterIn: 16,
      outerLip: FIXTURE_LIP_3IN,
      innerBarrel: { ...FIXTURE_BARREL_5_5IN, diameterIn: 17 },
      disc: FIXTURE_DISC,
    });
    expect(mismatch.ok).toBe(false);
    expect(mismatch.problems.join(' ')).toMatch(/share a diameter/i);

    const noBarrel = assembleWheel({
      construction: 'three_piece', diameterIn: 16,
      outerLip: FIXTURE_LIP_3IN, disc: FIXTURE_DISC,
    });
    expect(noBarrel.ok).toBe(false);
    expect(noBarrel.geometry).toBeNull();
    expect(Number.isNaN(noBarrel.achievedEtMm)).toBe(true);

    const lipAsShell = assembleWheel({
      construction: 'two_piece', diameterIn: 16,
      completeShell: FIXTURE_LIP_3IN, disc: FIXTURE_DISC,
    });
    expect(lipAsShell.ok).toBe(false);
    expect(lipAsShell.problems.join(' ')).toMatch(/not a complete shell/i);

    const monoblock = assembleWheel({
      construction: 'monoblock', diameterIn: 16, disc: FIXTURE_DISC,
    });
    expect(monoblock.ok).toBe(false);
    expect(monoblock.problems.join(' ')).toMatch(/no separable barrel/i);
  });

  it('scales hardware count with diameter and width', () => {
    expect(hardwareCount(15, 7)).toBe(18);
    expect(hardwareCount(15, 9)).toBe(24);
    expect(hardwareCount(17, 8)).toBe(24);
    expect(hardwareCount(17, 9)).toBe(30);
    expect(hardwareCount(19, 10)).toBe(36);
  });
});
