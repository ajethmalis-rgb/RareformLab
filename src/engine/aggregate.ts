import { round } from './units';
import {
  type Dimension, type EvidenceGrade, type MeasurementMethod,
} from './types';
import {
  type Submission, type MeasurementKey, CORE_KEYS,
  toleranceFor, isProfessionalMethod, MEASUREMENT_LABEL, unitFor,
} from './submission';

/**
 * CONSENSUS FROM CONTRIBUTED MEASUREMENTS
 *
 * This is the mechanism that lets the library compound. One person with a
 * tape measure produces a data point. Several independent people arriving at
 * the same figure produce evidence, and the difference between those two
 * things is the entire product.
 *
 * The bar for calling something corroborated:
 *
 *   1. at least MIN_CORROBORATION DISTINCT submitters — one enthusiastic
 *      owner measuring three times is still one opinion;
 *   2. their values agreeing inside a band derived from the instrument, so
 *      tape measurements can never claim caliper precision;
 *   3. outliers EXCLUDED rather than averaged away, because averaging a
 *      wrong number in moves the consensus toward it;
 *   4. no unresolved split — if the submissions form two camps rather than
 *      a cluster plus strays, that is a disagreement, not a consensus, and
 *      it is surfaced instead of being resolved by arithmetic.
 *
 * Everything uses the median and the median absolute deviation rather than
 * the mean and standard deviation. With four or five hand measurements, one
 * transposed digit destroys a mean; the median barely notices.
 */

export const MIN_CORROBORATION = 3;

/** Width of the agreement band, as a multiple of the instrument tolerance. */
export const AGREEMENT_FACTOR = 3;
/** Floor on that band: no instrument argument makes 1 mm agreement meaningful. */
export const AGREEMENT_FLOOR_MM = 5;

