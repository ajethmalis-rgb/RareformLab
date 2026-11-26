import { round, clamp } from './units';
import type {
  EvidenceGrade, SuspensionArchitecture, SuspensionPackage, ArchModification,
} from './types';

/**
 * TYPICAL camber gain per architecture, degrees per 10 mm of body drop.
 * Every one of these is graded `estimated`. They are architecture-level
 * rules of thumb, not a measured kinematic curve for any specific car,
 * and anything computed from them inherits that grade.
 *
 * The sign on a low-pivot swing axle is the important one: dropping the
 * body pushes the wheels toward POSITIVE camber, so the top of the tyre
 * moves OUT and arch clearance gets worse as you lower it. That is the
 * opposite of every other architecture here, and it is why a lowered
 * W111 behaves nothing like a lowered W124.
 */
export const CAMBER_GAIN_PER_10MM: Record<SuspensionArchitecture, number> = {
  macpherson_strut: -0.12,
  double_wishbone: -0.14,
  strut_torsion_bar: -0.10,
  semi_trailing_arm: -0.28,
  multilink: -0.18,
  swing_axle_low_pivot: +0.20,
  live_axle: 0.0,
};

export const ARCHITECTURE_NOTE: Record<SuspensionArchitecture, string> = {
  macpherson_strut: 'Modest camber gain. The limiting component at the front is usually the strut or spring, not the fender.',
  double_wishbone: 'Predictable gain. Check the lower arm and the steering stop at full lock.',
  strut_torsion_bar: 'Ride height comes from re-indexing the torsion bar. Camber plates are the only real adjustment.',
  semi_trailing_arm: 'Gains camber quickly and toes in as it drops. Rear fitment is governed by this, not by offset.',
  multilink: 'Moderate gain, adjustable at the eccentrics. The most forgiving rear to fit.',
  swing_axle_low_pivot: 'Lowering pushes the TOP of the tyre OUTBOARD. Arch clearance gets worse the lower you go.',
  live_axle: 'No camber change with travel. Clearance is static: what you measure is what you get.',
};

/**
 * How much of the factory bump travel survives a given package.
 * Lowering on stock-length hardware spends travel to buy ride height;
 * short-stroke hardware with a shortened stop preserves it.
 */
export const TRAVEL_FACTOR: Record<SuspensionPackage, number> = {
  factory: 1.0,
  lowering_springs: 0.78,
  coilover_standard: 0.70,
  coilover_short_stroke: 1.05,
  air_driving: 0.76,
  air_parked: 0.0,
  custom: 1.0,
};

export const PACKAGE_LABEL: Record<SuspensionPackage, string> = {
  factory: 'Factory springs',
  lowering_springs: 'Lowering springs',
  coilover_standard: 'Coilover, stock-length body',
  coilover_short_stroke: 'Coilover, short stroke',
  air_driving: 'Air, driving height',
  air_parked: 'Air, parked / laid out',
  custom: 'Custom',
};

export const PACKAGE_NOTE: Record<SuspensionPackage, string> = {
  factory: 'Full factory travel on factory bump stops.',
  lowering_springs: 'Factory stops with less travel. The setup most likely to rub: travel is lost without being brought under control.',
  coilover_standard: 'Height from spring preload, which consumes travel. Common, and commonly rubs.',
  coilover_short_stroke: 'Shortened body and stop. Travel is preserved below the stop, so a smaller static gap is usable.',
  air_driving: 'Travel depends on bag type and cup. Sleeve bags over-travel more than double-bellows.',
  air_parked: 'Static geometry only, not a driving state. Clearance at this height describes a parked car.',
  custom: 'User-supplied travel and camber.',
};

export const ARCH_LATERAL_GAIN_MM: Record<ArchModification, number> = {
  untouched: 0,
  rolled: 8,
  rolled_and_pulled: 14,
};

/** A measured kinematic sample. Interpolated when a car actually has a curve. */
export interface KinematicSample {
  /** Hub travel relative to the factory reference height, mm. Positive = compression. */
  travelMm: number;
  camberDeg: number;
  toeDeg?: number;
  /** Change in half-track at the contact patch, mm. */
  trackDeltaMm?: number;
}

