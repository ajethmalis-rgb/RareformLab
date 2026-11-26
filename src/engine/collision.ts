import { round, camberX, inToMm } from './units';
import {
  type Dimension, type EvidenceGrade, type ClearanceVerdict,
  type ArchModification, isKnown, isVerified,
} from './types';
import type { WheelGeometry } from './wheel';
import { assemblyHalfWidth, widestPoint, type MountedTire } from './tire';
import {
  ARCH_LATERAL_GAIN_MM, STANDARD_CONDITIONS,
  type CornerState, type EvaluationCondition, type CornerKinematics,
} from './kinematics';

// ----------------------------------------------------------------------
// The envelope: everything on the car a wheel can hit.
// ----------------------------------------------------------------------

export interface InnerObstruction {
  id: string;
  label: string;
  /** Radial distance from the spin axis to the nearest surface, mm. */
  radialMm: Dimension;
  /** Lateral depth INBOARD of the hub mounting plane, mm. */
  lateralDepthMm: Dimension;
  /** What this can contact: the rim barrel, the tyre, or either. */
  hits: 'barrel' | 'tyre' | 'both';
  /** True for surfaces that move with steering (tie rod, strut at lock). */
  steeringSensitive?: boolean;
}

export interface BrakeEnvelope {
  /** Largest radius of the caliper body from the spin axis, mm. */
  caliperRadialMm: Dimension;
  /** How far OUTBOARD of the hub mounting plane the caliper reaches, mm. */
  caliperAxialMm: Dimension;
  rotorDiameterMm: Dimension;
  /** Hub spigot outside diameter, mm. Must fit the wheel centre bore. */
  hubProtrusionDiaMm: Dimension;
  /** How far outboard the hub spigot stands, mm. */
  hubProtrusionMm: Dimension;
}

export interface CornerEnvelope {
  axle: 'front' | 'rear';
  /** Hub centre to the fender lip, vertical, at the factory reference height. */
  archRadiusMm: Dimension;
  /** Hub mounting plane to the fender lip, lateral. */
  archLateralMm: Dimension;
  /** Hub centre to the top of the inner wheel well. */
  wellCeilingMm: Dimension;
  inner: InnerObstruction[];
  brake: BrakeEnvelope;
  kinematics: CornerKinematics;
}

export interface Thresholds {
  archStaticMm: number;
  archDynamicMm: number;
  innerMm: number;
  caliperRadialMm: number;
  caliperAxialMm: number;
  wellCeilingMm: number;
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  archStaticMm: 10,
  archDynamicMm: 8,
  innerMm: 8,
  caliperRadialMm: 3,
  caliperAxialMm: 2,
  wellCeilingMm: 15,
};

/**
 * Default rim barrel wall thickness, mm. A REFERENCE value, graded
 * `estimated`, so any caliper check resting on it is reported as
 * indeterminate rather than green. Supply a measured barrel profile
 * through `ClearanceInput.barrelWallMm` and the check becomes
 * verifiable — which is the point of making it an input rather than
 * a constant.
 */
export const BARREL_WALL_MM = 6;
export const DEFAULT_BARREL_WALL: Dimension = {
  value: BARREL_WALL_MM, unit: 'mm', toleranceMm: 1.5,
  grade: 'estimated', method: 'derived',
  source: 'reference value for a typical multipiece barrel',
};

// ----------------------------------------------------------------------
// Results
// ----------------------------------------------------------------------

/**
 * `clearance` results are gaps measured in tens of millimetres, and a
 * minimum-clearance floor applies to them. `fitment` results are
 * assembly interfaces whose correct value is sub-millimetre — a centre
 * bore 0.25 mm larger than the hub spigot is right, not tight — so a
 * clearance floor must never be applied to them.
 */
export type ResultKind = 'clearance' | 'fitment';

