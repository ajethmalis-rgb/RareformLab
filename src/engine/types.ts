import { z } from 'zod';

/**
 * Evidence grading. Every physical dimension in the library carries one.
 * The collision engine refuses to return a PASS verdict for a region
 * whose governing dimension is `estimated` or `unknown`; it returns
 * INDETERMINATE instead. This is the single most important type in the
 * codebase — it is what stops the product from inventing safety.
 */
export const EvidenceGrade = z.enum([
  'manufacturer_documented',  // factory drawing, TIS, homologation doc
  'professionally_measured',  // CMM, calibrated jig, scan by a shop
  'community_corroborated',   // N independent owners, agreeing within tolerance
  'community_reported',       // a single owner measurement, stated method
  'estimated',                // derived or inferred — NOT a measurement
  'unknown',                  // absent
]);
export type EvidenceGrade = z.infer<typeof EvidenceGrade>;

/**
 * Grades the engine will treat as load-bearing for a pass/fail verdict.
 *
 * `community_corroborated` is in this list deliberately, and it is the most
 * consequential decision in the data model. Several independent people,
 * measuring the same variant with a tape and arriving within a few
 * millimetres of each other, have produced real evidence — that is how
 * engineering data gets validated everywhere else, and refusing to admit it
 * would make the contribution loop pointless. Nobody measures their car for
 * a badge that stays grey forever.
 *
 * What keeps it honest is the bar in `aggregate.ts`: distinct submitters,
 * agreement inside a stated tolerance, outliers excluded rather than
 * averaged away, and the spread carried forward into the reported margin.
 * A single submission never reaches this grade however confident it sounds.
 */
export const VERIFIED_GRADES: readonly EvidenceGrade[] = [
  'manufacturer_documented',
  'professionally_measured',
  'community_corroborated',
];

export const isVerified = (g: EvidenceGrade): boolean =>
  VERIFIED_GRADES.includes(g);

/** Ordering for "which of these is the weaker claim". */
export const GRADE_RANK: Record<EvidenceGrade, number> = {
  manufacturer_documented: 5,
  professionally_measured: 4,
  community_corroborated: 3,
  community_reported: 2,
  estimated: 1,
  unknown: 0,
};

export function weakestGrade(...gs: EvidenceGrade[]): EvidenceGrade {
  let out: EvidenceGrade = 'manufacturer_documented';
  for (const g of gs) if (GRADE_RANK[g] < GRADE_RANK[out]) out = g;
  return out;
}

export const MeasurementMethod = z.enum([
  'factory_drawing', 'cad_model', 'cmm', 'laser_scan', 'calibrated_jig',
  'tape_measure', 'caliper', 'photogrammetry', 'derived', 'declared', 'unknown',
]);
export type MeasurementMethod = z.infer<typeof MeasurementMethod>;

/** Methods that are instrument-grade rather than hand-held. */
export const PROFESSIONAL_METHODS: readonly MeasurementMethod[] = [
  'cmm', 'laser_scan', 'calibrated_jig', 'cad_model', 'factory_drawing',
];

/**
 * Typical repeatability of each method, as a half-width in mm. Used as the
 * floor on a consensus tolerance: agreement between submissions can never
 * claim a tighter figure than the instrument allows.
 */
export const METHOD_TOLERANCE_MM: Record<MeasurementMethod, number> = {
  factory_drawing: 0.5, cad_model: 0.5, cmm: 0.5, laser_scan: 1,
  calibrated_jig: 1.5, caliper: 1, tape_measure: 3,
  photogrammetry: 5, derived: 10, declared: 0, unknown: 25,
};

/**
 * A single scalar dimension with its provenance. `toleranceMm` is the
 * half-width of the uncertainty band, so the true value is assumed to
 * lie in [value - tolerance, value + tolerance]. The collision engine
 * propagates it into the reported margin.
 */
export const Dimension = z.object({
  /**
   * NaN is the explicit marker for "known to be absent". It is admitted
   * deliberately so an unknown dimension can never be mistaken for zero;
   * `isKnown` is the guard every consumer must pass it through first.
   */
  value: z.union([z.number(), z.nan()]),
  unit: z.literal('mm').default('mm'),
  toleranceMm: z.number().nonnegative().default(0),
  grade: EvidenceGrade,
  method: MeasurementMethod.default('unknown'),
  source: z.string().default(''),
  measuredAt: z.string().optional(),
  note: z.string().optional(),
});
export type Dimension = z.infer<typeof Dimension>;

