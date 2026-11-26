import { dim, unknownDim, type BoltPattern, type SuspensionArchitecture, type VehicleAssetState } from '@/engine/types';
import type { CornerEnvelope } from '@/engine/collision';
import type { TireSize } from '@/engine/tire';

/**
 * VEHICLE LIBRARY
 *
 * Read this before trusting anything in here.
 *
 * A catalogue entry is a NAME, not an engineering asset. Almost every
 * vehicle below ships as `catalog_entry_only`: the chassis exists in the
 * picker so the shape of the library is visible, and selecting it tells
 * you honestly that there is no geometry to analyse. Nothing is
 * backfilled with plausible-looking numbers.
 *
 * `illustrative_only` means a dimensioned envelope exists but is
 * ESTIMATED — anchored so the factory wheel reads correctly, and useful
 * for ranking options against each other. It is not a measurement of
 * any particular car and the engine will not return a green verdict
 * from it.
 *
 * `verified_geometry` is reserved for envelopes where every governing
 * dimension was measured or documented. At present exactly one thing in
 * this repository qualifies, and it is a synthetic fixture, not a car.
 *
 * Fastener and bolt-pattern data is graded `community_reported`: it is
 * well established in the enthusiast record but is not transcribed from
 * a factory document held here.
 */

export interface FactoryWheelPackage {
  label: string;
  widthIn: number;
  diameterIn: number;
  etMm: number;
  tire: TireSize;
  axle?: 'front' | 'rear' | 'both';
  note?: string;
}

export interface VehicleVariant {
  id: string;
  make: 'BMW' | 'Mercedes-Benz' | 'Porsche' | 'FIXTURE';
  model: string;
  chassis: string;
  years: string;
  bodyStyle: string;
  trim?: string;
  market?: string;
  assetState: VehicleAssetState;
  bolt: BoltPattern;
  boltGrade: 'manufacturer_documented' | 'community_reported' | 'unknown';
  centreBoreMm: number;
  seat: 'conical_60' | 'ball_radius' | 'flat_washer' | 'unknown';
  fastener: 'bolt' | 'stud_nut';
  frontArchitecture: SuspensionArchitecture;
  rearArchitecture: SuspensionArchitecture;
  factoryPackages: FactoryWheelPackage[];
  /** Present only for illustrative or verified entries. */
  front?: CornerEnvelope;
  rear?: CornerEnvelope;
  notes: string[];
}

/** Shorthand for a corner with no geometry at all. */
function emptyCorner(
  axle: 'front' | 'rear', architecture: SuspensionArchitecture, bumpTravelMm = 80,
): CornerEnvelope {
  return {
    axle,
    archRadiusMm: unknownDim('not measured'),
    archLateralMm: unknownDim('not measured'),
    wellCeilingMm: unknownDim('not measured'),
    inner: [],
    brake: {
      caliperRadialMm: unknownDim(), caliperAxialMm: unknownDim(),
      rotorDiameterMm: unknownDim(), hubProtrusionDiaMm: unknownDim(),
      hubProtrusionMm: unknownDim(),
    },
    kinematics: { architecture, bumpTravelMm },
  };
}

/**
 * Build an ESTIMATED envelope anchored on the factory package.
 *
 * The anchoring rule: the arch radius is the factory tyre's radius plus
 * the stated factory gap, and the lip sits laterally at the factory
 * assembly's widest point plus the stated tuck. That makes the preset
 * self-consistent — the factory wheel necessarily reads as fitting —
 * without pretending the numbers came off a real car. Every dimension
 * is graded `estimated` and the engine refuses to go green on them.
 */
