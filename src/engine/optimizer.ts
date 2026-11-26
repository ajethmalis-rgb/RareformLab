import { round, mmToIn } from './units';
import type { ClearanceVerdict, ConstructionType, ArchModification, Dimension } from './types';
import { isVerified } from './types';
import {
  assembleWheel, type BarrelComponent, type DiscComponent, type AssemblyResult,
} from './wheel';
import {
  mountTire, findTireSizes, tireLabel,
  type MountedTire, type TireSize, type TireData, type SidewallClass,
} from './tire';
import {
  analyseClearance, compareToBaseline, DEFAULT_THRESHOLDS,
  type CornerEnvelope, type ClearanceReport, type Thresholds, type FitmentDelta,
} from './collision';
import { resolveCornerState, type SuspensionInput } from './kinematics';

/** What the builder is optimising for. */
export type StanceGoal =
  | 'conservative_street'
  | 'oem_plus'
  | 'nearly_flush'
  | 'max_lip'
  | 'max_width'
  | 'show_parked';

export const GOAL_LABEL: Record<StanceGoal, string> = {
  conservative_street: 'Conservative street',
  oem_plus: 'OEM-plus',
  nearly_flush: 'Nearly flush',
  max_lip: 'Maximum lip depth',
  max_width: 'Maximum width',
  show_parked: 'Parked show stance',
};

/**
 * Hard constraints. These are never silently relaxed. A candidate that
 * violates one is excluded, and the reason is reported so the user can
 * decide to relax it themselves.
 */
export interface Constraints {
  /** No rolling, pulling or cutting. Overrides any arch credit. */
  untouchedFactoryMetal: boolean;
  allowSpacers: boolean;
  maxSpacerMm: number;
  /** Reject anything past the maker's approved rim width. */
  approvedTiresOnly: boolean;
  /** Reject aggressive and beyond-spec sidewalls regardless of approval data. */
  noStretchedTires: boolean;
  minClearanceMm: number;
  /** Street use demands the dynamic conditions pass, not just static. */
  drivingUse: boolean;
  /** Only accept candidates whose governing geometry is verified. */
  requireVerifiedGeometry: boolean;
  maxSpeedoDeviationPct: number;
}

export const DEFAULT_CONSTRAINTS: Constraints = {
  untouchedFactoryMetal: true,
  allowSpacers: false,
  maxSpacerMm: 0,
  approvedTiresOnly: true,
  noStretchedTires: true,
  minClearanceMm: 10,
  drivingUse: true,
  requireVerifiedGeometry: false,
  maxSpeedoDeviationPct: 3,
};

export interface OptimizeRequest {
  envelope: CornerEnvelope;
  suspension: SuspensionInput;
  construction: ConstructionType;
  diameterIn: number;
  /** Candidate components from the catalogue. */
  outerLips: BarrelComponent[];
  innerBarrels: BarrelComponent[];
  completeShells?: BarrelComponent[];
  /** Disc variants of the chosen face, differing in pad depth. */
  discs: DiscComponent[];
  baselineWheelGeometry: Parameters<typeof compareToBaseline>[2];
  baselineTire: MountedTire;
  goal: StanceGoal;
  constraints?: Constraints;
  thresholds?: Thresholds;
  archMod?: ArchModification;
  /** Rim widths worth considering, inches. */
  widthRange?: [number, number];
  sidewallPreference?: SidewallClass | 'any';
  /** Measured barrel wall thickness, passed through to the solver. */
  barrelWallMm?: Dimension;
  /**
   * Manufacturer data for a candidate tyre size. Without it the tyre's
   * overall diameter is derived from the nominal designation and graded
   * `estimated`, so every clearance result that depends on tyre radius
   * lands in `unverified`. That is correct: two tyres stamped the same
   * size can differ by a couple of percent in overall diameter.
   */
  tireDataFor?: (size: TireSize) => TireData | undefined;
  spacerOptions?: number[];
  limit?: number;
}

export interface Candidate {
  id: string;
  assembly: AssemblyResult;
  tire: MountedTire;
  tireSize: TireSize;
  spacerMm: number;
  clearance: ClearanceReport;
  delta: FitmentDelta;
  /** Formal verdict, which honours the evidence rule. */
  verdict: ClearanceVerdict;
  /** What the geometry says taking inputs at face value. */
  modelledVerdict: ClearanceVerdict;
  worstDistanceMm: number | null;
  bindingComponent: string | null;
  /** True only when every governing dimension is verified AND it passes. */
  verified: boolean;
  score: number;
  tradeoffs: string[];
  violations: string[];
  components: {
    outerLip?: string; innerBarrel?: string; completeShell?: string; disc: string;
  };
}

export interface OptimizeResult {
  /** Candidates that satisfy every hard constraint on verified geometry. */
  verified: Candidate[];
  /** Candidates that satisfy the constraints but rest on unverified data. */
  unverified: Candidate[];
  /** Rejected, with the reason. Shown so constraints stay visible. */
  rejected: { id: string; violations: string[] }[];
  searched: number;
  limitations: string[];
}