export function median(xs: number[]): number {
  if (xs.length === 0) return Number.NaN;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** Median absolute deviation: a spread measure one bad value cannot inflate. */
export function mad(xs: number[]): number {
  if (xs.length === 0) return Number.NaN;
  const m = median(xs);
  return median(xs.map(x => Math.abs(x - m)));
}

export interface ContributionPoint {
  submissionId: string;
  submitterId: string;
  submitterName: string;
  value: number;
  method: MeasurementMethod;
  submittedAt: string;
  outlier: boolean;
  deviationMm: number;
}

export interface Consensus {
  key: MeasurementKey;
  label: string;
  /** Agreed value, or NaN when there is nothing usable. */
  value: number;
  /** Half-width of the uncertainty band carried into the solver. */
  toleranceMm: number;
  grade: EvidenceGrade;
  points: ContributionPoint[];
  distinctSubmitters: number;
  /** Distinct submitters inside the agreement band. */
  agreeingSubmitters: number;
  spreadMm: number;
  agreementBandMm: number;
  /** Set when the submissions split into camps rather than cluster. */
  conflict: boolean;
  /** How many more distinct submitters would reach the next grade. */
  needsMore: number;
  note: string;
}

/**
 * Build a consensus for one measurement from a set of submissions.
 *
 * Submissions on modified bodywork are excluded from the consensus by the
 * caller, not here, so that they still appear in the record.
 */
export function consensusFor(key: MeasurementKey, subs: Submission[]): Consensus {
  const label = MEASUREMENT_LABEL[key];
  const usable = subs.filter(
    s => s.status === 'accepted' && Number.isFinite(s.values[key] as number));

  const empty = (note: string): Consensus => ({
    key, label, value: Number.NaN, toleranceMm: Number.NaN, grade: 'unknown',
    points: [], distinctSubmitters: 0, agreeingSubmitters: 0,
    spreadMm: Number.NaN, agreementBandMm: Number.NaN,
    conflict: false, needsMore: MIN_CORROBORATION, note,
  });
  if (usable.length === 0)
    return empty('No accepted submission carries this measurement yet.');

  const values = usable.map(s => s.values[key] as number);
  const med = median(values);
  const spread = mad(values);

  // Agreement band from the coarsest instrument in the set: a tape
  // measurement cannot inherit a caliper's tolerance by sitting next to one.
  const worstTol = Math.max(...usable.map(s => toleranceFor(s.method, key)));
  const unitScale = toleranceFor('tape_measure', key) / toleranceFor('tape_measure');
  const band = Math.max(AGREEMENT_FACTOR * worstTol, AGREEMENT_FLOOR_MM * unitScale);
  // MAD of zero (every value identical) must not make the threshold zero.
  const outlierThreshold = Math.max(3 * spread, band);

  /*
   * Scatter test, and it has to come before the outlier test rather than
   * after it. A MAD-derived threshold grows with the spread, so a set that
   * splits into two camps — say four submissions at 380, 381, 420, 421 —
   * produces a MAD of 20, a threshold of 60, and therefore NO outliers at
   * all. The arithmetic would then happily report a corroborated 400.5 mm,
   * a figure not one person measured and which sits between two real
   * clusters. When the scatter itself exceeds what the instrument can
   * explain, that is a disagreement about the variant, not a measurement
   * with noise in it, and no amount of further arithmetic should resolve it.
   */
  const scattered = spread > band;

  const points: ContributionPoint[] = usable.map(s => {
    const v = s.values[key] as number;
    const dev = Math.abs(v - med);
    return {
      submissionId: s.id, submitterId: s.submitterId,
      submitterName: s.submitterName, value: v, method: s.method,
      submittedAt: s.submittedAt,
      outlier: dev > outlierThreshold,
      deviationMm: round(dev, 1),
    };
  });

  const inliers = points.filter(p => !p.outlier);
  const outliers = points.filter(p => p.outlier);
  const distinctAll = new Set(points.map(p => p.submitterId)).size;
  const agreeing = new Set(inliers.map(p => p.submitterId)).size;

  // Two camps rather than a cluster plus strays. Arithmetic must not pick
  // a winner here; a person has to.
  const conflict = scattered || (outliers.length > 0 && outliers.length >= inliers.length);

  const inlierValues = inliers.map(p => p.value);
  const value = inlierValues.length ? median(inlierValues) : med;
  const inlierSpread = inlierValues.length > 1
    ? (Math.max(...inlierValues) - Math.min(...inlierValues)) / 2
    : 0;
  const bestMethodTol = Math.min(...(inliers.length ? inliers : points).map(p => toleranceFor(p.method, key)));
  const toleranceMm = Math.max(bestMethodTol, inlierSpread);

  const hasProfessional = (inliers.length ? inliers : points).some(p => {
    const sub = usable.find(s => s.id === p.submissionId);
    return isProfessionalMethod(p.method) && !!sub?.submitterVerified;
  });

  let grade: EvidenceGrade;
  let note: string;
  if (conflict) {
    grade = 'community_reported';
    note = scattered
      ? `Submissions are scattered across ${round(Math.max(...values) - Math.min(...values))} mm, far beyond the ${round(band)} mm the instrument explains. That is a disagreement about what this variant is, not measurement noise, so it is not promoted and no average is reported as the answer — the midpoint of two camps is a figure nobody measured. A reviewer has to decide whether these are really the same variant.`
      : `Submissions disagree: ${inliers.length} cluster around ${round(value)} mm and ${outliers.length} sit outside the ${round(band)} mm band. Not promoted — a reviewer needs to decide which describes the variant.`;
  } else if (hasProfessional) {
    grade = 'professionally_measured';
    note = `Instrument measurement from a verified submitter${agreeing > 1 ? `, corroborated by ${agreeing - 1} more` : ''}.`;
  } else if (agreeing >= MIN_CORROBORATION) {
    grade = 'community_corroborated';
    note = `${agreeing} independent submitters agree within ${round(toleranceMm, 2)} ${unitFor(key)}${outliers.length ? `; ${outliers.length} outlier excluded` : ''}.`;
  } else {
    grade = 'community_reported';
    const need = MIN_CORROBORATION - agreeing;
    note = `${agreeing} submitter${agreeing === 1 ? '' : 's'} so far. ${need} more agreeing measurement${need === 1 ? '' : 's'} promotes this to corroborated, which is what lets the solver return a pass on it.`;
  }

  return {
    key, label, value: round(value, 2), toleranceMm: round(toleranceMm, 2),
    grade, points, distinctSubmitters: distinctAll, agreeingSubmitters: agreeing,
    spreadMm: round(spread, 2), agreementBandMm: round(band, 2),
    conflict, needsMore: Math.max(0, MIN_CORROBORATION - agreeing), note,
  };
}

export interface VariantConsensus {
  variantKey: string;
  byKey: Partial<Record<MeasurementKey, Consensus>>;
  /** Submissions kept in the record but held out of the consensus. */
  excluded: { submissionId: string; reason: string }[];
  /** True when all four core measurements have reached a verified grade. */
  analysable: boolean;
  coreComplete: boolean;
  weakestCoreGrade: EvidenceGrade;
  pendingCount: number;
}

/**
 * Roll a variant's submissions up into the consensus the solver consumes.
 * Modified bodywork is held out here, with the reason recorded, so the
 * contribution still shows in the variant's history.
 */
export function aggregateVariant(variantKey: string, subs: Submission[]): VariantConsensus {
  const mine = subs.filter(s => s.variantKey === variantKey);
  const excluded: { submissionId: string; reason: string }[] = [];
  const eligible = mine.filter(s => {
    if (!s.bodyOriginal) {
      excluded.push({
        submissionId: s.id,
        reason: 'Arch is not original, so this describes the car rather than the model.',
      });
      return false;
    }
    return true;
  });

  const byKey: Partial<Record<MeasurementKey, Consensus>> = {};
  const keys = new Set<MeasurementKey>(CORE_KEYS);
  for (const s of eligible)
    for (const k of Object.keys(s.values) as MeasurementKey[]) keys.add(k);
  for (const k of keys) byKey[k] = consensusFor(k, eligible);

  const coreGrades = CORE_KEYS.map(k => byKey[k]?.grade ?? 'unknown');
  const rank: Record<EvidenceGrade, number> = {
    manufacturer_documented: 5, professionally_measured: 4,
    community_corroborated: 3, community_reported: 2, estimated: 1, unknown: 0,
  };
  const weakest = coreGrades.reduce<EvidenceGrade>(
    (a, g) => (rank[g] < rank[a] ? g : a), 'manufacturer_documented');

  return {
    variantKey, byKey, excluded,
    coreComplete: CORE_KEYS.every(k => Number.isFinite(byKey[k]?.value ?? Number.NaN)),
    analysable: rank[weakest] >= rank.community_corroborated,
    weakestCoreGrade: weakest,
    pendingCount: mine.filter(s => s.status === 'pending').length,
  };
}

/**
 * Convert a consensus into the Dimension the collision solver takes.
 *
 * A conflicted consensus returns null rather than its cluster median. The
 * median is still worth showing a reviewer — it says where one camp sits —
 * but feeding it to the solver would turn an unresolved disagreement into a
 * confident-looking clearance figure, which is the exact failure this whole
 * grading system exists to prevent.
 */
export function toDimension(c: Consensus | undefined): Dimension | null {
  if (!c || !Number.isFinite(c.value) || c.conflict) return null;
  return {
    value: c.value,
    unit: 'mm',
    toleranceMm: c.toleranceMm,
    grade: c.grade,
    method: 'tape_measure',
    source: `consensus of ${c.agreeingSubmitters} submitter${c.agreeingSubmitters === 1 ? '' : 's'}`,
    note: c.note,
  };
}

/**
 * What a variant needs next, phrased so it can be shown to a contributor as
 * a request rather than a status code.
 */
export function nextNeed(v: VariantConsensus): string {
  const missing = CORE_KEYS.filter(k => !Number.isFinite(v.byKey[k]?.value ?? Number.NaN));
  if (missing.length)
    return `Needs a first measurement of: ${missing.map(k => MEASUREMENT_LABEL[k].toLowerCase()).join(', ')}.`;
  const conflicted = CORE_KEYS.filter(k => v.byKey[k]?.conflict);
  if (conflicted.length)
    return `Submissions disagree on ${conflicted.map(k => MEASUREMENT_LABEL[k].toLowerCase()).join(' and ')}. A reviewer has to resolve that before this variant can be promoted.`;
  const short = CORE_KEYS
    .map(k => ({ k, c: v.byKey[k] }))
    .filter(x => (x.c?.needsMore ?? 0) > 0)
    .sort((a, b) => (b.c?.needsMore ?? 0) - (a.c?.needsMore ?? 0));
  if (short.length) {
    const worst = short[0]!;
    return `${worst.c!.needsMore} more independent measurement${worst.c!.needsMore === 1 ? '' : 's'} of ${MEASUREMENT_LABEL[worst.k].toLowerCase()} promotes this variant to corroborated.`;
  }
  return 'All four core measurements are corroborated. This variant returns real verdicts.';
}

// ----------------------------------------------------------------------
// Bridge to the collision solver
// ----------------------------------------------------------------------

import type { CornerEnvelope } from './collision';
import type { CornerKinematics } from './kinematics';
import { unknownDim } from './types';

/**
 * Build a corner envelope out of contributed measurements.
 *
 * This is the point of the whole contribution loop: the geometry handed to
 * the solver is identical in kind to the estimated preset it replaces, and
 * only the GRADE differs. A variant whose core measurements have reached
 * `community_corroborated` therefore starts returning real verdicts, with
 * no change to the solver at all.
 *
 * `fallback` supplies anything the community has not measured — typically
 * the wheel-well ceiling and the brake envelope — so a partially measured
 * corner improves rather than regressing to unknown.
 */
export function envelopeFromConsensus(
  v: VariantConsensus,
  kinematics: CornerKinematics,
  axle: 'front' | 'rear',
  innerLabel: string,
  fallback?: Partial<CornerEnvelope>,
): CornerEnvelope {
  const dim = (k: MeasurementKey) =>
    toDimension(v.byKey[k]) ?? undefined;

  const archRadiusMm = dim('archRadiusMm') ?? fallback?.archRadiusMm ?? unknownDim('not measured');
  const archLateralMm = dim('archLateralMm') ?? fallback?.archLateralMm ?? unknownDim('not measured');
  const wellCeilingMm = dim('wellCeilingMm') ?? fallback?.wellCeilingMm ?? unknownDim('not measured');
  const innerD = dim('innerDepthMm');

  return {
    axle,
    archRadiusMm, archLateralMm, wellCeilingMm,
    inner: innerD
      ? [{
          id: 'measured_inner', label: innerLabel,
          radialMm: { value: 150, unit: 'mm', toleranceMm: 25, grade: innerD.grade,
            method: 'tape_measure', source: innerD.source,
            note: 'Radial position assumed at tyre-shoulder height; the lateral depth is what was measured.' },
          lateralDepthMm: innerD,
          hits: 'both',
        }]
      : (fallback?.inner ?? []),
    brake: fallback?.brake ?? {
      caliperRadialMm: dim('caliperRadialMm') ?? unknownDim(),
      caliperAxialMm: dim('caliperAxialMm') ?? unknownDim(),
      rotorDiameterMm: unknownDim(),
      hubProtrusionDiaMm: dim('hubSpigotDiaMm') ?? unknownDim(),
      hubProtrusionMm: unknownDim(),
    },
    kinematics,
  };
}

/**
 * Camber from the consensus, for the ride height the contributors measured
 * at. Supplying this is what lets an arch verdict reach a verified grade:
 * without it the solver falls back to the architecture's typical gain rate,
 * which is `estimated` and drags every arch result down with it.
 */
export function camberOverrideFrom(v: VariantConsensus): { deg: number; grade: EvidenceGrade } | null {
  const c = v.byKey.camberDeg;
  if (!c || !Number.isFinite(c.value) || c.conflict) return null;
  return { deg: c.value, grade: c.grade };
}

/** Travel is a measurement too, and it governs every compressed condition. */
export function travelOverrideFrom(v: VariantConsensus): { mm: number; grade: EvidenceGrade } | null {
  const c = v.byKey.travelMm;
  if (!c || !Number.isFinite(c.value) || c.conflict) return null;
  return { mm: c.value, grade: c.grade };
}