function estimatedCorner(opts: {
  axle: 'front' | 'rear';
  architecture: SuspensionArchitecture;
  factoryTireRadiusMm: number;
  factoryGapMm: number;
  factoryWidestLateralMm: number;
  tuckMm: number;
  wellAboveLipMm: number;
  innerDepthMm: number;
  bumpTravelMm: number;
  source: string;
}): CornerEnvelope {
  const g = 'estimated' as const;
  const meta = { method: 'derived' as const, source: opts.source, toleranceMm: 12 };
  return {
    axle: opts.axle,
    archRadiusMm: dim(opts.factoryTireRadiusMm + opts.factoryGapMm, g, meta),
    archLateralMm: dim(opts.factoryWidestLateralMm + opts.tuckMm, g, meta),
    wellCeilingMm: dim(opts.factoryTireRadiusMm + opts.factoryGapMm + opts.wellAboveLipMm, g, {
      ...meta, toleranceMm: 25,
    }),
    inner: [{
      id: opts.axle === 'front' ? 'strut_spring' : 'trailing_arm_spring',
      label: opts.axle === 'front' ? 'Strut body / spring' : 'Trailing arm / spring',
      radialMm: dim(150, g, meta),
      lateralDepthMm: dim(opts.innerDepthMm, g, meta),
      hits: 'both',
    }],
    brake: {
      caliperRadialMm: unknownDim('caliper envelope not measured'),
      caliperAxialMm: unknownDim('caliper envelope not measured'),
      rotorDiameterMm: unknownDim(),
      hubProtrusionDiaMm: unknownDim(),
      hubProtrusionMm: unknownDim(),
    },
    kinematics: { architecture: opts.architecture, bumpTravelMm: opts.bumpTravelMm },
  };
}

const BMW_4X100: BoltPattern = { count: 4, pcdMm: 100 };
const BMW_5X120: BoltPattern = { count: 5, pcdMm: 120 };
const MB_5X112: BoltPattern = { count: 5, pcdMm: 112 };
const P_5X130: BoltPattern = { count: 5, pcdMm: 130 };

type CatalogSeed = Omit<VehicleVariant, 'assetState' | 'front' | 'rear' | 'notes'>
  & { notes?: string[] };

function catalogOnly(seed: CatalogSeed): VehicleVariant {
  return {
    ...seed,
    assetState: 'catalog_entry_only',
    front: emptyCorner('front', seed.frontArchitecture),
    rear: emptyCorner('rear', seed.rearArchitecture),
    notes: [
      ...(seed.notes ?? []),
      'Catalogue entry only. No dimensioned wheel-well, caliper or suspension geometry exists for this variant, so clearance analysis is unavailable. Use the measurement workflow to contribute it.',
    ],
  };
}

const bmw = (
  id: string, model: string, chassis: string, years: string, bodyStyle: string,
  bolt: BoltPattern, centreBoreMm: number,
  frontArchitecture: SuspensionArchitecture, rearArchitecture: SuspensionArchitecture,
  factoryPackages: FactoryWheelPackage[] = [], notes: string[] = [],
): CatalogSeed => ({
  id, make: 'BMW', model, chassis, years, bodyStyle, bolt,
  boltGrade: 'community_reported', centreBoreMm, seat: 'conical_60', fastener: 'bolt',
  frontArchitecture, rearArchitecture, factoryPackages, notes,
});

const mb = (
  id: string, model: string, chassis: string, years: string, bodyStyle: string,
  frontArchitecture: SuspensionArchitecture, rearArchitecture: SuspensionArchitecture,
  factoryPackages: FactoryWheelPackage[] = [], notes: string[] = [],
): CatalogSeed => ({
  id, make: 'Mercedes-Benz', model, chassis, years, bodyStyle, bolt: MB_5X112,
  boltGrade: 'community_reported', centreBoreMm: 66.6, seat: 'conical_60', fastener: 'bolt',
  frontArchitecture, rearArchitecture, factoryPackages, notes,
});

const por = (
  id: string, model: string, chassis: string, years: string, bodyStyle: string,
  frontArchitecture: SuspensionArchitecture, rearArchitecture: SuspensionArchitecture,
  factoryPackages: FactoryWheelPackage[] = [], notes: string[] = [],
): CatalogSeed => ({
  id, make: 'Porsche', model, chassis, years, bodyStyle, bolt: P_5X130,
  boltGrade: 'community_reported', centreBoreMm: 71.6, seat: 'ball_radius', fastener: 'bolt',
  frontArchitecture, rearArchitecture, factoryPackages, notes,
});

const t = (sectionMm: number, aspect: number, diameterIn: number): TireSize =>
  ({ sectionMm, aspect, diameterIn });

// ----------------------------------------------------------------------
// The E32 demonstration target, explicitly illustrative.
// ----------------------------------------------------------------------
const E32_FACTORY: FactoryWheelPackage[] = [
  { label: '7J x 15 ET20, 225/60R15', widthIn: 7, diameterIn: 15, etMm: 20, tire: t(225, 60, 15), axle: 'both' },
  { label: '7.5J x 16 ET20, 225/55R16', widthIn: 7.5, diameterIn: 16, etMm: 20, tire: t(225, 55, 16), axle: 'both' },
];

