import { z } from 'zod';
import {
  MeasurementMethod, METHOD_TOLERANCE_MM, PROFESSIONAL_METHODS,
  SuspensionPackage, Axle,
} from './types';

/**
 * MEASUREMENT SUBMISSION
 *
 * The contribution record: one person, one car, one axle, one session with a
 * tape measure. This is the only route by which a real vehicle acquires
 * geometry in this product, so the schema is strict about the things that
 * decide whether the numbers mean anything later.
 *
 * Three fields do most of that work:
 *
 *   `variantKey`  Measurements are only comparable within an exact variant.
 *                 A 190E on sports suspension is not a 190E on standard
 *                 springs, and an M3's flared arch is not an E30's. Anything
 *                 that changes the envelope belongs in this key.
 *
 *   `bodyOriginal` A rolled, pulled or repaired arch makes the measurement
 *                 describe that car rather than the model. Such submissions
 *                 are kept and labelled, never aggregated into the consensus.
 *
 *   `method`      Sets the floor on the tolerance that can ever be claimed.
 *                 Agreement between tape measurements cannot manufacture
 *                 sub-millimetre confidence.
 */

export const MeasurementKey = z.enum([
  'archRadiusMm',   // fender lip to hub centre, vertical
  'archLateralMm',  // hub mounting face to fender lip, lateral
  'innerDepthMm',   // hub mounting face to nearest inner obstruction
  'travelMm',       // hub travel remaining to the bump stop
  'wellCeilingMm',  // hub centre to the top of the inner wheel well
  'caliperRadialMm',
  'caliperAxialMm',
  'hubSpigotDiaMm',
  /*
   * Camber in DEGREES, read at the stated ride-height drop. It belongs here
   * rather than being left to the architecture's typical gain rate, because
   * camber is what decides where the tyre's shoulder actually sits against
   * the arch. Several cars of one variant measured at the same height are
   * corroborating a real point on that variant's camber curve, which is far
   * better evidence than a rule of thumb for the suspension type.
   */
  'camberDeg',
]);
export type MeasurementKey = z.infer<typeof MeasurementKey>;

export const MEASUREMENT_LABEL: Record<MeasurementKey, string> = {
  archRadiusMm: 'Fender lip to hub centre, vertical',
  archLateralMm: 'Hub face to fender lip, lateral',
  innerDepthMm: 'Hub face to nearest inner obstruction',
  travelMm: 'Hub travel remaining to the bump stop',
  wellCeilingMm: 'Hub centre to top of the wheel well',
  caliperRadialMm: 'Caliper outer radius from the spin axis',
  caliperAxialMm: 'Caliper reach outboard of the hub face',
  hubSpigotDiaMm: 'Hub spigot outside diameter',
  camberDeg: 'Camber at this ride height, degrees',
};

/**
 * Not every measurement is in millimetres. A scale converts a method's
 * repeatability into the units of the key, so agreement bands and
 * tolerances stay meaningful: a tape measure good to 3 mm reads camber off
 * a gauge to roughly a quarter of a degree, not to three.
 */
export const KEY_TOLERANCE_SCALE: Partial<Record<MeasurementKey, number>> = {
  camberDeg: 0.08,
};
export const KEY_UNIT: Partial<Record<MeasurementKey, string>> = {
  camberDeg: '\u00b0',
};
export const unitFor = (k: MeasurementKey): string => KEY_UNIT[k] ?? 'mm';

/** The four that make a corner analysable. Everything else is a bonus. */
export const CORE_KEYS: readonly MeasurementKey[] =
  ['archRadiusMm', 'archLateralMm', 'innerDepthMm', 'travelMm'];

/**
 * Physically possible range for each measurement, in mm. These are sanity
 * bounds, not accuracy claims: they exist to reject a transposed digit or a
 * centimetres-for-millimetres mistake before a human ever reads it.
 */
export const PLAUSIBLE_RANGE: Record<MeasurementKey, [number, number]> = {
  archRadiusMm: [200, 600],
  archLateralMm: [10, 260],
  innerDepthMm: [60, 320],
  travelMm: [0, 180],
  wellCeilingMm: [250, 800],
  caliperRadialMm: [60, 260],
  caliperAxialMm: [0, 120],
  hubSpigotDiaMm: [40, 120],
  camberDeg: [-8, 5],
};

export const SubmissionStatus = z.enum(['pending', 'accepted', 'rejected', 'superseded']);
export type SubmissionStatus = z.infer<typeof SubmissionStatus>;