export interface ClearanceResult {
  componentId: string;
  label: string;
  kind: ResultKind;
  conditionId: string;
  conditionLabel: string;
  /**
   * The FORMAL verdict. Honours the evidence rule: a region whose
   * governing dimension is estimated or unknown is `indeterminate`,
   * never `clear`, whatever the arithmetic says.
   */
  verdict: ClearanceVerdict;
  /**
   * What the geometry says if the inputs are taken at face value.
   * Useful for ranking options. Not a safety statement.
   */
  modelledVerdict: ClearanceVerdict;
  /** Minimum modelled distance, mm. Null when not evaluable. */
  minDistanceMm: number | null;
  /** Combined tolerance of the governing inputs, mm. */
  toleranceMm: number;
  /** Worst grade among the inputs that governed this result. */
  governingGrade: EvidenceGrade;
  thresholdMm: number;
  note: string;
}

export interface ClearanceReport {
  results: ClearanceResult[];
  /** Worst formal verdict across every result. */
  overall: ClearanceVerdict;
  /** Worst modelled verdict, ignoring evidence grade. */
  overallModelled: ClearanceVerdict;
  /** The single tightest evaluable result. */
  binding: ClearanceResult | null;
  conditionsEvaluated: string[];
  conditionsSkipped: { id: string; reason: string }[];
  /** Geometry facts that do not depend on the car at all. */
  pokeMm: number;
  archGapMm: number | null;
  assemblyWidestHalfMm: number;
  limitations: string[];
}

const SEVERITY: Record<ClearanceVerdict, number> = {
  clear: 0, indeterminate: 1, marginal: 2, interference: 3,
};
const worse = (a: ClearanceVerdict, b: ClearanceVerdict): ClearanceVerdict =>
  SEVERITY[b] > SEVERITY[a] ? b : a;

const GRADE_RANK: Record<EvidenceGrade, number> = {
  manufacturer_documented: 4, professionally_measured: 3,
  community_reported: 2, estimated: 1, unknown: 0,
};
function worstGrade(...gs: EvidenceGrade[]): EvidenceGrade {
  let out: EvidenceGrade = 'manufacturer_documented';
  for (const g of gs) if (GRADE_RANK[g] < GRADE_RANK[out]) out = g;
  return out;
}

/** Arithmetic verdict from a distance and a threshold. */
function modelled(distanceMm: number, thresholdMm: number): ClearanceVerdict {
  if (distanceMm < 0) return 'interference';
  if (distanceMm < thresholdMm) return 'marginal';
  return 'clear';
}

/**
 * Apply the evidence rule. An interference prediction is reported even
 * on weak data — a predicted hit is useful information at any grade —
 * but a PASS requires verified inputs. Unknown is never green.
 */
function formalise(m: ClearanceVerdict, grade: EvidenceGrade): ClearanceVerdict {
  if (grade === 'unknown') return 'indeterminate';
  if (m === 'interference') return 'interference';
  if (!isVerified(grade)) return 'indeterminate';
  return m;
}

// ----------------------------------------------------------------------
// The solver
// ----------------------------------------------------------------------

export interface ClearanceInput {
  envelope: CornerEnvelope;
  wheel: WheelGeometry;
  tire: MountedTire;
  /** State at the static ride height. Compression is applied per condition. */
  state: CornerState;
  archMod: ArchModification;
  thresholds?: Thresholds;
  conditions?: EvaluationCondition[];
  /** Measured centre bore of the wheel, mm. */
  wheelCentreBoreMm?: number;
  /** Radius from the spin axis to the back of the spokes, mm. */
  spokeBackRadiusMm?: number;
  /** Measured barrel wall thickness. Defaults to an estimated reference. */
  barrelWallMm?: Dimension;
}