const E32_SOURCE = 'estimated envelope anchored on the factory package; not a measurement of any car';

const e32: VehicleVariant = {
  ...bmw('bmw-e32-735i-1990', '735i', 'E32', '1986-1994', 'Saloon',
    BMW_5X120, 72.56, 'macpherson_strut', 'semi_trailing_arm', E32_FACTORY),
  trim: '735i',
  market: 'ROW',
  assetState: 'illustrative_only',
  front: estimatedCorner({
    axle: 'front', architecture: 'macpherson_strut',
    factoryTireRadiusMm: 325.5, factoryGapMm: 70,
    factoryWidestLateralMm: 92.5, tuckMm: 20,
    wellAboveLipMm: 115, innerDepthMm: 168, bumpTravelMm: 85,
    source: E32_SOURCE,
  }),
  rear: estimatedCorner({
    axle: 'rear', architecture: 'semi_trailing_arm',
    factoryTireRadiusMm: 325.5, factoryGapMm: 72,
    factoryWidestLateralMm: 92.5, tuckMm: 26,
    wellAboveLipMm: 120, innerDepthMm: 182, bumpTravelMm: 90,
    source: E32_SOURCE,
  }),
  notes: [
    'DEMONSTRATION TARGET. The envelope is ESTIMATED, anchored so the factory 7J x 15 ET20 package reads correctly. It has not been measured on a car.',
    'The 3D body is procedural demonstration geometry, not a scan or CAD of an E32. It is for styling and for showing the engine working, and it does not feed a verified clearance result.',
    'Rear is a semi-trailing arm: it gains camber quickly as it drops, so rear fitment is governed by that, not by your offset choice.',
    'Fitment cannot be asserted for this car until the four critical dimensions are measured. Run the measurement workflow.',
  ],
};