export const Submission = z.object({
  id: z.string().min(1),
  /** Exact variant. Everything that changes the envelope belongs in here. */
  variantKey: z.string().min(1),
  vehicleId: z.string().min(1),
  axle: Axle,

  /** Stable identifier for the person. Corroboration counts people, not rows. */
  submitterId: z.string().min(1),
  submitterName: z.string().default(''),
  /** Set by a reviewer for shops with instruments, never self-asserted. */
  submitterVerified: z.boolean().default(false),
  submittedAt: z.string(),

  /** Conditions the measurement was taken under. */
  suspensionPackage: SuspensionPackage,
  rideHeightDropMm: z.number().min(0).max(200),
  /** False for any rolled, pulled, flared or repaired arch. */
  bodyOriginal: z.boolean(),
  brakePackage: z.string().default('factory'),
  /** The wheel actually on the car, which is what makes the figures checkable. */
  wheelOnCar: z.object({
    widthIn: z.number().positive(),
    diameterIn: z.number().positive(),
    etMm: z.number(),
    tireSectionMm: z.number().positive(),
    tireAspect: z.number().positive(),
  }).optional(),

  method: MeasurementMethod,
  values: z.record(MeasurementKey, z.number()).refine(
    v => Object.keys(v).length > 0, 'a submission must carry at least one measurement'),
  notes: z.string().default(''),

  status: SubmissionStatus.default('pending'),
  reviewNote: z.string().default(''),
  reviewedBy: z.string().default(''),
  reviewedAt: z.string().optional(),
});
export type Submission = z.infer<typeof Submission>;

export interface ValidationIssue {
  key: MeasurementKey | 'submission';
  severity: 'reject' | 'flag';
  message: string;
}

/**
 * Pre-review validation. Catches what arithmetic can catch, so a reviewer
 * only ever looks at submissions that are at least physically possible.
 *
 * The cross-check is the useful one: if the submitter told us which wheel is
 * on the car, the arch radius has to exceed that tyre's radius, or the car
 * would be sitting on its own bodywork. That single comparison catches most
 * mis-measurements, because the commonest error is measuring to the tyre
 * rather than to the hub centre.
 */
export function validateSubmission(sub: Submission): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const [k, v] of Object.entries(sub.values) as [MeasurementKey, number][]) {
    if (!Number.isFinite(v)) {
      issues.push({ key: k, severity: 'reject', message: 'Not a number.' });
      continue;
    }
    const range = PLAUSIBLE_RANGE[k];
    if (!range) continue;
    if (v < range[0] || v > range[1]) {
      issues.push({
        key: k, severity: 'reject',
        message: `${v} mm is outside the possible range ${range[0]}–${range[1]} mm. Check the units and the datum.`,
      });
    }
  }

  const w = sub.wheelOnCar;
  if (w) {
    const tyreRadius = (w.diameterIn * 25.4) / 2 + (w.tireSectionMm * w.tireAspect) / 100;
    const archR = sub.values.archRadiusMm;
    if (archR !== undefined && Number.isFinite(archR)) {
      if (archR < tyreRadius) {
        issues.push({
          key: 'archRadiusMm', severity: 'reject',
          message: `Lip-to-hub of ${Math.round(archR)} mm is less than the fitted tyre's radius of ${Math.round(tyreRadius)} mm. The car would be resting on its own arch. This is usually a measurement taken to the top of the tyre rather than to the hub centre.`,
        });
      } else if (archR - tyreRadius > 160) {
        issues.push({
          key: 'archRadiusMm', severity: 'flag',
          message: `Implies a ${Math.round(archR - tyreRadius)} mm arch gap, which is unusually large. Plausible on an unladen van or a lifted car; worth confirming.`,
        });
      }
    }
    const lat = sub.values.archLateralMm;
    if (lat !== undefined && Number.isFinite(lat)) {
      const halfSection = w.tireSectionMm / 2;
      if (lat - (-w.etMm + halfSection) < -60) {
        issues.push({
          key: 'archLateralMm', severity: 'flag',
          message: 'Implies the fitted tyre already stands well proud of the arch. Correct on a deliberately poking setup, otherwise check the datum is the hub mounting face.',
        });
      }
    }
  }

  if (!sub.bodyOriginal) {
    issues.push({
      key: 'submission', severity: 'flag',
      message: 'Arch is not original. The submission is kept and shown, but it is excluded from the consensus because it describes this car rather than the model.',
    });
  }
  if (sub.method === 'photogrammetry') {
    issues.push({
      key: 'submission', severity: 'flag',
      message: 'Photogrammetry is admissible only with a calibration reference in frame. Confirm one was used.',
    });
  }
  if (sub.method === 'unknown' || sub.method === 'declared' || sub.method === 'derived') {
    issues.push({
      key: 'submission', severity: 'reject',
      message: 'A submission must state how it was measured. Derived and declared values are not measurements.',
    });
  }
  return issues;
}

export const isRejectable = (issues: ValidationIssue[]): boolean =>
  issues.some(i => i.severity === 'reject');

export const toleranceFor = (m: MeasurementMethod, key?: MeasurementKey): number => {
  const base = METHOD_TOLERANCE_MM[m] ?? 25;
  const scale = key ? (KEY_TOLERANCE_SCALE[key] ?? 1) : 1;
  return base * scale;
};

export const isProfessionalMethod = (m: MeasurementMethod): boolean =>
  PROFESSIONAL_METHODS.includes(m);

/**
 * Variant key. Measurements only aggregate within one of these, so the key
 * has to carry everything that moves the envelope.
 */
export function variantKey(parts: {
  vehicleId: string; axle: Axle;
  suspensionPackage: SuspensionPackage; brakePackage?: string;
}): string {
  return [parts.vehicleId, parts.axle, parts.suspensionPackage,
    (parts.brakePackage || 'factory')].join('|');
}