export const dim = (
  value: number,
  grade: EvidenceGrade = 'estimated',
  opts: Partial<Omit<Dimension, 'value' | 'grade'>> = {},
): Dimension => Dimension.parse({ value, grade, ...opts });

/** An absent dimension. Reads as unknown, never as zero. */
export const unknownDim = (note = ''): Dimension =>
  Dimension.parse({ value: Number.NaN, grade: 'unknown', method: 'unknown', note });

export const isKnown = (d: Dimension | undefined): d is Dimension =>
  !!d && Number.isFinite(d.value) && d.grade !== 'unknown';

// ----------------------------------------------------------------------
// Wheel
// ----------------------------------------------------------------------

/** Rim flange profile. Governs physical flange width per side. */
export const RimProfile = z.enum(['J', 'JJ', 'K', 'B', 'custom']);
export type RimProfile = z.infer<typeof RimProfile>;

export const ConstructionType = z.enum([
  'monoblock', 'two_piece', 'three_piece', 'three_piece_reverse',
]);
export type ConstructionType = z.infer<typeof ConstructionType>;

export const MountStyle = z.enum(['front_mount', 'sandwich_mount', 'reverse_mount']);
export type MountStyle = z.infer<typeof MountStyle>;

export const SeatType = z.enum(['conical_60', 'ball_radius', 'flat_washer', 'unknown']);
export type SeatType = z.infer<typeof SeatType>;

export const BoltPattern = z.object({
  count: z.number().int().min(3).max(8),
  pcdMm: z.number().positive(),
});
export type BoltPattern = z.infer<typeof BoltPattern>;

export const boltPatternLabel = (b: BoltPattern): string =>
  `${b.count}x${b.pcdMm % 1 === 0 ? b.pcdMm : b.pcdMm.toFixed(1)}`;

// ----------------------------------------------------------------------
// Suspension
// ----------------------------------------------------------------------

/**
 * Suspension architecture. The `camberGainDegPer10mm` on each is a
 * TYPICAL rate for the architecture, graded `estimated`. It is not a
 * measured kinematic curve for any specific car, and the engine labels
 * any result that depends on it accordingly.
 */
export const SuspensionArchitecture = z.enum([
  'macpherson_strut', 'double_wishbone', 'strut_torsion_bar',
  'semi_trailing_arm', 'multilink', 'swing_axle_low_pivot', 'live_axle',
]);
export type SuspensionArchitecture = z.infer<typeof SuspensionArchitecture>;

export const SuspensionPackage = z.enum([
  'factory', 'lowering_springs', 'coilover_standard',
  'coilover_short_stroke', 'air_driving', 'air_parked', 'custom',
]);
export type SuspensionPackage = z.infer<typeof SuspensionPackage>;

export const Axle = z.enum(['front', 'rear']);
export type Axle = z.infer<typeof Axle>;

export const ArchModification = z.enum(['untouched', 'rolled', 'rolled_and_pulled']);
export type ArchModification = z.infer<typeof ArchModification>;

// ----------------------------------------------------------------------
// Verdicts
// ----------------------------------------------------------------------

/**
 * GREEN is only ever returned for a condition that was actually
 * evaluated against verified geometry, with the margin exceeding the
 * configured safety threshold. An unevaluated or unknown region is
 * GRAY (indeterminate) — never green.
 */
export const ClearanceVerdict = z.enum([
  'clear',          // green  — modelled clearance above threshold, verified inputs
  'marginal',       // amber  — within threshold, or verified but tight
  'interference',   // red    — predicted contact
  'indeterminate',  // gray   — governing geometry missing, estimated, or unevaluated
]);
export type ClearanceVerdict = z.infer<typeof ClearanceVerdict>;

export const VERDICT_COLOR: Record<ClearanceVerdict, string> = {
  clear: '#4fa97e',
  marginal: '#e07b39',
  interference: '#ce4038',
  indeterminate: '#7c858f',
};

export const VehicleAssetState = z.enum([
  'verified_geometry',    // dimensioned, graded, usable for clearance analysis
  'illustrative_only',    // visual asset present, NOT usable for clearance
  'catalog_entry_only',   // name/variant known, no geometry at all
]);
export type VehicleAssetState = z.infer<typeof VehicleAssetState>;