// ----------------------------------------------------------------------
// Full catalogue. Names only, honestly labelled.
// ----------------------------------------------------------------------
export const VEHICLES: VehicleVariant[] = [
  e32,

  // ---- BMW -----------------------------------------------------------
  catalogOnly(bmw('bmw-e9-30cs', '3.0 CS', 'E9', '1968-1975', 'Coupe', BMW_5X120, 72.56,
    'macpherson_strut', 'semi_trailing_arm',
    [{ label: '6J x 14 ET12, 195/70R14', widthIn: 6, diameterIn: 14, etMm: 12, tire: t(195, 70, 14) }])),
  catalogOnly(bmw('bmw-e10-2002', '2002', 'E10', '1966-1976', 'Coupe', BMW_4X100, 57.1,
    'macpherson_strut', 'semi_trailing_arm',
    [{ label: '4.5J x 13 ET6, 165R13', widthIn: 4.5, diameterIn: 13, etMm: 6, tire: t(165, 80, 13) }])),
  catalogOnly(bmw('bmw-e12-528i', '528i', 'E12', '1972-1981', 'Saloon', BMW_5X120, 72.56,
    'macpherson_strut', 'semi_trailing_arm')),
  catalogOnly(bmw('bmw-e21-323i', '323i', 'E21', '1975-1983', 'Coupe', BMW_4X100, 57.1,
    'macpherson_strut', 'semi_trailing_arm',
    [{ label: '5J x 13 ET18, 185/70R13', widthIn: 5, diameterIn: 13, etMm: 18, tire: t(185, 70, 13) }])),
  catalogOnly(bmw('bmw-e23-735i', '735i', 'E23', '1977-1986', 'Saloon', BMW_5X120, 72.56,
    'macpherson_strut', 'semi_trailing_arm')),
  catalogOnly(bmw('bmw-e24-635csi', '635 CSi', 'E24', '1976-1989', 'Coupe', BMW_5X120, 72.56,
    'macpherson_strut', 'semi_trailing_arm',
    [{ label: '6.5J x 14 ET20, 205/70R14', widthIn: 6.5, diameterIn: 14, etMm: 20, tire: t(205, 70, 14) }])),
  catalogOnly(bmw('bmw-e28-535i', '535i', 'E28', '1981-1988', 'Saloon', BMW_5X120, 72.56,
    'macpherson_strut', 'semi_trailing_arm',
    [{ label: '6.5J x 14 ET20, 195/70R14', widthIn: 6.5, diameterIn: 14, etMm: 20, tire: t(195, 70, 14) }])),
  catalogOnly(bmw('bmw-e30-325i', '325i', 'E30', '1982-1994', 'Coupe', BMW_4X100, 57.1,
    'macpherson_strut', 'semi_trailing_arm',
    [{ label: '6J x 14 ET42, 195/65R14', widthIn: 6, diameterIn: 14, etMm: 42, tire: t(195, 65, 14) }],
    ['Phase 4 priority for verified geometry.'])),
  catalogOnly(bmw('bmw-e30-m3', 'M3', 'E30', '1986-1991', 'Coupe', BMW_4X100, 57.1,
    'macpherson_strut', 'semi_trailing_arm',
    [{ label: '7J x 15 ET24, 205/55R15', widthIn: 7, diameterIn: 15, etMm: 24, tire: t(205, 55, 15) }],
    ['Flared arches: the envelope differs substantially from a standard E30 and must be measured separately.'])),
  catalogOnly(bmw('bmw-e31-850i', '850i', 'E31', '1989-1999', 'Coupe', BMW_5X120, 72.56,
    'macpherson_strut', 'multilink')),
  catalogOnly(bmw('bmw-e32-750il', '750iL', 'E32', '1986-1994', 'Saloon', BMW_5X120, 72.56,
    'macpherson_strut', 'semi_trailing_arm', E32_FACTORY,
    ['Long wheelbase and V12 front end: do not reuse the 735i envelope.'])),
  catalogOnly(bmw('bmw-e34-535i', '535i', 'E34', '1988-1996', 'Saloon', BMW_5X120, 72.56,
    'macpherson_strut', 'semi_trailing_arm',
    [{ label: '7J x 15 ET20, 205/65R15', widthIn: 7, diameterIn: 15, etMm: 20, tire: t(205, 65, 15) }],
    ['Phase 4 priority for verified geometry.'])),
  catalogOnly(bmw('bmw-e36-328i', '328i', 'E36', '1990-2000', 'Coupe', BMW_5X120, 72.56,
    'macpherson_strut', 'multilink',
    [{ label: '7J x 15 ET47, 205/60R15', widthIn: 7, diameterIn: 15, etMm: 47, tire: t(205, 60, 15) }],
    ['High factory offset. E36 wheels on an earlier chassis pull inboard toward the strut rather than outboard.'])),
  catalogOnly(bmw('bmw-e38-740i', '740i', 'E38', '1994-2001', 'Saloon', BMW_5X120, 72.56,
    'macpherson_strut', 'multilink')),
  catalogOnly(bmw('bmw-e39-540i', '540i', 'E39', '1995-2003', 'Saloon', BMW_5X120, 74.1,
    'double_wishbone', 'multilink')),
  catalogOnly(bmw('bmw-e46-m3', 'M3', 'E46', '2000-2006', 'Coupe', BMW_5X120, 72.56,
    'macpherson_strut', 'multilink')),
  catalogOnly(bmw('bmw-e60-545i', '545i', 'E60', '2003-2010', 'Saloon', BMW_5X120, 72.56,
    'double_wishbone', 'multilink')),
  catalogOnly(bmw('bmw-e63-645ci', '645Ci', 'E63', '2003-2010', 'Coupe', BMW_5X120, 72.56,
    'double_wishbone', 'multilink')),

  // ---- Mercedes-Benz -------------------------------------------------
  catalogOnly(mb('mb-w108-280se', '280 SE', 'W108', '1965-1972', 'Saloon',
    'double_wishbone', 'swing_axle_low_pivot',
    [{ label: '6J x 14 ET30, 185R14', widthIn: 6, diameterIn: 14, etMm: 30, tire: t(185, 80, 14) }],
    ['LOW-PIVOT SWING AXLE at the rear. Lowering pushes the top of the rear tyres OUTBOARD, so arch clearance gets worse as it goes down. Do not reason about this car from any other chassis here.'])),
  catalogOnly(mb('mb-w109-300sel', '300 SEL', 'W109', '1965-1972', 'Saloon',
    'double_wishbone', 'swing_axle_low_pivot', [],
    ['Self-levelling air rear. Ride height behaviour and camber curve differ from the W108 steel-sprung car.'])),
  catalogOnly(mb('mb-w114-250c', '250 C', 'W114', '1968-1976', 'Coupe',
    'double_wishbone', 'semi_trailing_arm')),
  catalogOnly(mb('mb-w115-240d', '240 D', 'W115', '1968-1976', 'Saloon',
    'double_wishbone', 'semi_trailing_arm')),
  catalogOnly(mb('mb-w116-450sel', '450 SEL', 'W116', '1972-1980', 'Saloon',
    'double_wishbone', 'semi_trailing_arm')),
  catalogOnly(mb('mb-w123-280ce', '280 CE', 'W123', '1976-1985', 'Coupe',
    'double_wishbone', 'semi_trailing_arm',
    [{ label: '5.5J x 14 ET30, 195/70R14', widthIn: 5.5, diameterIn: 14, etMm: 30, tire: t(195, 70, 14) }])),
  catalogOnly(mb('mb-w124-300e', '300 E', 'W124', '1984-1995', 'Saloon',
    'double_wishbone', 'multilink',
    [{ label: '6.5J x 15 ET37, 195/65R15', widthIn: 6.5, diameterIn: 15, etMm: 37, tire: t(195, 65, 15) }],
    ['Phase 4 priority for verified geometry.'])),
  catalogOnly(mb('mb-w126-560sec', '560 SEC', 'C126', '1979-1991', 'Coupe',
    'double_wishbone', 'semi_trailing_arm',
    [{ label: '6.5J x 15 ET25, 205/65R15', widthIn: 6.5, diameterIn: 15, etMm: 25, tire: t(205, 65, 15) }])),
  catalogOnly(mb('mb-w201-190e-16v', '190 E 2.3-16', 'W201', '1982-1993', 'Saloon',
    'macpherson_strut', 'multilink',
    [{ label: '7J x 15 ET44, 205/55R15', widthIn: 7, diameterIn: 15, etMm: 44, tire: t(205, 55, 15) }])),
  catalogOnly(mb('mb-w202-c36', 'C 36 AMG', 'W202', '1993-2000', 'Saloon',
    'double_wishbone', 'multilink')),
  catalogOnly(mb('mb-w210-e55', 'E 55 AMG', 'W210', '1995-2003', 'Saloon',
    'double_wishbone', 'multilink')),
  catalogOnly(mb('mb-r107-560sl', '560 SL', 'R107', '1971-1989', 'Roadster',
    'double_wishbone', 'semi_trailing_arm',
    [{ label: '6J x 14 ET30, 205/70R14', widthIn: 6, diameterIn: 14, etMm: 30, tire: t(205, 70, 14) }])),
  catalogOnly(mb('mb-r129-500sl', '500 SL', 'R129', '1989-2001', 'Roadster',
    'double_wishbone', 'multilink')),
  catalogOnly(mb('mb-w140-600sel', '600 SEL', 'W140', '1991-1998', 'Saloon',
    'double_wishbone', 'multilink')),

  // ---- Porsche -------------------------------------------------------
  catalogOnly(por('por-911-swb', '911', '901 / SWB', '1964-1968', 'Coupe',
    'strut_torsion_bar', 'semi_trailing_arm',
    [{ label: '4.5J x 15 ET?, 165HR15', widthIn: 4.5, diameterIn: 15, etMm: 42, tire: t(165, 80, 15) }],
    ['Offset for early cars is not reliably documented here and is marked unknown rather than guessed.'])),
  catalogOnly(por('por-911-lwb', '911 S', '901 / LWB', '1969-1973', 'Coupe',
    'strut_torsion_bar', 'semi_trailing_arm',
    [{ label: '6J x 15 ET36, 185/70R15', widthIn: 6, diameterIn: 15, etMm: 36, tire: t(185, 70, 15) }])),
  catalogOnly(por('por-911-sc', '911 SC', 'G-body', '1974-1983', 'Coupe',
    'strut_torsion_bar', 'semi_trailing_arm',
    [
      { label: 'Front 6J x 15 ET36, 185/70R15', widthIn: 6, diameterIn: 15, etMm: 36, tire: t(185, 70, 15), axle: 'front' },
      { label: 'Rear 7J x 15 ET23.3, 215/60R15', widthIn: 7, diameterIn: 15, etMm: 23.3, tire: t(215, 60, 15), axle: 'rear' },
    ],
    ['Staggered from the factory. Front and rear must be configured independently.'])),
  catalogOnly(por('por-930-turbo', '911 Turbo', '930', '1975-1989', 'Coupe',
    'strut_torsion_bar', 'semi_trailing_arm',
    [
      { label: 'Front 7J x 16 ET23.3, 205/55R16', widthIn: 7, diameterIn: 16, etMm: 23.3, tire: t(205, 55, 16), axle: 'front' },
      { label: 'Rear 8J x 16 ET10.6, 245/45R16', widthIn: 8, diameterIn: 16, etMm: 10.6, tire: t(245, 45, 16), axle: 'rear' },
    ])),
  catalogOnly(por('por-964-c2', '911 Carrera 2', '964', '1989-1994', 'Coupe',
    'strut_torsion_bar', 'multilink',
    [
      { label: 'Front 6J x 16 ET52, 205/55R16', widthIn: 6, diameterIn: 16, etMm: 52, tire: t(205, 55, 16), axle: 'front' },
      { label: 'Rear 8J x 16 ET52, 225/50R16', widthIn: 8, diameterIn: 16, etMm: 52, tire: t(225, 50, 16), axle: 'rear' },
    ],
    ['Phase 4 priority. Much higher factory offset than the G-body; coil-spring rear, not torsion bar.'])),
  catalogOnly(por('por-993-c2', '911 Carrera', '993', '1994-1998', 'Coupe',
    'strut_torsion_bar', 'multilink')),
  catalogOnly(por('por-996-c2', '911 Carrera', '996', '1997-2005', 'Coupe',
    'macpherson_strut', 'multilink')),
  catalogOnly(por('por-997-c2', '911 Carrera', '997', '2004-2012', 'Coupe',
    'macpherson_strut', 'multilink')),
  catalogOnly(por('por-924', '924', '924', '1976-1988', 'Coupe',
    'macpherson_strut', 'semi_trailing_arm')),
  catalogOnly(por('por-944-turbo', '944 Turbo', '944', '1985-1991', 'Coupe',
    'macpherson_strut', 'semi_trailing_arm',
    [
      { label: 'Front 7J x 16 ET23.3, 205/55R16', widthIn: 7, diameterIn: 16, etMm: 23.3, tire: t(205, 55, 16), axle: 'front' },
      { label: 'Rear 8J x 16 ET23.3, 225/50R16', widthIn: 8, diameterIn: 16, etMm: 23.3, tire: t(225, 50, 16), axle: 'rear' },
    ])),
  catalogOnly(por('por-968', '968', '968', '1991-1995', 'Coupe',
    'macpherson_strut', 'semi_trailing_arm')),
  catalogOnly(por('por-928-s4', '928 S4', '928', '1977-1995', 'Coupe',
    'double_wishbone', 'multilink',
    [{ label: '8J x 16 ET23.3, 225/50R16', widthIn: 8, diameterIn: 16, etMm: 23.3, tire: t(225, 50, 16) }],
    ['Weissach rear axle. Its toe-correcting geometry is not captured by a generic multi-link curve.'])),
  catalogOnly(por('por-986-boxster', 'Boxster S', '986', '1996-2004', 'Roadster',
    'macpherson_strut', 'multilink')),
  catalogOnly(por('por-987-cayman', 'Cayman S', '987', '2005-2012', 'Coupe',
    'macpherson_strut', 'multilink')),
];

export const byId = (id: string): VehicleVariant | undefined =>
  VEHICLES.find(v => v.id === id);

export const MAKES = ['BMW', 'Mercedes-Benz', 'Porsche'] as const;

export function groupedByMake(): { make: string; items: VehicleVariant[] }[] {
  return MAKES.map(make => ({
    make,
    items: VEHICLES.filter(v => v.make === make)
      .sort((a, b) => a.chassis.localeCompare(b.chassis) || a.model.localeCompare(b.model)),
  }));
}

export const LIBRARY_STATS = () => {
  const total = VEHICLES.length;
  const verified = VEHICLES.filter(v => v.assetState === 'verified_geometry').length;
  const illustrative = VEHICLES.filter(v => v.assetState === 'illustrative_only').length;
  return { total, verified, illustrative, catalogOnly: total - verified - illustrative };
};