export interface CornerKinematics {
  architecture: SuspensionArchitecture;
  /** Factory bump travel from the reference height to the stop, mm. */
  bumpTravelMm: number;
  reboundTravelMm?: number;
  /** A real measured curve. When present it supersedes the typical rate. */
  curve?: KinematicSample[];
  curveGrade?: EvidenceGrade;
  /**
   * Steering axis data. Without it, steering-dependent analyses are
   * reported as indeterminate rather than guessed at.
   */
  steeringAxis?: {
    scrubRadiusMm: number;
    kingpinInclinationDeg: number;
    casterDeg: number;
    maxSteerDeg: number;
    grade: EvidenceGrade;
  };
}

export interface SuspensionInput {
  package: SuspensionPackage;
  /** Static drop from the factory reference height, mm. */
  dropMm: number;
  /** Additional compression from the static height, mm. */
  compressionMm?: number;
  steeringDeg?: number;
  /** Explicit camber override. When given, it is treated as measured. */
  camberDegOverride?: number | null;
  camberOverrideGrade?: EvidenceGrade;
  /** Explicit remaining travel override, mm. */
  travelMmOverride?: number | null;
  /**
   * Grade for the travel override. A synthetic fixture whose geometry is
   * defined rather than measured legitimately declares this; a user
   * typing a tape measurement should leave it at community_reported.
   */
  travelGradeOverride?: EvidenceGrade;
}

export interface CornerState {
  dropMm: number;
  compressionMm: number;
  /** Total hub rise from the factory reference height, mm. */
  totalTravelMm: number;
  camberDeg: number;
  camberGrade: EvidenceGrade;
  /** Travel remaining from the current height to the bump stop, mm. */
  remainingTravelMm: number;
  travelGrade: EvidenceGrade;
  trackDeltaMm: number;
  steeringDeg: number;
  steeringSupported: boolean;
  notes: string[];
}

function interpolateCurve(curve: KinematicSample[], travelMm: number): KinematicSample | null {
  if (curve.length === 0) return null;
  const sorted = [...curve].sort((a, b) => a.travelMm - b.travelMm);
  const first = sorted[0]!, last = sorted[sorted.length - 1]!;
  if (travelMm <= first.travelMm) return first;
  if (travelMm >= last.travelMm) return last;
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]!, b = sorted[i + 1]!;
    if (travelMm >= a.travelMm && travelMm <= b.travelMm) {
      const span = b.travelMm - a.travelMm;
      const f = span === 0 ? 0 : (travelMm - a.travelMm) / span;
      return {
        travelMm,
        camberDeg: a.camberDeg + (b.camberDeg - a.camberDeg) * f,
        toeDeg: (a.toeDeg ?? 0) + ((b.toeDeg ?? 0) - (a.toeDeg ?? 0)) * f,
        trackDeltaMm: (a.trackDeltaMm ?? 0) + ((b.trackDeltaMm ?? 0) - (a.trackDeltaMm ?? 0)) * f,
      };
    }
  }
  return last;
}

/**
 * Resolve the geometric state of one corner.
 *
 * Preference order for camber, highest first:
 *   1. an explicit user measurement
 *   2. a measured kinematic curve for this corner
 *   3. the architecture's typical gain rate  (grade: estimated)
 */