function goalScore(goal: StanceGoal, c: Candidate): number {
  const lip = c.assembly.exposedLipIn;
  const width = c.assembly.achievedWidthIn;
  const poke = Number.isFinite(c.clearance.pokeMm) ? c.clearance.pokeMm : 0;
  const worst = c.worstDistanceMm ?? 0;
  const stretch = Math.abs(c.tire.sidewall.stretchIn);

  switch (goal) {
    case 'conservative_street':
      // Reward margin above all; punish poke and stretch hard.
      return worst * 2.5 - Math.max(0, poke) * 2 - stretch * 18;
    case 'oem_plus':
      return worst * 1.2 - Math.abs(poke + 8) * 1.6 - stretch * 10 + width * 2;
    case 'nearly_flush':
      // Flush means the assembly's widest point sits just inside the lip.
      return 42 - Math.abs(poke + 3) * 4 + worst * 0.5 - stretch * 6;
    case 'max_lip':
      return lip * 16 + worst * 0.35 - stretch * 4;
    case 'max_width':
      return width * 11 + worst * 0.3 - stretch * 3;
    case 'show_parked':
      return lip * 9 + width * 5 - Math.max(0, -poke) * 0.6;
  }
}

export function optimizeFitment(req: OptimizeRequest): OptimizeResult {
  const cons = req.constraints ?? DEFAULT_CONSTRAINTS;
  const th = req.thresholds ?? {
    ...DEFAULT_THRESHOLDS,
    archStaticMm: Math.max(DEFAULT_THRESHOLDS.archStaticMm, cons.minClearanceMm),
    archDynamicMm: Math.max(DEFAULT_THRESHOLDS.archDynamicMm, cons.minClearanceMm),
    innerMm: Math.max(DEFAULT_THRESHOLDS.innerMm, cons.minClearanceMm),
  };

  // An untouched-metal constraint cancels any arch credit, whatever the
  // caller passed in.
  const archMod: ArchModification = cons.untouchedFactoryMetal
    ? 'untouched'
    : (req.archMod ?? 'untouched');

  const spacerOptions = cons.allowSpacers
    ? (req.spacerOptions ?? [0, 3, 5, 8, 10, 12, 15]).filter(s => s <= cons.maxSpacerMm)
    : [0];

  const state = resolveCornerState(req.envelope.kinematics, req.suspension);
  const [wMin, wMax] = req.widthRange ?? [6, 12];

  const verified: Candidate[] = [];
  const unverified: Candidate[] = [];
  const rejected: { id: string; violations: string[] }[] = [];
  let searched = 0;

  const shells = req.construction === 'two_piece'
    ? (req.completeShells ?? [])
    : [undefined];
  const lips = req.construction === 'two_piece' ? [undefined] : req.outerLips;
  const barrels = req.construction === 'two_piece' ? [undefined] : req.innerBarrels;

  for (const disc of req.discs) {
    for (const shell of shells) {
      for (const lip of lips) {
        for (const barrel of barrels) {
          const assembly = assembleWheel({
            construction: req.construction,
            diameterIn: req.diameterIn,
            outerLip: lip, innerBarrel: barrel, completeShell: shell,
            disc, spacerMm: 0,
          });
          if (!assembly.geometry) continue;
          const widthIn = assembly.achievedWidthIn;
          if (widthIn < wMin || widthIn > wMax) continue;

          void tireLabel;
          const tireCandidates = findTireSizes({
            diameterIn: req.diameterIn,
            rimWidthIn: widthIn,
            baseline: req.baselineTire,
            tolerancePct: cons.maxSpeedoDeviationPct,
            wantClass: req.sidewallPreference ?? 'any',
            approvedOnly: cons.noStretchedTires,
            limit: 6,
          });

          for (const tc of tireCandidates) {
            for (const spacerMm of spacerOptions) {
              searched++;
              const asm = spacerMm === 0 ? assembly : assembleWheel({
                construction: req.construction,
                diameterIn: req.diameterIn,
                outerLip: lip, innerBarrel: barrel, completeShell: shell,
                disc, spacerMm,
              });
              if (!asm.geometry) continue;

              const tire = mountTire(tc.size, widthIn, req.tireDataFor?.(tc.size));
              const clearance = analyseClearance({
                envelope: req.envelope, wheel: asm.geometry, tire,
                state, archMod, thresholds: th,
                wheelCentreBoreMm: disc.centreBoreMm,
                barrelWallMm: req.barrelWallMm,
              });
              const delta = compareToBaseline(
                asm.geometry, tire, req.baselineWheelGeometry, req.baselineTire,
              );

              const violations: string[] = [];
              if (asm.problems.length) violations.push(...asm.problems);

              if (cons.noStretchedTires &&
                (tire.sidewall.klass === 'aggressive' || tire.sidewall.klass === 'beyond_spec'))
                violations.push(`Sidewall is ${tire.sidewall.label.toLowerCase()} and stretched tyres are excluded.`);
              if (cons.approvedTiresOnly && tire.sidewall.withinApprovedRange === false)
                violations.push('Rim width outside the tyre maker’s approved range.');
              if (!cons.allowSpacers && spacerMm > 0)
                violations.push('Spacers are excluded.');
              if (Math.abs(delta.speedoPct) > cons.maxSpeedoDeviationPct)
                violations.push(`Speedometer deviation ${delta.speedoPct}% exceeds the ${cons.maxSpeedoDeviationPct}% limit.`);

              const relevant = cons.drivingUse
                ? clearance.results
                : clearance.results.filter(r => r.conditionId === 'static');

              for (const r of relevant) {
                if (r.modelledVerdict === 'interference') {
                  violations.push(`Predicted contact at ${r.label} (${r.conditionLabel}).`);
                  continue;
                }
                // The minimum-clearance floor is a statement about running
                // gaps. It must not be applied to assembly interfaces,
                // where a sub-millimetre figure is the correct answer: a
                // centre bore 0.25 mm over the hub spigot is a good fit,
                // not a 10 mm clearance failure.
                if (r.kind !== 'clearance') continue;
                if (r.minDistanceMm !== null && r.minDistanceMm < cons.minClearanceMm)
                  violations.push(`${r.label} at ${r.minDistanceMm} mm is under the ${cons.minClearanceMm} mm minimum (${r.conditionLabel}).`);
              }

              const governing = relevant
                .filter(r => r.kind === 'clearance')
                .map(r => r.governingGrade);
              const allVerified = governing.length > 0 && governing.every(isVerified);
              if (cons.requireVerifiedGeometry && !allVerified)
                violations.push('Governing geometry is not verified, and verified-only was requested.');

              const evaluable = relevant.filter(
                r => r.minDistanceMm !== null && r.kind === 'clearance',
              );
              const worstR = evaluable.length
                ? evaluable.reduce((a, b) => (b.minDistanceMm! < a.minDistanceMm! ? b : a))
                : null;

              const tradeoffs: string[] = [];
              if (Number.isFinite(clearance.pokeMm) && clearance.pokeMm > 5)
                tradeoffs.push(`${round(clearance.pokeMm)} mm proud of the bodywork.`);
              if (Number.isFinite(clearance.pokeMm) && clearance.pokeMm < -25)
                tradeoffs.push(`${round(-clearance.pokeMm)} mm tucked inside the arch — narrow-looking for the diameter.`);
              if (tire.sidewall.klass === 'mild') tradeoffs.push('Flange stands proud of the sidewall, so the lip takes kerb strikes.');
              if (asm.exposedLipIn < 0.75) tradeoffs.push('Very little visible lip for a multipiece build.');
              if (asm.exposedLipIn > 4.5) tradeoffs.push('Lip over 4.5 in needs a stepped or welded outer and a reinforced inner.');
              if (spacerMm > 0) tradeoffs.push(`Requires a ${spacerMm} mm spacer, which adds a stacked interface and longer studs.`);
              if (Math.abs(delta.speedoPct) > 1.5) tradeoffs.push(`Speedometer off by ${delta.speedoPct}%.`);
              const bore = relevant.find(r => r.componentId === 'centre_bore');
              if (bore && bore.minDistanceMm !== null && bore.minDistanceMm > 0.5)
                tradeoffs.push(`Centre bore is ${round(bore.minDistanceMm * 2, 1)} mm larger than the hub spigot, so hub-centric rings are required.`);

              const id = [
                disc.id, lip?.id ?? '', barrel?.id ?? '', shell?.id ?? '',
                `${tc.size.sectionMm}/${tc.size.aspect}`, `sp${spacerMm}`,
              ].filter(Boolean).join('|');

              const cand: Candidate = {
                id, assembly: asm, tire, tireSize: tc.size, spacerMm,
                clearance, delta,
                verdict: clearance.overall,
                modelledVerdict: clearance.overallModelled,
                worstDistanceMm: worstR?.minDistanceMm ?? null,
                bindingComponent: worstR?.label ?? null,
                verified: allVerified && clearance.overall === 'clear',
                score: 0, tradeoffs, violations,
                components: {
                  outerLip: lip?.id, innerBarrel: barrel?.id,
                  completeShell: shell?.id, disc: disc.id,
                },
              };
              cand.score = round(goalScore(req.goal, cand), 2);

              if (violations.length) { rejected.push({ id, violations }); continue; }
              // Unknown clearance is not a feasible verified solution.
              if (cand.verified) verified.push(cand);
              else unverified.push(cand);
            }
          }
        }
      }
    }
  }

  const byScore = (a: Candidate, b: Candidate) => b.score - a.score;
  verified.sort(byScore);
  unverified.sort(byScore);
  const limit = req.limit ?? 8;

  const limitations = [
    ...state.notes,
    'Candidates are ranked on modelled geometry for the conditions evaluated. Nothing here replaces a physical test fit.',
  ];
  if (cons.untouchedFactoryMetal)
    limitations.push('Untouched factory metal was enforced, so no arch rolling or pulling credit was applied.');
  if (!cons.allowSpacers) limitations.push('Spacers were excluded.');

  return {
    verified: verified.slice(0, limit),
    unverified: unverified.slice(0, limit),
    rejected: rejected.slice(0, 60),
    searched,
    limitations,
  };
}

export { mmToIn };