export function analyseClearance(input: ClearanceInput): ClearanceReport {
  const { envelope: env, wheel, tire, state, archMod } = input;
  const th = input.thresholds ?? DEFAULT_THRESHOLDS;
  const conditions = input.conditions ?? STANDARD_CONDITIONS;
  const results: ClearanceResult[] = [];
  const skipped: { id: string; reason: string }[] = [];
  const limitations: string[] = [];

  const archGain = ARCH_LATERAL_GAIN_MM[archMod] ?? 0;
  const camberRate = env.kinematics.curve
    ? null
    : (state.totalTravelMm === 0 ? 0 : state.camberDeg / state.totalTravelMm);

  const widest = widestPoint(tire, wheel.rimRadiusMm, wheel.overallWidthMm);

  // Poke is pure geometry plus camber; it needs nothing from the car but
  // the lip position, and it is a bodywork-coverage fact, not a rub.
  const pokeMm = isKnown(env.archLateralMm)
    ? camberX(wheel.centrePlaneX + widest.halfWidthMm, widest.rhoMm, state.camberDeg)
      - (env.archLateralMm.value + archGain)
    : Number.NaN;

  const archGapMm = isKnown(env.archRadiusMm)
    ? env.archRadiusMm.value - state.dropMm - tire.radiusMm
    : null;

  if (!env.kinematics.curve)
    limitations.push('No measured kinematic curve for this corner: camber through travel is estimated from the architecture’s typical gain rate.');
  if (!env.kinematics.steeringAxis)
    limitations.push('No steering-axis geometry: steered conditions are not evaluated.');
  limitations.push('Results describe the discrete conditions listed, not continuous motion between them.');

  for (const cond of conditions) {
    if (cond.requiresSteeringGeometry && !env.kinematics.steeringAxis) {
      skipped.push({ id: cond.id, reason: 'steering-axis geometry unavailable' });
      continue;
    }

    const compression = state.remainingTravelMm * cond.compressionFraction;
    const camber = camberRate === null
      ? state.camberDeg
      : state.camberDeg + camberRate * compression;

    // ---- 1. fender arch lip -------------------------------------------
    // The fender opening is a circular arc of radius archR about the hub
    // centre. The assembly is a solid of revolution, so a point on its
    // surface at radius rho sweeps that whole arc as the wheel turns.
    // Points with rho < archR pass INSIDE the opening and can never
    // reach the lip, however far outboard they sit. That is exactly what
    // tuck is, and it is why a short tyre under a tall arch can stand
    // proud of the bodywork without rubbing.
    if (isKnown(env.archRadiusMm) && isKnown(env.archLateralMm)) {
      const archR = env.archRadiusMm.value - state.dropMm - compression;
      const lipX = env.archLateralMm.value + archGain;
      // The tyre's radius decides whether the assembly reaches the lip at
      // all, so its grade is load-bearing here too. A nominal size
      // designation is not a measurement: real overall diameters vary by
      // a couple of percent between makes in the same stamped size.
      const grade = worstGrade(
        env.archRadiusMm.grade, env.archLateralMm.grade, tire.diameterGrade,
        state.camberGrade, cond.compressionFraction > 0 ? state.travelGrade : 'manufacturer_documented',
      );
      const tol = env.archRadiusMm.toleranceMm + env.archLateralMm.toleranceMm;
      const threshold = cond.compressionFraction > 0 ? th.archDynamicMm : th.archStaticMm;

      if (archR >= tire.radiusMm) {
        results.push({
          componentId: 'fender_lip', label: 'Fender arch lip', kind: 'clearance',
          conditionId: cond.id, conditionLabel: cond.label,
          verdict: formalise('clear', grade), modelledVerdict: 'clear',
          minDistanceMm: null, toleranceMm: tol, governingGrade: grade,
          thresholdMm: threshold,
          note: `Whole assembly stays inside the arch opening (lip radius ${round(archR)} mm vs tyre radius ${round(tire.radiusMm)} mm). It cannot reach the lip in this condition.`,
        });
      } else {
        let min = Infinity, atRho = 0;
        const N = 48;
        for (let i = 0; i <= N; i++) {
          const rho = archR + (tire.radiusMm - archR) * (i / N);
          const half = assemblyHalfWidth(rho, tire, wheel.rimRadiusMm, wheel.overallWidthMm);
          const x = camberX(wheel.centrePlaneX + half, rho, camber);
          const gap = lipX - x;
          if (gap < min) { min = gap; atRho = rho; }
        }
        const m = modelled(min, threshold);
        results.push({
          componentId: 'fender_lip', label: 'Fender arch lip', kind: 'clearance',
          conditionId: cond.id, conditionLabel: cond.label,
          verdict: formalise(m, grade), modelledVerdict: m,
          minDistanceMm: round(min, 1), toleranceMm: tol, governingGrade: grade,
          thresholdMm: threshold,
          note: `Closest approach at radius ${round(atRho)} mm from the spin axis${archMod !== 'untouched' ? `, including ${round(archGain)} mm credited to the worked arch` : ''}.`,
        });
      }
    } else {
      results.push({
        componentId: 'fender_lip', label: 'Fender arch lip', kind: 'clearance',
        conditionId: cond.id, conditionLabel: cond.label,
        verdict: 'indeterminate', modelledVerdict: 'indeterminate',
        minDistanceMm: null, toleranceMm: 0,
        governingGrade: 'unknown', thresholdMm: th.archStaticMm,
        note: 'Arch position unknown for this corner. Measure lip-to-hub vertical and hub-face-to-lip lateral.',
      });
    }

    // ---- 2. wheel well ceiling ----------------------------------------
    if (isKnown(env.wellCeilingMm)) {
      const ceiling = env.wellCeilingMm.value - state.dropMm - compression;
      const d = ceiling - tire.radiusMm;
      const grade = worstGrade(env.wellCeilingMm.grade, tire.diameterGrade,
        cond.compressionFraction > 0 ? state.travelGrade : 'manufacturer_documented');
      const m = modelled(d, th.wellCeilingMm);
      results.push({
        componentId: 'well_ceiling', label: 'Inner wheel well ceiling', kind: 'clearance',
        conditionId: cond.id, conditionLabel: cond.label,
        verdict: formalise(m, grade), modelledVerdict: m,
        minDistanceMm: round(d, 1), toleranceMm: env.wellCeilingMm.toleranceMm,
        governingGrade: grade, thresholdMm: th.wellCeilingMm,
        note: 'Tread to the top of the well. The tyre tucks up into the well above the lip, so this is the vertical ceiling, not the arch.',
      });
    } else {
      results.push({
        componentId: 'well_ceiling', label: 'Inner wheel well ceiling', kind: 'clearance',
        conditionId: cond.id, conditionLabel: cond.label,
        verdict: 'indeterminate', modelledVerdict: 'indeterminate',
        minDistanceMm: null, toleranceMm: 0, governingGrade: 'unknown',
        thresholdMm: th.wellCeilingMm, note: 'Well ceiling height not recorded for this corner.',
      });
    }

    // ---- 3. inner obstructions ----------------------------------------
    for (const ob of env.inner) {
      if (ob.steeringSensitive && !env.kinematics.steeringAxis) {
        results.push({
          componentId: ob.id, label: ob.label, kind: 'clearance',
          conditionId: cond.id, conditionLabel: cond.label,
          verdict: 'indeterminate', modelledVerdict: 'indeterminate',
          minDistanceMm: null, toleranceMm: 0, governingGrade: 'unknown',
          thresholdMm: th.innerMm,
          note: 'This component moves with steering and no steering geometry is available, so it is not evaluated.',
        });
        continue;
      }
      if (!isKnown(ob.radialMm) || !isKnown(ob.lateralDepthMm)) {
        results.push({
          componentId: ob.id, label: ob.label, kind: 'clearance',
          conditionId: cond.id, conditionLabel: cond.label,
          verdict: 'indeterminate', modelledVerdict: 'indeterminate',
          minDistanceMm: null, toleranceMm: 0, governingGrade: 'unknown',
          thresholdMm: th.innerMm, note: 'Position not recorded.',
        });
        continue;
      }

      // The inboard surface of the assembly at the obstruction's radius,
      // expressed as depth inboard of the hub mounting plane. Negative
      // camber swings the inboard upper shoulder further inboard, which
      // is why camber costs inner clearance even as it buys arch
      // clearance.
      const rho = Math.min(ob.radialMm.value, tire.radiusMm);
      const halfAtRho = ob.hits === 'barrel'
        ? wheel.overallWidthMm / 2
        : assemblyHalfWidth(rho, tire, wheel.rimRadiusMm, wheel.overallWidthMm);
      const innerX = camberX(wheel.centrePlaneX - halfAtRho, rho, camber);
      const depthInboard = -innerX;
      const d = ob.lateralDepthMm.value - depthInboard;

      const grade = worstGrade(ob.radialMm.grade, ob.lateralDepthMm.grade, state.camberGrade);
      const m = modelled(d, th.innerMm);
      results.push({
        componentId: ob.id, label: ob.label, kind: 'clearance',
        conditionId: cond.id, conditionLabel: cond.label,
        verdict: formalise(m, grade), modelledVerdict: m,
        minDistanceMm: round(d, 1),
        toleranceMm: ob.radialMm.toleranceMm + ob.lateralDepthMm.toleranceMm,
        governingGrade: grade, thresholdMm: th.innerMm,
        note: `Assembly reaches ${round(depthInboard)} mm inboard of the hub face at radius ${round(rho)} mm; this component sits at ${round(ob.lateralDepthMm.value)} mm. More offset moves toward it, less offset away.`,
      });
    }

    // ---- 4. brake caliper, radial -------------------------------------
    if (isKnown(env.brake.caliperRadialMm)) {
      const wall = input.barrelWallMm ?? DEFAULT_BARREL_WALL;
      const barrelInner = wheel.rimRadiusMm - wall.value;
      const d = barrelInner - env.brake.caliperRadialMm.value;
      const grade = worstGrade(env.brake.caliperRadialMm.grade, wall.grade);
      const m = modelled(d, th.caliperRadialMm);
      results.push({
        componentId: 'caliper_radial', label: 'Caliper, radial to barrel', kind: 'clearance',
        conditionId: cond.id, conditionLabel: cond.label,
        verdict: formalise(m, grade), modelledVerdict: m,
        minDistanceMm: round(d, 1),
        toleranceMm: env.brake.caliperRadialMm.toleranceMm + wall.toleranceMm,
        governingGrade: grade, thresholdMm: th.caliperRadialMm,
        note: `Barrel inner radius ${round(barrelInner)} mm against a caliper reaching ${round(env.brake.caliperRadialMm.value)} mm.`
          + (isVerified(wall.grade)
            ? ` Barrel wall ${round(wall.value)} mm from a measured profile.`
            : ` Barrel wall is a ${round(wall.value)} mm reference value, so this is a screening check only — a measured barrel profile is what settles it.`),
      });
    }

    // ---- 5. caliper, axial to spoke back ------------------------------
    if (isKnown(env.brake.caliperAxialMm) && input.spokeBackRadiusMm !== undefined) {
      const d = input.spokeBackRadiusMm - env.brake.caliperAxialMm.value;
      const grade = worstGrade(env.brake.caliperAxialMm.grade, 'estimated');
      const m = modelled(d, th.caliperAxialMm);
      results.push({
        componentId: 'caliper_axial', label: 'Caliper, axial to spoke back', kind: 'clearance',
        conditionId: cond.id, conditionLabel: cond.label,
        verdict: formalise(m, grade), modelledVerdict: m,
        minDistanceMm: round(d, 1), toleranceMm: env.brake.caliperAxialMm.toleranceMm,
        governingGrade: grade, thresholdMm: th.caliperAxialMm,
        note: 'Needs the disc’s measured spoke-back profile to be more than a screening check.',
      });
    }
  }

  // ---- static compatibility, condition-independent ---------------------
  if (input.wheelCentreBoreMm !== undefined && isKnown(env.brake.hubProtrusionDiaMm)) {
    const d = (input.wheelCentreBoreMm - env.brake.hubProtrusionDiaMm.value) / 2;
    const m: ClearanceVerdict = d < 0 ? 'interference' : d < 0.1 ? 'marginal' : 'clear';
    results.push({
      componentId: 'centre_bore', label: 'Centre bore to hub spigot', kind: 'fitment',
      conditionId: 'static', conditionLabel: 'Assembly',
      verdict: formalise(m, env.brake.hubProtrusionDiaMm.grade), modelledVerdict: m,
      minDistanceMm: round(d, 2), toleranceMm: env.brake.hubProtrusionDiaMm.toleranceMm,
      governingGrade: env.brake.hubProtrusionDiaMm.grade, thresholdMm: 0.1,
      note: d < 0
        ? 'Centre bore is smaller than the hub spigot. The wheel will not seat; the bore must be machined or a different centre used.'
        : 'Clearance per side. A hub-centric ring is required where this is more than about 0.5 mm.',
    });
  }

  const evaluable = results.filter(r => r.minDistanceMm !== null && r.verdict !== 'indeterminate');
  const binding = evaluable.length
    ? evaluable.reduce((a, b) => (b.minDistanceMm! < a.minDistanceMm! ? b : a))
    : null;

  return {
    results,
    overall: results.reduce<ClearanceVerdict>((acc, r) => worse(acc, r.verdict), 'clear'),
    overallModelled: results.reduce<ClearanceVerdict>((acc, r) => worse(acc, r.modelledVerdict), 'clear'),
    binding,
    conditionsEvaluated: [...new Set(results.map(r => r.conditionId))],
    conditionsSkipped: skipped,
    pokeMm: Number.isFinite(pokeMm) ? round(pokeMm, 1) : Number.NaN,
    archGapMm: archGapMm === null ? null : round(archGapMm, 1),
    assemblyWidestHalfMm: round(widest.halfWidthMm, 1),
    limitations,
  };
}

