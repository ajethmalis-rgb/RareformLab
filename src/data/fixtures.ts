import { dim, type ArchModification, type Dimension } from '@/engine/types';
import type { CornerEnvelope } from '@/engine/collision';
import type { BarrelComponent, DiscComponent } from '@/engine/wheel';
import type { SuspensionInput } from '@/engine/kinematics';
import { derivedMeasuringRimIn, type TireData, type TireSize } from '@/engine/tire';

/**
 * SYNTHETIC TEST FIXTURE — not a real car.
 *
 * Every dimension here is DEFINED rather than measured, so it is graded
 * `manufacturer_documented` legitimately: the fixture IS the document.
 * Its job is to prove the collision engine returns the right verdict
 * from the right arithmetic, on geometry whose answers can be worked out
 * by hand. The real vehicle library is a separate matter entirely, and
 * nothing in it carries grades like these until somebody measures a car.
 *
 * The three reference cases below are hand-calculated in
 * src/engine/__tests__/collision.test.ts.
 */
export const FIXTURE_CORNER: CornerEnvelope = {
  axle: 'front',
  archRadiusMm: dim(360, 'manufacturer_documented', { method: 'declared', source: 'synthetic fixture FIX-1' }),
  archLateralMm: dim(90, 'manufacturer_documented', { method: 'declared', source: 'synthetic fixture FIX-1' }),
  wellCeilingMm: dim(480, 'manufacturer_documented', { method: 'declared', source: 'synthetic fixture FIX-1' }),
  inner: [
    {
      id: 'strut_body',
      label: 'Strut body',
      radialMm: dim(150, 'manufacturer_documented', { method: 'declared' }),
      lateralDepthMm: dim(150, 'manufacturer_documented', { method: 'declared' }),
      hits: 'both',
    },
  ],
  brake: {
    caliperRadialMm: dim(140, 'manufacturer_documented', { method: 'declared' }),
    caliperAxialMm: dim(30, 'manufacturer_documented', { method: 'declared' }),
    rotorDiameterMm: dim(280, 'manufacturer_documented', { method: 'declared' }),
    hubProtrusionDiaMm: dim(56.6, 'manufacturer_documented', { method: 'declared' }),
    hubProtrusionMm: dim(8, 'manufacturer_documented', { method: 'declared' }),
  },
  kinematics: {
    architecture: 'macpherson_strut',
    bumpTravelMm: 80,
    // A declared linear curve, so camber results are graded as measured
    // rather than estimated and the engine can return a formal PASS.
    curve: [
      { travelMm: 0, camberDeg: 0, trackDeltaMm: 0 },
      { travelMm: 80, camberDeg: -0.96, trackDeltaMm: -4 },
    ],
    curveGrade: 'professionally_measured',
  },
};

/** Static, no drop, travel declared so every grade is verified. */
export const FIXTURE_SUSPENSION: SuspensionInput = {
  package: 'factory',
  dropMm: 0,
  compressionMm: 0,
  travelMmOverride: 80,
  travelGradeOverride: 'manufacturer_documented',
};

export const FIXTURE_ARCH: ArchModification = 'untouched';

/**
 * Declared barrel wall for the fixture. Supplying this is what lets the
 * caliper-radial check reach a verified verdict instead of sitting at
 * indeterminate on the estimated default.
 */
export const FIXTURE_BARREL_WALL: Dimension = dim(6, 'manufacturer_documented', {
  method: 'declared', toleranceMm: 0, source: 'synthetic fixture FIX-1',
});

/**
 * Declared tyre data for the fixture.
 *
 * The values deliberately equal what the nominal formula produces, so the
 * hand calculations in the tests stay readable; the point is the GRADE,
 * not the numbers. Supplying it is what lets a clearance result that
 * depends on tyre radius reach a verified verdict.
 *
 * Nothing like this ships for real tyres. A measured section width or
 * overall diameter has to come from the maker's own data sheet or a
 * caliper, and inventing one would be exactly the fabrication this
 * product exists to avoid.
 */
export function fixtureTireData(size: TireSize): TireData {
  const nominalDia = size.diameterIn * 25.4 + 2 * (size.sectionMm * size.aspect) / 100;
  return {
    measuringRimIn: derivedMeasuringRimIn(size),
    approvedRimRangeIn: [derivedMeasuringRimIn(size) - 1, derivedMeasuringRimIn(size) + 1.5],
    measuredSectionMm: size.sectionMm,
    measuredDiameterMm: nominalDia,
    rollingCircumferenceMm: Math.PI * nominalDia * 0.97,
    grade: 'manufacturer_documented',
    brand: 'FIXTURE',
    model: 'FIX-1 reference tyre',
  };
}

/** Reference components for assembly tests. Synthetic part numbers. */
export const FIXTURE_LIP_3IN: BarrelComponent = {
  id: 'FIX-LIP-16-3.0',
  kind: 'outer_lip',
  diameterIn: 16,
  widthIn: 3.0,
  profile: 'J',
  flangeMm: 12.7,
  mateAllowanceMm: 6.35,
  supplier: 'fixture',
  partNumber: 'FIX-OL-1630',
};

export const FIXTURE_BARREL_5_5IN: BarrelComponent = {
  id: 'FIX-BAR-16-5.5',
  kind: 'inner_barrel',
  diameterIn: 16,
  widthIn: 5.5,
  profile: 'J',
  flangeMm: 12.7,
  mateAllowanceMm: 6.35,
  supplier: 'fixture',
  partNumber: 'FIX-IB-1655',
};

export const FIXTURE_DISC: DiscComponent = {
  id: 'FIX-DISC-16-PD3.0',
  name: 'Fixture flat face, 3.0 in pad depth',
  padDepthIn: 3.0,
  padThicknessMm: 10,
  mount: 'front_mount',
  boltPattern: { count: 5, pcdMm: 120 },
  centreBoreMm: 57.1,
  faceDiameterIn: 16,
  assemblyFlangeDiaMm: 330,
};