export function resolveCornerState(
  kin: CornerKinematics, input: SuspensionInput,
): CornerState {
  const notes: string[] = [];
  const dropMm = Math.max(0, input.dropMm);
  const compressionMm = Math.max(0, input.compressionMm ?? 0);
  const totalTravelMm = dropMm + compressionMm;

  let camberDeg: number;
  let camberGrade: EvidenceGrade;
  let trackDeltaMm = 0;

  if (input.camberDegOverride !== null && input.camberDegOverride !== undefined) {
    camberDeg = input.camberDegOverride;
    camberGrade = input.camberOverrideGrade ?? 'community_reported';
    notes.push('Camber taken from your measurement.');
    if (compressionMm > 0 && kin.curve) {
      const atStatic = interpolateCurve(kin.curve, dropMm);
      const atComp = interpolateCurve(kin.curve, totalTravelMm);
      if (atStatic && atComp) camberDeg += atComp.camberDeg - atStatic.camberDeg;
    } else if (compressionMm > 0) {
      camberDeg += (CAMBER_GAIN_PER_10MM[kin.architecture] * compressionMm) / 10;
      notes.push('Camber change under compression uses the architecture rate, not a measured curve.');
    }
  } else if (kin.curve && kin.curve.length > 1) {
    const s = interpolateCurve(kin.curve, totalTravelMm)!;
    camberDeg = s.camberDeg;
    trackDeltaMm = s.trackDeltaMm ?? 0;
    camberGrade = kin.curveGrade ?? 'professionally_measured';
    notes.push('Camber from this corner’s measured kinematic curve.');
  } else {
    camberDeg = (CAMBER_GAIN_PER_10MM[kin.architecture] * totalTravelMm) / 10;
    camberGrade = 'estimated';
    notes.push(`Camber estimated from a typical ${kin.architecture.replace(/_/g, ' ')} gain rate. Not a measured curve for this car.`);
  }

  let remainingTravelMm: number;
  let travelGrade: EvidenceGrade;
  if (input.travelMmOverride !== null && input.travelMmOverride !== undefined) {
    remainingTravelMm = Math.max(0, input.travelMmOverride - compressionMm);
    travelGrade = input.travelGradeOverride ?? 'community_reported';
  } else {
    const factor = TRAVEL_FACTOR[input.package] ?? 1;
    // Lowering on stock-length hardware spends roughly 55% of the drop
    // out of available bump travel; the rest comes from the stop itself
    // compressing earlier. Estimated.
    remainingTravelMm = Math.max(0, kin.bumpTravelMm * factor - dropMm * 0.55 - compressionMm);
    travelGrade = 'estimated';
  }

  const steeringDeg = input.steeringDeg ?? 0;
  const steeringSupported = !!kin.steeringAxis;
  if (steeringDeg !== 0 && !steeringSupported)
    notes.push('No steering-axis geometry for this corner, so steered states cannot be analysed. Steering-dependent results are reported as indeterminate.');

  return {
    dropMm, compressionMm, totalTravelMm,
    camberDeg: round(camberDeg, 2), camberGrade,
    remainingTravelMm: round(remainingTravelMm, 1), travelGrade,
    trackDeltaMm: round(trackDeltaMm, 1),
    steeringDeg, steeringSupported, notes,
  };
}

/**
 * The set of conditions the engine evaluates. A verdict is only ever
 * about the conditions in this list; continuous motion between them is
 * not guaranteed, which the report states explicitly.
 */
export interface EvaluationCondition {
  id: string;
  label: string;
  compressionFraction: number;
  steeringFraction: number;
  requiresSteeringGeometry: boolean;
}

export const STANDARD_CONDITIONS: EvaluationCondition[] = [
  { id: 'static', label: 'Static', compressionFraction: 0, steeringFraction: 0, requiresSteeringGeometry: false },
  { id: 'half_bump', label: 'Half bump', compressionFraction: 0.5, steeringFraction: 0, requiresSteeringGeometry: false },
  { id: 'full_bump', label: 'Full bump', compressionFraction: 1, steeringFraction: 0, requiresSteeringGeometry: false },
  { id: 'half_lock', label: 'Half lock', compressionFraction: 0, steeringFraction: 0.5, requiresSteeringGeometry: true },
  { id: 'full_lock', label: 'Full lock', compressionFraction: 0, steeringFraction: 1, requiresSteeringGeometry: true },
  { id: 'lock_and_bump', label: 'Lock + bump', compressionFraction: 1, steeringFraction: 1, requiresSteeringGeometry: true },
];

export const clampDeg = (d: number): number => clamp(d, -15, 15);