// ----------------------------------------------------------------------
// Baseline comparison. No car geometry required, so this is always exact.
// ----------------------------------------------------------------------

export interface FitmentDelta {
  /** Positive = the assembly moves OUTBOARD, toward the fender. */
  outboardMm: number;
  /** Positive = the assembly moves INBOARD, toward the strut. */
  inboardMm: number;
  /** Positive = the rim's outer flange moves outboard. */
  rimOutboardMm: number;
  rimInboardMm: number;
  /** Change in half-track per corner, mm. */
  halfTrackMm: number;
  diameterMm: number;
  radiusMm: number;
  speedoPct: number;
  overallWidthMm: number;
}

export function compareToBaseline(
  proposedWheel: WheelGeometry, proposedTire: MountedTire,
  baselineWheel: WheelGeometry, baselineTire: MountedTire,
): FitmentDelta {
  const pw = widestPoint(proposedTire, proposedWheel.rimRadiusMm, proposedWheel.overallWidthMm);
  const bw = widestPoint(baselineTire, baselineWheel.rimRadiusMm, baselineWheel.overallWidthMm);
  const pOut = proposedWheel.centrePlaneX + pw.halfWidthMm;
  const bOut = baselineWheel.centrePlaneX + bw.halfWidthMm;
  const pIn = -(proposedWheel.centrePlaneX - pw.halfWidthMm);
  const bIn = -(baselineWheel.centrePlaneX - bw.halfWidthMm);
  return {
    outboardMm: round(pOut - bOut, 1),
    inboardMm: round(pIn - bIn, 1),
    rimOutboardMm: round(proposedWheel.outerFlangeX - baselineWheel.outerFlangeX, 1),
    rimInboardMm: round(proposedWheel.backspacingMm - baselineWheel.backspacingMm, 1),
    halfTrackMm: round(-proposedWheel.etEffMm - -baselineWheel.etEffMm, 1),
    diameterMm: round(proposedTire.diameterMm - baselineTire.diameterMm, 1),
    radiusMm: round((proposedTire.diameterMm - baselineTire.diameterMm) / 2, 1),
    speedoPct: round((proposedTire.circumferenceMm / baselineTire.circumferenceMm - 1) * 100, 2),
    overallWidthMm: round(proposedWheel.overallWidthMm - baselineWheel.overallWidthMm, 1),
  };
}

export { inToMm };
